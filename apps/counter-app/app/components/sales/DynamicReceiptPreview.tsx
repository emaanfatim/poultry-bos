"use client";

import { useState } from "react";
import type { ReceiptBlock, ReceiptTemplate, Transaction } from "@repo/types";
import { useAuth } from "../../providers/AuthProvider";
import { useI18n } from "../../providers/I18nProvider";
import { formatCurrency } from "../../services/sales";
import { createSinglePagePdf, downloadBlob } from "../../utils/simplePdf";

interface DynamicReceiptPreviewProps {
  transaction: Transaction;
  template: ReceiptTemplate;
  onPrint: () => void;
  onNewSale: () => void;
  showNewSale?: boolean;
}

// Renders a receipt from the owner's saved block configuration (Receipt
// Designer, owner portal). This mirrors ReceiptPreview.tsx's layout and
// math but walks `template.config.blocks` instead of a fixed JSX tree, so
// the owner can hide, reorder, or relabel sections without a code change.
export function DynamicReceiptPreview({
  transaction,
  template,
  onPrint,
  onNewSale,
  showNewSale = true,
}: DynamicReceiptPreviewProps) {
  const { tenant, user, branch } = useAuth();
  const { t } = useI18n();
  const symbol = tenant?.currencySymbol ?? "Rs";
  const isPriced = transaction.billType === "priced";
  const [notes, setNotes] = useState(transaction.notes ?? "");
  const [isExportingPdf, setIsExportingPdf] = useState(false);

  const aggregatedCharges = (() => {
    const byName = new Map<
      string,
      { name: string; amount: number; calculationType: "fixed" | "percentage"; rateValue: string }
    >();
    for (const line of transaction.chargeLines ?? []) {
      const existing = byName.get(line.categoryName);
      const amount = parseFloat(line.calculatedAmount);
      if (existing) {
        existing.amount += amount;
      } else {
        byName.set(line.categoryName, {
          name: line.categoryName,
          amount,
          calculationType: line.calculationType,
          rateValue: line.rateValue,
        });
      }
    }
    return Array.from(byName.values());
  })();

  function chargeLabel(charge: {
    name: string;
    calculationType: "fixed" | "percentage";
    rateValue: string;
  }) {
    if (charge.calculationType !== "percentage") return charge.name;
    const rate = parseFloat(charge.rateValue);
    const rateLabel = Number.isInteger(rate) ? rate.toString() : rate.toFixed(2);
    return `${charge.name} (${rateLabel}%)`;
  }

  const subtotalNumber = parseFloat(transaction.subtotal);
  const discountAmountNumber = transaction.discountAmount ? parseFloat(transaction.discountAmount) : 0;
  const hasDiscount = discountAmountNumber > 0;
  const discountLabel = (() => {
    if (transaction.discountType !== "percentage" || subtotalNumber <= 0) return t.receipt.discount;
    const rate = (discountAmountNumber / subtotalNumber) * 100;
    const rateLabel = Number.isInteger(rate) ? rate.toString() : rate.toFixed(2);
    return `${t.receipt.discount} (${rateLabel}%)`;
  })();
  const subtotalAfterDiscountNumber = subtotalNumber - discountAmountNumber;
  const roundingAdjustmentNumber = transaction.roundingAdjustment
    ? parseFloat(transaction.roundingAdjustment)
    : 0;
  const hasRounding = roundingAdjustmentNumber !== 0;

  function alignClass(align?: "left" | "center" | "right") {
    if (align === "left") return "text-start";
    if (align === "right") return "text-end";
    return "text-center";
  }

  function dividerClass(style?: "solid" | "dashed" | "double") {
    if (style === "double") return "border-t-4 border-double border-slate-300";
    if (style === "dashed") return "border-t border-dashed border-slate-300";
    return "border-t border-slate-300";
  }

  // ─── PDF export — walks the same blocks the on-screen preview does ────────

  function buildPdf(): Blob {
    const pdf = createSinglePagePdf();
    const { pageWidth, margin } = pdf;

    for (const block of template.config.blocks) {
      if (!block.visible) continue;

      switch (block.type) {
        case "logo_header":
          // This minimal PDF writer draws text only (no image embedding),
          // so the logo prints as a labeled placeholder here — the on-screen
          // receipt and the printed HTML receipt (window.print()) both show
          // the actual uploaded image.
          if (block.imageKey) {
            pdf.text("[ Business Logo ]", pageWidth / 2, 9, "center");
            pdf.advance(16);
          }
          break;

        case "business_name":
          pdf.text(block.text || tenant?.name || "Business", pageWidth / 2, 16, "center");
          pdf.advance(20);
          break;

        case "subtitle": {
          if (block.text) {
            pdf.text(block.text, pageWidth / 2, 9, "center");
            pdf.advance(12);
          }
          if (tenant?.address) {
            pdf.text(tenant.address, pageWidth / 2, 9, "center");
            pdf.advance(12);
          }
          if (tenant?.phone) {
            pdf.text(tenant.phone, pageWidth / 2, 9, "center");
            pdf.advance(12);
          }
          if (branch?.name) {
            pdf.text(branch.name, pageWidth / 2, 9, "center");
            pdf.advance(12);
          }
          break;
        }

        case "divider":
          pdf.rule(4);
          break;

        case "order_metadata": {
          const f = block.metadataFields;
          if (f?.showInvoiceNumber ?? true) {
            pdf.text(`${t.receipt.receiptNo}: ${transaction.receiptNumber}`, margin, 10);
            pdf.advance(14);
          }
          if (f?.showDateTime ?? true) {
            pdf.text(`${t.receipt.date}: ${new Date(transaction.createdAt).toLocaleString()}`, margin, 10);
            pdf.advance(14);
          }
          if (f?.showCashier ?? true) {
            pdf.text(`${t.receipt.cashier}: ${transaction.createdByName ?? user?.displayName ?? ""}`, margin, 10);
            pdf.advance(14);
          }
          break;
        }

        case "customer_info":
          if ((block.showCustomerName ?? true) && transaction.customerName) {
            pdf.text(`Customer: ${transaction.customerName}`, margin, 10);
            pdf.advance(14);
          }
          if ((block.showCustomerPhone ?? true) && transaction.customerPhone) {
            pdf.text(`Phone: ${transaction.customerPhone}`, margin, 10);
            pdf.advance(14);
          }
          break;

        case "items_list": {
          pdf.text(t.prices.product, margin, 10);
          pdf.text(t.pos.quantity, isPriced ? 300 : pageWidth - margin, 10, "right");
          if (isPriced) {
            pdf.text(t.pos.rate, 405, 10, "right");
            pdf.text(t.pos.lineTotal, pageWidth - margin, 10, "right");
          }
          pdf.advance(16);

          for (const line of transaction.lineItems) {
            pdf.text(line.productName, margin, 10);
            pdf.text(`${line.quantity} ${line.unit}`, isPriced ? 300 : pageWidth - margin, 10, "right");
            if (isPriced) {
              pdf.text(formatCurrency(line.rate, symbol), 405, 10, "right");
              pdf.text(formatCurrency(line.lineTotal, symbol), pageWidth - margin, 10, "right");
            }
            pdf.advance(16);

            const showModifiers = (block.showModifiers ?? true) && line.modifiers && line.modifiers.length > 0;
            if (showModifiers) {
              for (const mod of line.modifiers!) {
                pdf.text(`  + ${mod.label}`, margin + 8, 8);
                if (isPriced && parseFloat(mod.totalCharge) > 0) {
                  pdf.text(`+${formatCurrency(mod.totalCharge, symbol)}`, pageWidth - margin, 8, "right");
                }
                pdf.advance(12);
              }
              const modTotal = parseFloat(line.modifierTotal ?? "0");
              if (isPriced && modTotal > 0) {
                pdf.text("  Extras", margin + 8, 8);
                pdf.text(formatCurrency(modTotal.toFixed(2), symbol), pageWidth - margin, 8, "right");
                pdf.advance(12);
              }
            }
          }
          break;
        }

        case "totals": {
          if (!isPriced) break;
          if (hasDiscount) {
            pdf.rule(2);
            pdf.text(t.receipt.subtotalBeforeDiscount, margin, 10);
            pdf.text(formatCurrency(transaction.subtotal, symbol), pageWidth - margin, 10, "right");
            pdf.advance(14);
            pdf.text(discountLabel, margin, 10);
            pdf.text(`- ${formatCurrency(transaction.discountAmount!, symbol)}`, pageWidth - margin, 10, "right");
            pdf.advance(14);
            pdf.text(t.receipt.subtotalAfterDiscount, margin, 10);
            pdf.text(formatCurrency(subtotalAfterDiscountNumber.toFixed(2), symbol), pageWidth - margin, 10, "right");
            pdf.advance(4);
          }
          if (aggregatedCharges.length > 0 || hasRounding) {
            pdf.rule(2);
            if (block.showTaxBreakdown ?? true) {
              for (const charge of aggregatedCharges) {
                pdf.text(chargeLabel(charge), margin, 10);
                pdf.text(formatCurrency(charge.amount.toFixed(2), symbol), pageWidth - margin, 10, "right");
                pdf.advance(14);
              }
            } else if (aggregatedCharges.length > 0) {
              const total = aggregatedCharges.reduce((sum, c) => sum + c.amount, 0);
              pdf.text("Tax & Charges", margin, 10);
              pdf.text(formatCurrency(total.toFixed(2), symbol), pageWidth - margin, 10, "right");
              pdf.advance(14);
            }
            if (hasRounding) {
              pdf.text(t.receipt.rounding, margin, 10);
              pdf.text(
                `${roundingAdjustmentNumber > 0 ? "+ " : "- "}${formatCurrency(Math.abs(roundingAdjustmentNumber).toFixed(2), symbol)}`,
                pageWidth - margin,
                10,
                "right",
              );
              pdf.advance(4);
            }
          }
          pdf.rule(2);
          pdf.text(t.pos.total, margin, 12);
          pdf.text(formatCurrency(transaction.total, symbol), pageWidth - margin, 12, "right");
          pdf.advance(18);
          break;
        }

        case "payment_info":
          if (isPriced && (block.showPaymentMethod ?? true)) {
            pdf.text(`${t.receipt.payment}: ${transaction.paymentMethodName}`, margin, 10);
            pdf.advance(14);
          }
          break;

        case "notes":
          if (notes.trim()) {
            pdf.rule(2);
            pdf.text(`${t.receipt.notes}:`, margin, 10);
            pdf.advance(14);
            for (const noteLine of notes.trim().match(/.{1,70}/g) ?? []) {
              pdf.text(noteLine, margin, 9);
              pdf.advance(12);
            }
          }
          break;

        case "footer_message":
          pdf.advance(14);
          pdf.text(block.text || t.receipt.thankYou, pageWidth / 2, 10, "center");
          pdf.advance(14);
          break;

        case "custom_text":
          if (block.text) {
            pdf.text(block.text, pageWidth / 2, 9, block.align ?? "center");
            pdf.advance(14);
          }
          break;
      }
    }

    return pdf.toBlob();
  }

  async function handleExportPdf() {
    setIsExportingPdf(true);
    try {
      downloadBlob(buildPdf(), `${transaction.receiptNumber}-${transaction.billType}.pdf`);
    } finally {
      setIsExportingPdf(false);
    }
  }

  function renderBlock(block: ReceiptBlock) {
    if (!block.visible) return null;

    switch (block.type) {
      case "logo_header":
        if (!block.imageKey) return null;
        return (
          <div
            key={block.id}
            className={`flex ${
              block.align === "left" ? "justify-start" : block.align === "right" ? "justify-end" : "justify-center"
            }`}
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- receipt logo is a stored data URL, not a static asset */}
            <img src={block.imageKey} alt="Business logo" className="max-h-16 max-w-[220px] object-contain" />
          </div>
        );

      case "business_name":
        return (
          <h2
            key={block.id}
            className={`text-xl ${block.bold !== false ? "font-bold" : "font-medium"} text-slate-900 ${alignClass(block.align)}`}
          >
            {block.text || tenant?.name}
          </h2>
        );

      case "subtitle":
        return (
          <div key={block.id} className={`mt-1 text-xs text-slate-500 ${alignClass(block.align)}`}>
            {block.text && <p>{block.text}</p>}
            {tenant?.address && <p>{tenant.address}</p>}
            {tenant?.phone && <p>{tenant.phone}</p>}
            {branch?.name && <p className="mt-1 font-medium text-slate-600">{branch.name}</p>}
          </div>
        );

      case "divider":
        return <div key={block.id} className={`my-3 ${dividerClass(block.style)}`} />;

      case "order_metadata": {
        const f = block.metadataFields;
        return (
          <div key={block.id} className="space-y-1 text-sm">
            {(f?.showInvoiceNumber ?? true) && (
              <div className="flex justify-between">
                <span className="text-slate-500">{t.receipt.receiptNo}</span>
                <span className="font-mono font-medium">{transaction.receiptNumber}</span>
              </div>
            )}
            {(f?.showDateTime ?? true) && (
              <div className="flex justify-between">
                <span className="text-slate-500">{t.receipt.date}</span>
                <span>{new Date(transaction.createdAt).toLocaleString()}</span>
              </div>
            )}
            {(f?.showCashier ?? true) && (
              <div className="flex justify-between">
                <span className="text-slate-500">{t.receipt.cashier}</span>
                <span>{transaction.createdByName ?? user?.displayName}</span>
              </div>
            )}
          </div>
        );
      }

      case "customer_info":
        if (!transaction.customerName && !transaction.customerPhone) return null;
        return (
          <div key={block.id} className="space-y-1 text-sm">
            {(block.showCustomerName ?? true) && transaction.customerName && (
              <div className="flex justify-between">
                <span className="text-slate-500">Customer</span>
                <span>{transaction.customerName}</span>
              </div>
            )}
            {(block.showCustomerPhone ?? true) && transaction.customerPhone && (
              <div className="flex justify-between">
                <span className="text-slate-500">Phone</span>
                <span>{transaction.customerPhone}</span>
              </div>
            )}
          </div>
        );

      case "items_list":
        return (
          <table key={block.id} className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-slate-500">
                <th className="py-2 text-start font-medium">{t.prices.product}</th>
                <th className="py-2 text-end font-medium">{t.pos.quantity}</th>
                {isPriced && (
                  <>
                    <th className="py-2 text-end font-medium">{t.pos.rate}</th>
                    <th className="py-2 text-end font-medium">{t.pos.lineTotal}</th>
                  </>
                )}
              </tr>
            </thead>
            <tbody>
              {transaction.lineItems.map((line) => {
                const showModifiers = (block.showModifiers ?? true) && line.modifiers && line.modifiers.length > 0;
                const modifierTotalNum = parseFloat(line.modifierTotal ?? "0");
                return (
                  <>
                    <tr key={line.id ?? line.productId} className={showModifiers ? "border-b-0" : "border-b border-slate-100"}>
                      <td className="pt-2 font-medium text-slate-900">{line.productName}</td>
                      <td className="pt-2 text-end text-slate-700">
                        {line.quantity} {line.unit}
                      </td>
                      {isPriced && (
                        <>
                          <td className="pt-2 text-end text-slate-700">{formatCurrency(line.rate, symbol)}</td>
                          <td className="pt-2 text-end font-semibold text-slate-900">
                            {formatCurrency(line.lineTotal, symbol)}
                          </td>
                        </>
                      )}
                    </tr>
                    {showModifiers &&
                      line.modifiers!.map((mod, mIdx) => {
                        const charge = parseFloat(mod.totalCharge);
                        const isLast = mIdx === line.modifiers!.length - 1 && (!isPriced || modifierTotalNum <= 0);
                        return (
                          <tr
                            key={`${mod.modifierGroupId}-${mod.modifierOptionId}`}
                            className={isLast ? "border-b border-slate-100" : ""}
                          >
                            <td colSpan={isPriced ? 3 : 2} className="py-0.5 pl-4 text-xs text-slate-500">
                              + {mod.label}
                              {mod.quantity > 1 && <span className="ml-1 text-slate-400">×{mod.quantity}</span>}
                            </td>
                            {isPriced && (
                              <td className="py-0.5 text-end text-xs text-emerald-600">
                                {charge > 0 ? `+${formatCurrency(mod.totalCharge, symbol)}` : "Free"}
                              </td>
                            )}
                          </tr>
                        );
                      })}
                    {isPriced && showModifiers && modifierTotalNum > 0 && (
                      <tr className="border-b border-slate-100">
                        <td colSpan={3} className="pb-1.5 pl-4 text-xs font-medium text-slate-500">
                          Extras total
                        </td>
                        <td className="pb-1.5 text-end text-xs font-semibold text-emerald-700">
                          +{formatCurrency(modifierTotalNum.toFixed(2), symbol)}
                        </td>
                      </tr>
                    )}
                  </>
                );
              })}
            </tbody>
          </table>
        );

      case "totals":
        if (!isPriced) return null;
        return (
          <div key={block.id}>
            {hasDiscount && (
              <>
                <div className="flex justify-between text-sm text-slate-500">
                  <span>{t.receipt.subtotalBeforeDiscount}</span>
                  <span>{formatCurrency(transaction.subtotal, symbol)}</span>
                </div>
                <div className="mt-1 flex justify-between text-sm font-medium text-amber-600">
                  <span>{discountLabel}</span>
                  <span>- {formatCurrency(transaction.discountAmount!, symbol)}</span>
                </div>
                <div className="mt-1 flex justify-between text-sm text-slate-500">
                  <span>{t.receipt.subtotalAfterDiscount}</span>
                  <span>{formatCurrency(subtotalAfterDiscountNumber.toFixed(2), symbol)}</span>
                </div>
              </>
            )}

            {(block.showTaxBreakdown ?? true)
              ? aggregatedCharges.map((charge) => (
                  <div key={charge.name} className="mt-1 flex justify-between text-sm text-slate-500">
                    <span>{chargeLabel(charge)}</span>
                    <span>{formatCurrency(charge.amount.toFixed(2), symbol)}</span>
                  </div>
                ))
              : aggregatedCharges.length > 0 && (
                  <div className="mt-1 flex justify-between text-sm text-slate-500">
                    <span>Tax & Charges</span>
                    <span>
                      {formatCurrency(
                        aggregatedCharges.reduce((sum, c) => sum + c.amount, 0).toFixed(2),
                        symbol,
                      )}
                    </span>
                  </div>
                )}

            {hasRounding && (
              <div className="mt-1 flex justify-between text-sm text-slate-500">
                <span>{t.receipt.rounding}</span>
                <span>
                  {roundingAdjustmentNumber > 0 ? "+ " : "- "}
                  {formatCurrency(Math.abs(roundingAdjustmentNumber).toFixed(2), symbol)}
                </span>
              </div>
            )}

            <div
              className={`flex justify-between text-lg font-bold ${
                hasDiscount || aggregatedCharges.length > 0 || hasRounding
                  ? "mt-2 border-t border-dashed border-slate-200 pt-2"
                  : ""
              }`}
            >
              <span>{t.pos.total}</span>
              <span className="text-[#2b2418]">{formatCurrency(transaction.total, symbol)}</span>
            </div>
          </div>
        );

      case "payment_info":
        if (!isPriced || !(block.showPaymentMethod ?? true)) return null;
        return (
          <div key={block.id} className="flex justify-between text-sm">
            <span className="text-slate-500">{t.receipt.payment}</span>
            <span className="capitalize">{transaction.paymentMethodName}</span>
          </div>
        );

      case "notes":
        if (!notes.trim()) return null;
        return (
          <div key={block.id}>
            <p className="text-xs font-medium text-slate-500">{t.receipt.notes}:</p>
            <p className="mt-1 text-sm text-slate-700">{notes}</p>
          </div>
        );

      case "footer_message":
        return (
          <p key={block.id} className={`text-sm text-slate-400 ${alignClass(block.align)}`}>
            {block.text || t.receipt.thankYou}
          </p>
        );

      case "custom_text":
        if (!block.text) return null;
        return (
          <p
            key={block.id}
            className={`text-sm text-slate-600 ${block.bold ? "font-semibold" : ""} ${alignClass(block.align)}`}
          >
            {block.text}
          </p>
        );

      default:
        return null;
    }
  }

  return (
    <div className="mx-auto max-w-lg">
      <div className="mb-4 print:hidden">
        <label className="mb-1 block text-sm font-medium text-slate-700">{t.receipt.notes}</label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder={t.receipt.notesPlaceholder}
          rows={2}
          className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
        />
      </div>

      <div
        id="receipt-print"
        className="space-y-3 rounded-2xl border border-[#e4dcc8] bg-[#faf7ef] p-6 shadow-sm print:border-0 print:shadow-none"
      >
        {template.config.blocks.map(renderBlock)}
      </div>

      <div className="mt-4 flex gap-3 print:hidden">
        <button
          type="button"
          onClick={onPrint}
          className="flex-1 rounded-xl border border-slate-200 py-3 font-medium text-slate-700 hover:bg-slate-50"
        >
          {t.receipt.print}
        </button>

        <button
          type="button"
          onClick={handleExportPdf}
          disabled={isExportingPdf}
          className="flex-1 rounded-xl border border-slate-200 py-3 font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"
        >
          {isExportingPdf ? t.receipt.exportingPdf : t.receipt.exportPdf}
        </button>

        {showNewSale && (
          <button
            type="button"
            onClick={onNewSale}
            className="flex-1 rounded-xl bg-emerald-600 py-3 font-semibold text-white hover:bg-emerald-700"
          >
            {t.receipt.newSale}
          </button>
        )}
      </div>
    </div>
  );
}
