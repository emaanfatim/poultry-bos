"use client";

import { useEffect } from "react";
import type { Draft, DraftItem } from "@repo/types";

interface DraftsPanelProps {
  isOpen: boolean;
  drafts: Draft[];
  isLoading: boolean;
  currencySymbol: string;
  onResume: (draft: Draft) => void;
  onDelete: (draftId: string) => void;
  onClose: () => void;
  onRefresh: () => void;
}

function timeAgo(dateStr: string): string {
  const diff = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)} min ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} hr ago`;
  return `${Math.floor(diff / 86400)} day ago`;
}

function itemSummary(items: DraftItem[]): string {
  return items.map((i) => `${i.productName} ×${i.quantity}`).join(", ");
}

export function DraftsPanel({
  isOpen,
  drafts,
  isLoading,
  currencySymbol,
  onResume,
  onDelete,
  onClose,
  onRefresh,
}: DraftsPanelProps) {
  useEffect(() => {
    if (isOpen) onRefresh();
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-40 bg-black/30" onClick={onClose} />

      {/* Slide-over panel */}
      <div className="fixed inset-y-0 right-0 z-50 flex w-full max-w-md flex-col bg-white shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <div>
            <h2 className="text-lg font-bold text-slate-900">Saved Drafts</h2>
            <p className="text-xs text-slate-400">
              {drafts.length} of 8 slots used · drafts are saved until manually deleted
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
          >
            ✕
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-4">
          {isLoading && (
            <p className="text-center text-sm text-slate-400">Loading drafts...</p>
          )}

          {!isLoading && drafts.length === 0 && (
            <div className="mt-16 text-center">
              <p className="text-4xl">📋</p>
              <p className="mt-3 font-medium text-slate-600">No saved drafts</p>
              <p className="mt-1 text-sm text-slate-400">
                Save a cart as a draft to resume it later.
              </p>
            </div>
          )}

          {!isLoading && drafts.length > 0 && (
            <div className="space-y-3">
              {drafts.map((draft) => (
                <div
                  key={draft.id}
                  className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-bold text-amber-700">
                          #{draft.draftNumber}
                        </span>
                        {draft.customerName ? (
                          <span className="font-semibold text-slate-900">
                            {draft.customerName}
                          </span>
                        ) : (
                          <span className="text-sm italic text-slate-400">No name</span>
                        )}
                      </div>
                      <p className="mt-1 text-xs text-slate-400">
                        {timeAgo(draft.createdAt)}
                      </p>
                    </div>
                    <p className="text-lg font-bold text-slate-900">
                      {currencySymbol} {parseFloat(draft.subtotal).toLocaleString()}
                    </p>
                  </div>

                  {/* Items summary */}
                  <p className="mt-2 text-xs text-slate-500 line-clamp-2">
                    {itemSummary(draft.items)}
                  </p>

                  {/* Full item list */}
                  <div className="mt-3 space-y-1 rounded-xl bg-slate-50 px-3 py-2">
                    {draft.items.map((item, i) => (
                      <div key={i} className="flex justify-between text-xs">
                        <span className="text-slate-600">
                          {item.productName} × {item.quantity} {item.unit}
                        </span>
                        <span className="font-medium text-slate-700">
                          {currencySymbol}{" "}
                          {(parseFloat(item.rate) * item.quantity).toLocaleString()}
                        </span>
                      </div>
                    ))}
                  </div>

                  {/* Actions */}
                  <div className="mt-3 flex gap-2">
                    <button
                      type="button"
                      onClick={() => onResume(draft)}
                      className="flex-1 rounded-xl bg-emerald-600 py-2 text-sm font-semibold text-white hover:bg-emerald-700"
                    >
                      Resume
                    </button>
                    <button
                      type="button"
                      onClick={() => onDelete(draft.id)}
                      className="rounded-xl border border-red-200 px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="border-t border-slate-100 px-5 py-3">
          <p className="text-center text-xs text-slate-400">
            Resuming a draft replaces your current cart
          </p>
        </div>
      </div>
    </>
  );
}
