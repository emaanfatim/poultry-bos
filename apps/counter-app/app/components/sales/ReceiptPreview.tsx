"use client";

import { useState } from "react";
import type { BillType, Transaction } from "@repo/types";
import { useAuth } from "../../providers/AuthProvider";
import { useI18n } from "../../providers/I18nProvider";
import { formatCurrency } from "../../services/sales";

interface ReceiptPreviewProps {
  transaction: Transaction;
  onPrint: () => void;
  onNewSale: () => void;
}

export function ReceiptPreview({ transaction, onPrint, onNewSale }: ReceiptPreviewProps) {
  const { tenant, user, branch } = useAuth();
  const { t } = useI18n();
  const symbol = tenant?.currencySymbol ?? "Rs";

  // Locked in at checkout — changing it here wouldn't update the saved
  // transaction record, so it's shown as read-only rather than editable.
  const [billType] = useState<BillType>(transaction.billType ?? "priced");
  const [notes, setNotes] = useState(transaction.notes ?? "");
  const [isExportingPdf, setIsExportingPdf] = useState(false);

  const isPriced = billType === "priced";

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
      lines.push(`0.5 w ${margin} ${y.toFixed(2)} m ${pageWidth - margin} ${y.toFixed(2)} l S`);
      y -= 16;
    }

    text(tenant?.name ?? "Business", pageWidth / 2, 16, "center");
    y -= 18;
    if (tenant?.address) {
      text(tenant.address, pageWidth / 2, 9, "center");
      y -= 12;
    }
    if (tenant?.phone) {
      text(tenant.phone, pageWidth / 2, 9, "center");
      y -= 12;
    }
    if (branch?.name) {
      text(branch.name, pageWidth / 2, 9, "center");
      y -= 12;
    }
    text(isPriced ? t.receipt.pricedBill : t.receipt.deliveryNote, pageWidth / 2, 12, "center");
    rule();

    text(`${t.receipt.receiptNo}: ${transaction.receiptNumber}`, margin, 10);
    y -= 14;
    text(`${t.receipt.date}: ${new Date(transaction.createdAt).toLocaleString()}`, margin, 10);
    y -= 14;
    text(`${t.receipt.cashier}: ${transaction.createdByName ?? user?.displayName ?? ""}`, margin, 10);
    y -= 14;
    if (isPriced) {
      text(`${t.receipt.payment}: ${transaction.paymentMethod}`, margin, 10);
      y -= 14;
    }
    rule(4);

    text(t.prices.product, margin, 10);
    text(t.pos.quantity, isPriced ? 300 : pageWidth - margin, 10, "right");
    if (isPriced) {
      text(t.pos.rate, 405, 10, "right");
      text(t.pos.lineTotal, pageWidth - margin, 10, "right");
    }
    y -= 16;

    for (const line of transaction.lineItems) {
      text(line.productName, margin, 10);
      text(`${line.quantity} ${line.unit}`, isPriced ? 300 : pageWidth - margin, 10, "right");
      if (isPriced) {
        text(formatCurrency(line.rate, symbol), 405, 10, "right");
        text(formatCurrency(line.lineTotal, symbol), pageWidth - margin, 10, "right");
      }
      y -= 16;
    }

    if (isPriced) {
      rule(2);
      text(t.pos.total, margin, 12);
      text(formatCurrency(transaction.total, symbol), pageWidth - margin, 12, "right");
      y -= 18;
    }

    if (notes.trim()) {
      rule(2);
      text(`${t.receipt.notes}:`, margin, 10);
      y -= 14;
      for (const noteLine of notes.trim().match(/.{1,70}/g) ?? []) {
        text(noteLine, margin, 9);
        y -= 12;
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
    objects.forEach((object, index) => {
      offsets.push(pdf.length);
      pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
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

  return (
    <div className="mx-auto max-w-lg">
      <div className="mb-4 print:hidden">
        <p className="mb-2 text-sm font-medium text-slate-700">
          {t.receipt.billType}{" "}
          <span className="text-xs font-normal text-slate-400">
            (locked in at checkout)
          </span>
        </p>
        <div className="grid grid-cols-2 gap-3">
          <button
            type="button"
            disabled
            aria-disabled="true"
            className={`cursor-not-allowed rounded-xl border-2 p-3 text-left transition-all ${
              isPriced
                ? "border-emerald-500 bg-emerald-50"
                : "border-slate-200 bg-slate-50 opacity-50"
            }`}
          >
            <p className="text-sm font-semibold text-slate-900">{t.receipt.pricedBill}</p>
            <p className="mt-0.5 text-xs text-slate-500">{t.receipt.pricedBillDesc}</p>
          </button>

          <button
            type="button"
            disabled
            aria-disabled="true"
            className={`cursor-not-allowed rounded-xl border-2 p-3 text-left transition-all ${
              !isPriced
                ? "border-emerald-500 bg-emerald-50"
                : "border-slate-200 bg-slate-50 opacity-50"
            }`}
          >
            <p className="text-sm font-semibold text-slate-900">{t.receipt.deliveryNote}</p>
            <p className="mt-0.5 text-xs text-slate-500">{t.receipt.deliveryNoteDesc}</p>
          </button>
        </div>

        <div className="mt-3">
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
      </div>

      <div
        id="receipt-print"
        className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm print:border-0 print:shadow-none"
      >
        <div className="border-b border-dashed border-slate-300 pb-4 text-center">
          <h2 className="text-xl font-bold text-slate-900">{tenant?.name}</h2>
          {tenant?.address && (
            <p className="mt-1 text-xs text-slate-500">{tenant.address}</p>
          )}
          {tenant?.phone && (
            <p className="text-xs text-slate-500">{tenant.phone}</p>
          )}
          {branch?.name && (
            <p className="mt-1 text-xs font-medium text-slate-600">{branch.name}</p>
          )}
          <p className="mt-2 text-sm font-semibold text-slate-800">
            {isPriced ? t.receipt.pricedBill : t.receipt.deliveryNote}
          </p>
        </div>

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
              <span className="capitalize">{transaction.paymentMethod}</span>
            </div>
          )}
        </div>

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
            {transaction.lineItems.map((line) => (
              <tr key={line.id ?? line.productId} className="border-b border-slate-100">
                <td className="py-2">{line.productName}</td>
                <td className="py-2 text-end">
                  {line.quantity} {line.unit}
                </td>
                {isPriced && (
                  <>
                    <td className="py-2 text-end">{formatCurrency(line.rate, symbol)}</td>
                    <td className="py-2 text-end font-medium">
                      {formatCurrency(line.lineTotal, symbol)}
                    </td>
                  </>
                )}
              </tr>
            ))}
          </tbody>
        </table>

        {isPriced && (
          <div className="mt-4 flex justify-between border-t border-slate-200 pt-4 text-lg font-bold">
            <span>{t.pos.total}</span>
            <span className="text-emerald-700">
              {formatCurrency(transaction.total, symbol)}
            </span>
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

        <button
          type="button"
          onClick={onNewSale}
          className="flex-1 rounded-xl bg-emerald-600 py-3 font-semibold text-white hover:bg-emerald-700"
        >
          {t.receipt.newSale}
        </button>
      </div>
    </div>
  );
}
