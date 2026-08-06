"use client";

import { useState } from "react";
import type { Transaction } from "@repo/types";
import { useAuth } from "../../providers/AuthProvider";
import { useI18n } from "../../providers/I18nProvider";
import { formatCurrency } from "../../services/sales";

interface ReceiptPreviewProps {
  transaction: Transaction;
  onPrint: () => void;
  onNewSale: () => void;
  showNewSale?: boolean;
}

export function ReceiptPreview({
  transaction,
  onPrint,
  onNewSale,
  showNewSale = true,
}: ReceiptPreviewProps) {
  const { tenant, user, branch } = useAuth();
  const { t } = useI18n();
  const symbol = tenant?.currencySymbol ?? "Rs";

  const billType = transaction.billType;
  const [notes, setNotes] = useState(transaction.notes ?? "");
  const [isExportingPdf, setIsExportingPdf] = useState(false);

  const isPriced = billType === "priced";

  // ─── Aggregated charge lines ────────────────────────────────────────────
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
  const discountAmountNumber = transaction.discountAmount
    ? parseFloat(transaction.discountAmount)
    : 0;
  const hasDiscount = discountAmountNumber > 0;

  const discountLabel = (() => {
    if (transaction.discountType !== "percentage" || subtotalNumber <= 0)
      return t.receipt.discount;
    const rate = (discountAmountNumber / subtotalNumber) * 100;
    const rateLabel = Number.isInteger(rate) ? rate.toString() : rate.toFixed(2);
    return `${t.receipt.discount} (${rateLabel}%)`;
  })();

  const subtotalAfterDiscountNumber = subtotalNumber - discountAmountNumber;
  const roundingAdjustmentNumber = transaction.roundingAdjustment
    ? parseFloat(transaction.roundingAdjustment)
    : 0;
  const hasRounding = roundingAdjustmentNumber !== 0;

  // ─── PDF helpers ─────────────────────────────────────────────────────────

  function escapePdfText(value: string) {
    return value
      .replace(/[^\x20-\x7E]/g, "?")
      .replace(/\\/g, "\\\\")
      .replace(/\(/g, "\\(")
      .replace(/\)/g, "\\)");
  }

  function estimatePdfTextWidth(value: string, fontSize: number) {
    return value.length * fontSize * 0.52;
  }

  // ─── PDF builder ─────────────────────────────────────────────────────────

  function buildPdf() {
    const pageWidth = 595.28;
    const pageHeight = 841.89;
    const margin = 48;
    let y = 790;
    const lines: string[] = [];

    function text(
      value: string,
      x: number,
      size = 10,
      align: "left" | "right" | "center" = "left",
    ) {
      let drawX = x;
      if (align === "right") drawX = x - estimatePdfTextWidth(value, size);
      if (align === "center") drawX = x - estimatePdfTextWidth(value, size) / 2;
      lines.push(
        `BT /F1 ${size} Tf ${drawX.toFixed(2)} ${y.toFixed(2)} Td (${escapePdfText(value)}) Tj ET`,
      );
    }

    function rule(offset = 10) {
      y -= offset;
      lines.push(
        `0.5 w ${margin} ${y.toFixed(2)} m ${pageWidth - margin} ${y.toFixed(2)} l S`,
      );
      y -= 16;
    }

    // Header
    text(tenant?.name ?? "Business", pageWidth / 2, 16, "center");
    y -= 18;
    if (tenant?.address) { text(tenant.address, pageWidth / 2, 9, "center"); y -= 12; }
    if (tenant?.phone)   { text(tenant.phone,   pageWidth / 2, 9, "center"); y -= 12; }
    if (branch?.name)    { text(branch.name,    pageWidth / 2, 9, "center"); y -= 12; }
    text(isPriced ? t.receipt.pricedBill : t.receipt.deliveryNote, pageWidth / 2, 12, "center");
    rule();

    text(`${t.receipt.receiptNo}: ${transaction.receiptNumber}`, margin, 10); y -= 14;
    text(`${t.receipt.date}: ${new Date(transaction.createdAt).toLocaleString()}`, margin, 10); y -= 14;
    text(`${t.receipt.cashier}: ${transaction.createdByName ?? user?.displayName ?? ""}`, margin, 10); y -= 14;
    if (isPriced) { text(`${t.receipt.payment}: ${transaction.paymentMethodName}`, margin, 10); y -= 14; }
    rule(4);

    // Column headers
    text(t.prices.product, margin, 10);
    text(t.pos.quantity, isPriced ? 300 : pageWidth - margin, 10, "right");
    if (isPriced) {
      text(t.pos.rate,      405,              10, "right");
      text(t.pos.lineTotal, pageWidth - margin, 10, "right");
    }
    y -= 16;

    // Line items — with modifier sub-rows
    for (const line of transaction.lineItems) {
      text(line.productName, margin, 10);
      text(`${line.quantity} ${line.unit}`, isPriced ? 300 : pageWidth - margin, 10, "right");
      if (isPriced) {
        text(formatCurrency(line.rate, symbol), 405, 10, "right");
        text(formatCurrency(line.lineTotal, symbol), pageWidth - margin, 10, "right");
      }
      y -= 16;

      // Modifier sub-rows (indented, smaller font, priced only shows charges)
      if (line.modifiers && line.modifiers.length > 0) {
        for (const mod of line.modifiers) {
          const modLabel = `  + ${mod.label}`;
          text(modLabel, margin + 8, 8);
          if (isPriced && parseFloat(mod.totalCharge) > 0) {
            text(
              `+${formatCurrency(mod.totalCharge, symbol)}`,
              pageWidth - margin,
              8,
              "right",
            );
          }
          y -= 12;
        }
        // ModifierTotal sub-total line when there are charges
        const modTotal = parseFloat(line.modifierTotal ?? "0");
        if (isPriced && modTotal > 0) {
          text(`  Extras`, margin + 8, 8);
          text(formatCurrency(modTotal.toFixed(2), symbol), pageWidth - margin, 8, "right");
          y -= 12;
        }
      }
    }

    // Totals section
    if (isPriced) {
      if (hasDiscount) {
        rule(2);
        text(t.receipt.subtotalBeforeDiscount, margin, 10);
        text(formatCurrency(transaction.subtotal, symbol), pageWidth - margin, 10, "right"); y -= 14;
        text(discountLabel, margin, 10);
        text(`- ${formatCurrency(transaction.discountAmount!, symbol)}`, pageWidth - margin, 10, "right"); y -= 14;
        text(t.receipt.subtotalAfterDiscount, margin, 10);
        text(formatCurrency(subtotalAfterDiscountNumber.toFixed(2), symbol), pageWidth - margin, 10, "right"); y -= 4;
      }
      if (aggregatedCharges.length > 0 || hasRounding) {
        rule(2);
        for (const charge of aggregatedCharges) {
          text(chargeLabel(charge), margin, 10);
          text(formatCurrency(charge.amount.toFixed(2), symbol), pageWidth - margin, 10, "right"); y -= 14;
        }
        if (hasRounding) {
          text(t.receipt.rounding, margin, 10);
          text(
            `${roundingAdjustmentNumber > 0 ? "+ " : "- "}${formatCurrency(Math.abs(roundingAdjustmentNumber).toFixed(2), symbol)}`,
            pageWidth - margin, 10, "right",
          ); y -= 4;
        }
      }
      rule(2);
      text(t.pos.total, margin, 12);
      text(formatCurrency(transaction.total, symbol), pageWidth - margin, 12, "right"); y -= 18;
    }

    if (notes.trim()) {
      rule(2);
      text(`${t.receipt.notes}:`, margin, 10); y -= 14;
      for (const noteLine of notes.trim().match(/.{1,70}/g) ?? []) {
        text(noteLine, margin, 9); y -= 12;
      }
    }

    y -= 14;
    text(t.receipt.thankYou, pageWidth / 2, 10, "center");

    const content = lines.join("\n");
    const objects = [
      "<< /Type /Catalog /Pages 2 0 R >>",
      "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>`,
      "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
      `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
    ];

    let pdf = "%PDF-1.4\n";
    const offsets = [0];
    objects.forEach((obj, index) => {
      offsets.push(pdf.length);
      pdf += `${index + 1} 0 obj\n${obj}\nendobj\n`;
    });
    const xrefOffset = pdf.length;
    pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
    for (const offset of offsets.slice(1)) {
      pdf += `${String(offset).padStart(10, "0")} 00000 n \n`;
    }
    pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;

    return new Blob([pdf], { type: "application/pdf" });
  }

  async function handleExportPdf() {
    setIsExportingPdf(true);
    try {
      const blob = buildPdf();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${transaction.receiptNumber}-${billType}.pdf`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } finally {
      setIsExportingPdf(false);
    }
  }

  // ─── Render ──────────────────────────────────────────────────────────────

  return (
    <div className="mx-auto max-w-lg">
      {/* Notes field — not printed on the receipt itself */}
      <div className="mb-4 print:hidden">
        <label className="mb-1 block text-sm font-medium text-slate-700">
          {t.receipt.notes}
        </label>
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
        className="rounded-2xl border border-[#e4dcc8] bg-[#faf7ef] p-6 shadow-sm print:border-0 print:shadow-none"
      >
        {/* Business header */}
        <div className="border-b border-dashed border-slate-300 pb-4 text-center">
          <h2 className="text-xl font-bold text-slate-900">{tenant?.name}</h2>
          {tenant?.address && <p className="mt-1 text-xs text-slate-500">{tenant.address}</p>}
          {tenant?.phone   && <p className="text-xs text-slate-500">{tenant.phone}</p>}
          {branch?.name    && <p className="mt-1 text-xs font-medium text-slate-600">{branch.name}</p>}
          <p className="mt-2 text-sm font-semibold text-slate-800">
            {isPriced ? t.receipt.pricedBill : t.receipt.deliveryNote}
          </p>
        </div>

        {/* Receipt meta */}
        <div className="space-y-1 border-b border-dashed border-slate-300 py-4 text-sm">
          <div className="flex justify-between">
            <span className="text-slate-500">{t.receipt.receiptNo}</span>
            <span className="font-mono font-medium">{transaction.receiptNumber}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-500">{t.receipt.date}</span>
            <span>{new Date(transaction.createdAt).toLocaleString()}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-500">{t.receipt.cashier}</span>
            <span>{transaction.createdByName ?? user?.displayName}</span>
          </div>
          {transaction.customerName && (
            <div className="flex justify-between">
              <span className="text-slate-500">Customer</span>
              <span>{transaction.customerName}</span>
            </div>
          )}
          {transaction.customerPhone && (
            <div className="flex justify-between">
              <span className="text-slate-500">Phone</span>
              <span>{transaction.customerPhone}</span>
            </div>
          )}
          {isPriced && (
            <div className="flex justify-between">
              <span className="text-slate-500">{t.receipt.payment}</span>
              <span className="capitalize">{transaction.paymentMethodName}</span>
            </div>
          )}
        </div>

        {/* Line items table */}
        <table className="mt-4 w-full text-sm">
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
              const hasModifiers = line.modifiers && line.modifiers.length > 0;
              const modifierTotalNum = parseFloat(line.modifierTotal ?? "0");

              return (
                <>
                  {/* Main product row */}
                  <tr
                    key={line.id ?? line.productId}
                    className={hasModifiers ? "border-b-0" : "border-b border-slate-100"}
                  >
                    <td className="pt-2 font-medium text-slate-900">{line.productName}</td>
                    <td className="pt-2 text-end text-slate-700">
                      {line.quantity} {line.unit}
                    </td>
                    {isPriced && (
                      <>
                        <td className="pt-2 text-end text-slate-700">
                          {formatCurrency(line.rate, symbol)}
                        </td>
                        <td className="pt-2 text-end font-semibold text-slate-900">
                          {formatCurrency(line.lineTotal, symbol)}
                        </td>
                      </>
                    )}
                  </tr>

                  {/* Modifier sub-rows */}
                  {hasModifiers && line.modifiers!.map((mod, mIdx) => {
                    const charge = parseFloat(mod.totalCharge);
                    const isLast =
                      mIdx === line.modifiers!.length - 1 && (!isPriced || modifierTotalNum <= 0);
                    return (
                      <tr
                        key={`${mod.modifierGroupId}-${mod.modifierOptionId}`}
                        className={isLast ? "border-b border-slate-100" : ""}
                      >
                        <td
                          colSpan={isPriced ? 3 : 2}
                          className="py-0.5 pl-4 text-xs text-slate-500"
                        >
                          + {mod.label}
                          {mod.quantity > 1 && (
                            <span className="ml-1 text-slate-400">×{mod.quantity}</span>
                          )}
                        </td>
                        {isPriced && (
                          <td className="py-0.5 text-end text-xs text-emerald-600">
                            {charge > 0
                              ? `+${formatCurrency(mod.totalCharge, symbol)}`
                              : "Free"}
                          </td>
                        )}
                      </tr>
                    );
                  })}

                  {/* Modifier total summary row — only when there are charges */}
                  {isPriced && hasModifiers && modifierTotalNum > 0 && (
                    <tr className="border-b border-slate-100">
                      <td
                        colSpan={3}
                        className="pb-1.5 pl-4 text-xs font-medium text-slate-500"
                      >
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

        {/* Totals section — priced bills only */}
        {isPriced && (
          <div className="mt-4 border-t border-slate-200 pt-4">
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

            {aggregatedCharges.map((charge) => (
              <div key={charge.name} className="mt-1 flex justify-between text-sm text-slate-500">
                <span>{chargeLabel(charge)}</span>
                <span>{formatCurrency(charge.amount.toFixed(2), symbol)}</span>
              </div>
            ))}

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
              <span className="text-[#2b2418]">
                {formatCurrency(transaction.total, symbol)}
              </span>
            </div>
          </div>
        )}

        {notes.trim() && (
          <div className="mt-4 border-t border-slate-100 pt-3">
            <p className="text-xs font-medium text-slate-500">{t.receipt.notes}:</p>
            <p className="mt-1 text-sm text-slate-700">{notes}</p>
          </div>
        )}

        <p className="mt-6 text-center text-sm text-slate-400">{t.receipt.thankYou}</p>
      </div>

      {/* Action buttons */}
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
