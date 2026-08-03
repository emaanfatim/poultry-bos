"use client";

import { useEffect, useState } from "react";
import type { BillType, CartLineItem, PaymentMethod } from "@repo/types";
import { useAuth } from "../../providers/AuthProvider";
import { useI18n } from "../../providers/I18nProvider";
import { fetchMyDiscountSettings, formatCurrency } from "../../services/sales";
import { validatePhone } from "../../utils/phoneValidation";

interface CustomerInfo {
  name: string;
  phone: string;
}

type DiscountType = "percentage" | "flat";

export interface DiscountInput {
  type: DiscountType;
  value: number;
}

interface PaymentModalProps {
  total: string;
  items?: CartLineItem[];
  isOpen: boolean;
  isProcessing: boolean;
  // Full active payment-method catalog (owner-managed). Shown as tabs for
  // priced bills so the cashier picks one at checkout; unpriced (delivery
  // note) bills don't show a customer-facing payment step, so we fall back
  // to a sensible default behind the scenes (see defaultPaymentMethodId).
  paymentMethods?: PaymentMethod[];
  onConfirm: (
    billType: BillType,
    customer: CustomerInfo,
    paymentMethodId: string,
    discount?: DiscountInput,
  ) => void;
  onCancel: () => void;
}

// Prefer "Cash" as the initial tab/default when nothing else is selected
// yet — matches how the till/cash-drawer flow already assumes cash unless
// told otherwise.
function pickDefaultMethod(methods: PaymentMethod[]): PaymentMethod | null {
  if (methods.length === 0) return null;
  return methods.find((m) => m.name.toLowerCase().includes("cash")) ?? methods[0]!;
}

export function PaymentModal({
  total,
  items = [],
  isOpen,
  isProcessing,
  paymentMethods = [],
  onConfirm,
  onCancel,
}: PaymentModalProps) {
  const { tenant, user, token } = useAuth();
  const { t } = useI18n();

  const [billType, setBillType] = useState<BillType>("priced");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [touched, setTouched] = useState({ name: false, phone: false });

  const activeMethods = paymentMethods.filter((m) => m.isActive);
  const [selectedPaymentMethodId, setSelectedPaymentMethodId] = useState<string | null>(null);

  // Re-pick a default whenever the modal opens or the catalog changes, so a
  // stale selection from a previous sale never carries over silently.
  useEffect(() => {
    if (!isOpen) return;
    const fallback = pickDefaultMethod(activeMethods);
    setSelectedPaymentMethodId(fallback?.id ?? null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, paymentMethods]);

  const selectedPaymentMethod =
    activeMethods.find((m) => m.id === selectedPaymentMethodId) ?? null;
  const requiresRounding = selectedPaymentMethod?.requiresRounding ?? false;
  const roundingMethod = selectedPaymentMethod?.roundingMethod ?? "exact";

  // Discount module — only surfaced at all when the owner has granted this
  // cashier canApplyDiscount. Which of the two type buttons is enabled
  // depends independently on whether that cap is set (null cap = that
  // discount type isn't permitted for this cashier).
  const canDiscount = user?.canApplyDiscount ?? false;
  const maxPercentage = user?.maxDiscountPercentage ? parseFloat(user.maxDiscountPercentage) : null;
  const maxFlat = user?.maxDiscountFlatAmount ? parseFloat(user.maxDiscountFlatAmount) : null;
  const isRestrictedToProducts = user?.discountRestrictedToProducts ?? false;

  const [showDiscount, setShowDiscount] = useState(false);
  const [discountType, setDiscountType] = useState<DiscountType>(
    maxPercentage !== null ? "percentage" : "flat",
  );
  const [discountValue, setDiscountValue] = useState("");

  // When this cashier is restricted to specific products, fetch exactly
  // which product IDs are approved so the cart can be split into
  // eligible / not-eligible lines before the cashier types a discount in —
  // rather than them finding out only after a rejected sale.
  const [allowedProductIds, setAllowedProductIds] = useState<Set<string> | null>(null);
  const [loadingAllowed, setLoadingAllowed] = useState(false);

  useEffect(() => {
    if (!isOpen || !token || !canDiscount || !isRestrictedToProducts) return;
    let cancelled = false;
    setLoadingAllowed(true);
    fetchMyDiscountSettings(token)
      .then((settings) => {
        if (!cancelled) setAllowedProductIds(new Set(settings.allowedProductIds));
      })
      .catch(() => {
        if (!cancelled) setAllowedProductIds(new Set());
      })
      .finally(() => {
        if (!cancelled) setLoadingAllowed(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isOpen, token, canDiscount, isRestrictedToProducts]);

  const requireCustomer = billType === "unpriced";

  const totalNumber = parseFloat(total) || 0;

  // Cart split by discount eligibility. Only meaningful once
  // allowedProductIds has loaded for a restricted cashier; unrestricted
  // cashiers (or before the fetch resolves) treat the whole cart as eligible,
  // matching what the backend does.
  const eligibleItems =
    isRestrictedToProducts && allowedProductIds
      ? items.filter((item) => allowedProductIds.has(item.productId))
      : items;
  const eligibleSubtotal =
    isRestrictedToProducts && allowedProductIds
      ? eligibleItems.reduce((sum, item) => sum + parseFloat(item.lineTotal), 0)
      : totalNumber;

  const discountNumber = parseFloat(discountValue) || 0;
  const discountCap = discountType === "percentage" ? maxPercentage : maxFlat;
  const discountExceedsCap =
    showDiscount && discountCap !== null && discountNumber > discountCap;
  const discountTypeAllowed = discountType === "percentage" ? maxPercentage !== null : maxFlat !== null;
  const noEligibleProductsInCart =
    isRestrictedToProducts && allowedProductIds !== null && eligibleSubtotal <= 0;

  // Preview discount off the eligible subtotal (whole cart, unless this
  // cashier is restricted — mirrors the server-side calculation in
  // services/api/src/routes/sales.ts so the number shown here never
  // over-promises what checkout will actually apply).
  const previewDiscountAmount =
    showDiscount && discountNumber > 0 && !noEligibleProductsInCart
      ? discountType === "percentage"
        ? (eligibleSubtotal * discountNumber) / 100
        : Math.min(discountNumber, eligibleSubtotal)
      : 0;
  const previewTotal = Math.max(0, totalNumber - previewDiscountAmount);

  if (!isOpen) return null;

  // Name error — only required for unpriced
  const nameError =
    requireCustomer && touched.name && !name.trim()
      ? "Customer name is required for unpriced bills"
      : null;

  // Phone validation — format check always runs if something is typed,
  // required check only for unpriced
  const phoneValidation = validatePhone(phone);
  const phoneError = (() => {
    if (!touched.phone) return null;
    if (requireCustomer && !phone.trim()) return "Phone number is required for unpriced bills";
    if (phone.trim() && !phoneValidation.valid) return phoneValidation.error;
    return null;
  })();

  const discountValid =
    !showDiscount ||
    discountNumber <= 0 ||
    (discountTypeAllowed && !discountExceedsCap && !noEligibleProductsInCart);

  // Priced bills need a payment method picked; unpriced bills never show the
  // tabs so they just need *some* default method to exist behind the scenes.
  const needsPaymentMethodChoice = billType === "priced";
  const fallbackMethod = pickDefaultMethod(activeMethods);
  const effectivePaymentMethodId = needsPaymentMethodChoice
    ? selectedPaymentMethodId
    : (selectedPaymentMethodId ?? fallbackMethod?.id ?? null);

  const canSubmit =
    !isProcessing &&
    discountValid &&
    !!effectivePaymentMethodId &&
    (requireCustomer
      ? name.trim().length > 0 &&
        phone.trim().length > 0 &&
        phoneValidation.valid
      : !phone.trim() || phoneValidation.valid); // if priced and phone typed, must be valid format

  const handleConfirm = () => {
    setTouched({ name: true, phone: true });
    if (requireCustomer) {
      if (!name.trim() || !phone.trim() || !phoneValidation.valid) return;
    } else {
      if (phone.trim() && !phoneValidation.valid) return;
    }
    if (!discountValid) return;
    if (!effectivePaymentMethodId) return;

    const discount: DiscountInput | undefined =
      showDiscount && discountNumber > 0
        ? { type: discountType, value: discountNumber }
        : undefined;

    onConfirm(billType, { name: name.trim(), phone: phone.trim() }, effectivePaymentMethodId, discount);
  };

  const resetAndCancel = () => {
    setBillType("priced");
    setName("");
    setPhone("");
    setTouched({ name: false, phone: false });
    setShowDiscount(false);
    setDiscountValue("");
    onCancel();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
        <h2 className="text-xl font-bold text-slate-900">{t.payment.title}</h2>

        {showDiscount && previewDiscountAmount > 0 ? (
          <div className="mt-4 space-y-1">
            <p className="text-sm text-slate-500 line-through">
              {formatCurrency(total, tenant?.currencySymbol ?? "Rs")}
            </p>
            <p className="text-3xl font-bold text-emerald-700">
              {formatCurrency(previewTotal.toFixed(2), tenant?.currencySymbol ?? "Rs")}
            </p>
            <p className="text-xs font-medium text-amber-600">
              {formatCurrency(previewDiscountAmount.toFixed(2), tenant?.currencySymbol ?? "Rs")}{" "}
              {t.discount.amountOff}
            </p>
          </div>
        ) : (
          <p className="mt-4 text-3xl font-bold text-emerald-700">
            {formatCurrency(total, tenant?.currencySymbol ?? "Rs")}
          </p>
        )}

        {/* Discount — only shown if the owner has granted this cashier permission */}
        {canDiscount && (
          <div className="mt-5">
            {!showDiscount ? (
              <button
                type="button"
                onClick={() => setShowDiscount(true)}
                className="text-sm font-medium text-emerald-700 underline underline-offset-2 hover:text-emerald-800"
              >
                {t.discount.add}
              </button>
            ) : (
              <div className="rounded-xl border border-slate-200 p-3">
                <div className="mb-2 flex items-center justify-between">
                  <p className="text-sm font-medium text-slate-700">{t.discount.label}</p>
                  <button
                    type="button"
                    onClick={() => {
                      setShowDiscount(false);
                      setDiscountValue("");
                    }}
                    className="text-xs font-medium text-slate-400 hover:text-slate-600"
                  >
                    {t.discount.remove}
                  </button>
                </div>

                <div className="flex gap-2">
                  <div className="flex overflow-hidden rounded-lg border border-slate-200">
                    <button
                      type="button"
                      disabled={maxPercentage === null}
                      onClick={() => setDiscountType("percentage")}
                      className={`px-3 py-2 text-sm font-semibold transition ${
                        discountType === "percentage"
                          ? "bg-emerald-600 text-white"
                          : "bg-white text-slate-600 hover:bg-slate-50"
                      } disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-300`}
                    >
                      {t.discount.percentage}
                    </button>
                    <button
                      type="button"
                      disabled={maxFlat === null}
                      onClick={() => setDiscountType("flat")}
                      className={`px-3 py-2 text-sm font-semibold transition ${
                        discountType === "flat"
                          ? "bg-emerald-600 text-white"
                          : "bg-white text-slate-600 hover:bg-slate-50"
                      } disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-300`}
                    >
                      {t.discount.flat}
                    </button>
                  </div>

                  <input
                    type="number"
                    inputMode="decimal"
                    min={0}
                    value={discountValue}
                    onChange={(e) => setDiscountValue(e.target.value)}
                    placeholder={
                      discountType === "percentage"
                        ? t.discount.valuePlaceholderPercentage
                        : t.discount.valuePlaceholderFlat
                    }
                    className={`w-full rounded-lg border px-3 py-2 text-sm outline-none transition focus:ring-2 focus:ring-emerald-400 ${
                      discountExceedsCap
                        ? "border-red-400 bg-red-50"
                        : "border-slate-200 focus:border-emerald-400"
                    }`}
                  />
                </div>

                {discountCap !== null && (
                  <p className="mt-1.5 text-xs text-slate-400">
                    {t.discount.maxAllowed}: {discountCap}
                    {discountType === "percentage" ? "%" : ` ${tenant?.currencySymbol ?? "Rs"}`}
                  </p>
                )}
                {discountExceedsCap && (
                  <p className="mt-1 text-xs text-red-500">
                    {t.discount.maxAllowed}: {discountCap}
                    {discountType === "percentage" ? "%" : ` ${tenant?.currencySymbol ?? "Rs"}`}
                  </p>
                )}
                {isRestrictedToProducts && (
                  <div className="mt-2.5 rounded-lg bg-amber-50 p-2.5">
                    {loadingAllowed ? (
                      <p className="text-xs text-amber-700">Checking approved products…</p>
                    ) : (
                      <>
                        <p className="text-xs font-medium text-amber-700">
                          {t.discount.restrictedNotice}
                        </p>
                        {items.length > 0 && (
                          <ul className="mt-1.5 space-y-1">
                            {items.map((item) => {
                              const isEligible = allowedProductIds?.has(item.productId) ?? false;
                              return (
                                <li
                                  key={item.productId}
                                  className="flex items-center justify-between gap-2 text-xs"
                                >
                                  <span
                                    className={
                                      isEligible
                                        ? "text-slate-700"
                                        : "text-slate-400 line-through"
                                    }
                                  >
                                    {isEligible ? "✓" : "✕"} {item.productName}
                                  </span>
                                  <span
                                    className={isEligible ? "text-slate-500" : "text-slate-300"}
                                  >
                                    {formatCurrency(item.lineTotal, tenant?.currencySymbol ?? "Rs")}
                                  </span>
                                </li>
                              );
                            })}
                          </ul>
                        )}
                        {noEligibleProductsInCart && (
                          <p className="mt-1.5 text-xs font-medium text-red-600">
                            {t.discount.noEligibleItems}
                          </p>
                        )}
                        {!noEligibleProductsInCart && allowedProductIds && (
                          <p className="mt-1.5 border-t border-amber-100 pt-1.5 text-xs text-amber-700">
                            Discount applies to{" "}
                            {formatCurrency(eligibleSubtotal.toFixed(2), tenant?.currencySymbol ?? "Rs")}{" "}
                            of eligible items only.
                          </p>
                        )}
                      </>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Bill Type toggle */}
        <div className="mt-5">
          <p className="mb-2 text-sm font-medium text-slate-700">{t.receipt.billType}</p>
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => setBillType("priced")}
              className={`rounded-xl border-2 p-3 text-left transition-all ${
                billType === "priced"
                  ? "border-emerald-500 bg-emerald-50"
                  : "border-slate-200 hover:border-slate-300"
              }`}
            >
              <p className="text-sm font-semibold text-slate-900">{t.receipt.pricedBill}</p>
              <p className="mt-0.5 text-xs text-slate-500">{t.receipt.pricedBillDesc}</p>
            </button>

            <button
              type="button"
              onClick={() => setBillType("unpriced")}
              className={`rounded-xl border-2 p-3 text-left transition-all ${
                billType === "unpriced"
                  ? "border-emerald-500 bg-emerald-50"
                  : "border-slate-200 hover:border-slate-300"
              }`}
            >
              <p className="text-sm font-semibold text-slate-900">{t.receipt.deliveryNote}</p>
              <p className="mt-0.5 text-xs text-slate-500">{t.receipt.deliveryNoteDesc}</p>
            </button>
          </div>
        </div>

        {/* Payment method — owner-managed catalog, tabs only for priced
            bills. Unpriced/delivery-note bills don't take payment at
            counter, so there's nothing for the cashier to pick here. */}
        {needsPaymentMethodChoice && (
          <div className="mt-5">
            <p className="mb-2 text-sm font-medium text-slate-700">Payment Method</p>
            {activeMethods.length === 0 ? (
              <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">
                No active payment methods found. Ask the owner to add one in Settings.
              </p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {activeMethods.map((method) => (
                  <button
                    key={method.id}
                    type="button"
                    onClick={() => setSelectedPaymentMethodId(method.id)}
                    className={`rounded-xl border-2 px-4 py-2 text-sm font-semibold transition-all ${
                      selectedPaymentMethodId === method.id
                        ? "border-emerald-500 bg-emerald-50 text-emerald-700"
                        : "border-slate-200 text-slate-600 hover:border-slate-300"
                    }`}
                  >
                    {method.name}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Customer info */}
        <div className="mt-5 space-y-3">
          <div>
            <label className="mb-1 flex items-center gap-1 text-sm font-medium text-slate-700">
              Customer Name
              {requireCustomer ? (
                <span className="text-red-500">*</span>
              ) : (
                <span className="text-xs font-normal text-slate-400">(optional)</span>
              )}
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onBlur={() => setTouched((prev) => ({ ...prev, name: true }))}
              placeholder="e.g. Ahmed Ali"
              className={`w-full rounded-xl border px-3 py-2.5 text-sm outline-none transition focus:ring-2 focus:ring-emerald-400 ${
                nameError ? "border-red-400 bg-red-50" : "border-slate-200 focus:border-emerald-400"
              }`}
            />
            {nameError && <p className="mt-1 text-xs text-red-500">{nameError}</p>}
          </div>

          <div>
            <label className="mb-1 flex items-center gap-1 text-sm font-medium text-slate-700">
              Phone Number
              {requireCustomer ? (
                <span className="text-red-500">*</span>
              ) : (
                <span className="text-xs font-normal text-slate-400">(optional)</span>
              )}
            </label>
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              onBlur={() => setTouched((prev) => ({ ...prev, phone: true }))}
              placeholder="e.g. 0300-1234567 or +923001234567"
              className={`w-full rounded-xl border px-3 py-2.5 text-sm outline-none transition focus:ring-2 focus:ring-emerald-400 ${
                phoneError ? "border-red-400 bg-red-50" : "border-slate-200 focus:border-emerald-400"
              }`}
            />
            {phoneError && <p className="mt-1 text-xs text-red-500">{phoneError}</p>}
            {/* Show green tick when valid */}
            {touched.phone && phone.trim() && phoneValidation.valid && !phoneError && (
              <p className="mt-1 text-xs text-emerald-600">✓ Valid phone number</p>
            )}
          </div>

          {requireCustomer && (
            <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">
              Customer details are required for unpriced (delivery note) bills.
            </p>
          )}
        </div>

        {requiresRounding && roundingMethod !== "exact" && (
          <div className="mt-5 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-500">
            This bill will be{" "}
            <span className="font-medium text-slate-700">
              {roundingMethod === "round_up" ? "rounded up" : "rounded down"}
            </span>{" "}
            automatically — set by the owner for this payment method.
          </div>
        )}

        <div className="mt-6 flex gap-3">
          <button
            type="button"
            onClick={resetAndCancel}
            disabled={isProcessing}
            className="flex-1 rounded-xl border border-slate-200 py-3 font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            {t.payment.cancel}
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={!canSubmit}
            className="relative flex-1 rounded-xl bg-emerald-600 py-3 font-semibold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-70"
          >
            {isProcessing ? (
              <span className="flex items-center justify-center gap-2">
                <svg className="h-4 w-4 animate-spin" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Processing...
              </span>
            ) : (
              t.payment.confirm
            )}
          </button>
        </div>

        {isProcessing && (
          <p className="mt-3 text-center text-xs text-slate-400">
            Please wait, do not close this window...
          </p>
        )}
      </div>
    </div>
  );
}