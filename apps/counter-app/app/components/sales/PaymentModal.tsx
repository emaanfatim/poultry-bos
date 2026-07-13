"use client";

import { useState } from "react";
import type { BillType } from "@repo/types";
import { useAuth } from "../../providers/AuthProvider";
import { useI18n } from "../../providers/I18nProvider";
import { formatCurrency } from "../../services/sales";
import { validatePhone } from "../../utils/phoneValidation";

interface CustomerInfo {
  name: string;
  phone: string;
}

interface PaymentModalProps {
  total: string;
  isOpen: boolean;
  isProcessing: boolean;
  onConfirm: (billType: BillType, customer: CustomerInfo) => void;
  onCancel: () => void;
}

export function PaymentModal({
  total,
  isOpen,
  isProcessing,
  onConfirm,
  onCancel,
}: PaymentModalProps) {
  const { tenant } = useAuth();
  const { t } = useI18n();

  const [billType, setBillType] = useState<BillType>("priced");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [touched, setTouched] = useState({ name: false, phone: false });

  const requireCustomer = billType === "unpriced";

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

  const canSubmit =
    !isProcessing &&
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
    onConfirm(billType, { name: name.trim(), phone: phone.trim() });
  };

  const resetAndCancel = () => {
    setBillType("priced");
    setName("");
    setPhone("");
    setTouched({ name: false, phone: false });
    onCancel();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
        <h2 className="text-xl font-bold text-slate-900">{t.payment.title}</h2>
        <p className="mt-2 text-sm text-slate-600">{t.payment.cashOnly}</p>
        <p className="mt-4 text-3xl font-bold text-emerald-700">
          {formatCurrency(total, tenant?.currencySymbol ?? "Rs")}
        </p>

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
