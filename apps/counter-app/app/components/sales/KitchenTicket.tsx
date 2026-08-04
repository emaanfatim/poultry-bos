"use client";

import type { Transaction } from "@repo/types";
import { useAuth } from "../../providers/AuthProvider";

interface KitchenTicketProps {
  transaction: Transaction;
  onPrint: () => void;
  onClose: () => void;
}

// A fulfillment slip for the kitchen / prep station.
// Deliberately contains NO prices — just what needs to be made and any
// special instructions. Works for any type of business (café, butcher,
// bakery, etc.) because all product-domain text comes from the transaction
// data itself rather than being hardcoded here.
export function KitchenTicket({ transaction, onPrint, onClose }: KitchenTicketProps) {
  const { branch, tenant } = useAuth();

  const hasAnyModifiersOrNotes = transaction.lineItems.some(
    (line) =>
      (line.modifiers && line.modifiers.length > 0) ||
      (line.kitchenNote && line.kitchenNote.trim().length > 0),
  );

  return (
    <div className="mx-auto max-w-sm">
      {/* Action bar — hidden when printing */}
      <div className="mb-4 flex gap-3 print:hidden">
        <button
          type="button"
          onClick={onPrint}
          className="flex-1 rounded-xl bg-slate-800 py-3 font-semibold text-white hover:bg-slate-900"
        >
          🖨 Print ticket
        </button>
        <button
          type="button"
          onClick={onClose}
          className="flex-1 rounded-xl border border-slate-200 py-3 font-medium text-slate-700 hover:bg-slate-50"
        >
          Close
        </button>
      </div>

      {/* ── Ticket body — this is what prints ── */}
      <div
        id="kitchen-ticket-print"
        className="rounded-2xl border-2 border-dashed border-slate-300 bg-white p-5 font-mono print:rounded-none print:border-0 print:p-0"
      >
        {/* Header */}
        <div className="border-b-2 border-dashed border-slate-300 pb-3 text-center">
          <p className="text-xs font-bold uppercase tracking-widest text-slate-500">
            Kitchen Ticket
          </p>
          {branch?.name && (
            <p className="mt-0.5 text-sm font-bold text-slate-800">{branch.name}</p>
          )}
          {tenant?.name && !branch?.name && (
            <p className="mt-0.5 text-sm font-bold text-slate-800">{tenant.name}</p>
          )}
        </div>

        {/* Ticket meta */}
        <div className="space-y-1 border-b-2 border-dashed border-slate-300 py-3 text-sm">
          <div className="flex justify-between">
            <span className="font-bold text-slate-600">Order #</span>
            <span className="font-bold text-slate-900">{transaction.receiptNumber}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-500">Time</span>
            <span className="text-slate-800">
              {new Date(transaction.createdAt).toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
              })}
            </span>
          </div>
          {transaction.customerName && (
            <div className="flex justify-between">
              <span className="text-slate-500">For</span>
              <span className="font-semibold text-slate-800">{transaction.customerName}</span>
            </div>
          )}
        </div>

        {/* Line items */}
        <div className="py-3">
          <p className="mb-2 text-xs font-bold uppercase tracking-widest text-slate-400">
            Items
          </p>
          <ol className="space-y-4">
            {transaction.lineItems.map((line, idx) => {
              const hasModifiers = line.modifiers && line.modifiers.length > 0;
              const hasNote =
                line.kitchenNote && line.kitchenNote.trim().length > 0;

              return (
                <li key={line.id ?? `${line.productId}-${idx}`}>
                  {/* Item name + quantity — large and easy to read across a prep counter */}
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-base font-bold text-slate-900">
                      {line.productName}
                    </span>
                    <span className="shrink-0 rounded bg-slate-900 px-2 py-0.5 text-sm font-bold text-white">
                      {line.quantity} {line.unit}
                    </span>
                  </div>

                  {/* Modifier selections */}
                  {hasModifiers && (
                    <ul className="mt-1.5 space-y-0.5 pl-2 border-l-2 border-emerald-400">
                      {line.modifiers!.map((mod, mIdx) => (
                        <li
                          key={`${mod.modifierGroupId}-${mod.modifierOptionId}-${mIdx}`}
                          className="text-sm text-slate-700"
                        >
                          <span className="font-medium">{mod.label}</span>
                          {mod.quantity > 1 && (
                            <span className="ml-1 text-slate-500">×{mod.quantity}</span>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}

                  {/* Kitchen note */}
                  {hasNote && (
                    <div className="mt-1.5 rounded bg-amber-50 px-2.5 py-1.5 text-sm">
                      <span className="font-bold text-amber-700">Note: </span>
                      <span className="text-amber-900">{line.kitchenNote}</span>
                    </div>
                  )}
                </li>
              );
            })}
          </ol>
        </div>

        {/* Footer note */}
        {!hasAnyModifiersOrNotes && (
          <p className="border-t-2 border-dashed border-slate-200 pt-3 text-center text-xs text-slate-400">
            No special instructions
          </p>
        )}

        <p className="mt-3 border-t-2 border-dashed border-slate-200 pt-3 text-center text-xs text-slate-400">
          {new Date(transaction.createdAt).toLocaleDateString()}
        </p>
      </div>
    </div>
  );
}
