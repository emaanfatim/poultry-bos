"use client";

import { useState } from "react";
import { validatePhone } from "../../utils/phoneValidation";

interface SaveDraftModalProps {
  isOpen: boolean;
  isSaving: boolean;
  itemCount: number;
  subtotal: string;
  currencySymbol: string;
  draftsCount: number;
  onConfirm: (customerName: string, customerPhone: string) => void;
  onCancel: () => void;
}

export function SaveDraftModal({
  isOpen,
  isSaving,
  itemCount,
  subtotal,
  currencySymbol,
  draftsCount,
  onConfirm,
  onCancel,
}: SaveDraftModalProps) {
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [phoneTouched, setPhoneTouched] = useState(false);

  if (!isOpen) return null;

  const slotsRemaining = 10 - draftsCount;
  const phoneValidation = validatePhone(customerPhone);

  // Phone error — format check if something typed, no required check (optional in draft)
  const phoneError =
    phoneTouched && customerPhone.trim() && !phoneValidation.valid
      ? phoneValidation.error
      : null;

  const canSubmit = !isSaving && (!customerPhone.trim() || phoneValidation.valid);

  const handleConfirm = () => {
    setPhoneTouched(true);
    if (customerPhone.trim() && !phoneValidation.valid) return;
    onConfirm(customerName.trim(), customerPhone.trim());
    setCustomerName("");
    setCustomerPhone("");
    setPhoneTouched(false);
  };

  const handleCancel = () => {
    setCustomerName("");
    setCustomerPhone("");
    setPhoneTouched(false);
    onCancel();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl">
        {/* Header */}
        <h2 className="text-lg font-bold text-slate-900">Save as Draft</h2>
        <p className="mt-1 text-sm text-slate-500">
          {itemCount} item{itemCount !== 1 ? "s" : ""} · {currencySymbol}{" "}
          {parseFloat(subtotal).toLocaleString()}
        </p>

        {/* Slot warning */}
        {slotsRemaining <= 3 && (
          <p className={`mt-3 rounded-lg px-3 py-2 text-xs font-medium ${
            slotsRemaining === 1
              ? "bg-red-50 text-red-700"
              : "bg-amber-50 text-amber-700"
          }`}>
            {slotsRemaining === 1
              ? "⚠️ Last draft slot available!"
              : `⚠️ ${slotsRemaining} draft slots remaining`}
          </p>
        )}

        {/* Form */}
        <div className="mt-4 space-y-3">
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">
              Customer Name
              <span className="ml-1 text-xs font-normal text-slate-400">(optional)</span>
            </label>
            <input
              type="text"
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleConfirm()}
              placeholder="e.g. Ahmed, Table 3..."
              autoFocus
              className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-400"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">
              Phone Number
              <span className="ml-1 text-xs font-normal text-slate-400">(optional)</span>
            </label>
            <input
              type="tel"
              value={customerPhone}
              onChange={(e) => setCustomerPhone(e.target.value)}
              onBlur={() => setPhoneTouched(true)}
              onKeyDown={(e) => e.key === "Enter" && handleConfirm()}
              placeholder="e.g. 0300-1234567 or +923001234567"
              className={`w-full rounded-xl border px-3 py-2.5 text-sm outline-none transition focus:ring-2 focus:ring-emerald-400 ${
                phoneError
                  ? "border-red-400 bg-red-50"
                  : "border-slate-200 focus:border-emerald-400"
              }`}
            />
            {phoneError && (
              <p className="mt-1 text-xs text-red-500">{phoneError}</p>
            )}
            {phoneTouched && customerPhone.trim() && phoneValidation.valid && (
              <p className="mt-1 text-xs text-emerald-600">✓ Valid phone number</p>
            )}
          </div>

          <p className="text-xs text-slate-400">
            Helps identify the draft when the customer returns.
          </p>
        </div>

        {/* Actions */}
        <div className="mt-5 flex gap-3">
          <button
            type="button"
            onClick={handleCancel}
            disabled={isSaving}
            className="flex-1 rounded-xl border border-slate-200 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={!canSubmit}
            className="flex-1 rounded-xl bg-amber-500 py-2.5 text-sm font-semibold text-white hover:bg-amber-600 disabled:opacity-50"
          >
            {isSaving ? "Saving..." : "Save Draft"}
          </button>
        </div>
      </div>
    </div>
  );
}
