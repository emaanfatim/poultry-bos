import type { ReceiptBlock } from "@repo/types";

const WIDTH = 48;

export const SAMPLE_RECEIPT_DATA = {
  ticketNumber: "42",
  invoiceNumber: "INV-10429",
  table: "T3 (Main Hall)",
  billTag: "DINE-IN",
  items: [
    { name: "Chicken Karahi (Full)", qty: "1x", rate: 1850, total: 1850 },
    { name: "Rogni Naan", qty: "4x", rate: 80, total: 320 },
    { name: "Fresh Lime Soda", qty: "2x", rate: 220, total: 440 },
  ],
  subtotal: 2610,
  discountPct: 10,
  discountAmount: 261,
  taxLabel: "PRA GST (16%)",
  taxAmount: 375.84,
  grandTotal: 2724.84,
  notes: "No onions please",
};

interface PreviewContext {
  businessName: string;
  address?: string;
  phone?: string;
  branchName?: string;
  cashierName: string;
  currencySymbol: string;
}

function money(ctx: PreviewContext, amount: number) {
  return `${ctx.currencySymbol} ${amount.toLocaleString(undefined, {
    minimumFractionDigits: amount % 1 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  })}`;
}

function center(text: string) {
  if (text.length >= WIDTH) return text.slice(0, WIDTH);
  const pad = Math.floor((WIDTH - text.length) / 2);
  return " ".repeat(pad) + text;
}

function alignedLine(text: string, align: "left" | "center" | "right" = "left") {
  if (align === "center") return center(text);
  if (align === "right") return text.length >= WIDTH ? text.slice(-WIDTH) : " ".repeat(WIDTH - text.length) + text;
  return text.length >= WIDTH ? text.slice(0, WIDTH) : text;
}

function twoCol(left: string, right: string) {
  const space = WIDTH - left.length - right.length;
  if (space < 1) {
    const truncatedLeft = left.slice(0, Math.max(0, WIDTH - right.length - 1));
    return `${truncatedLeft} ${right}`;
  }
  return left + " ".repeat(space) + right;
}

function ruleChar(style?: "solid" | "dashed" | "double") {
  if (style === "dashed") return "-".repeat(WIDTH);
  if (style === "double") return "=".repeat(WIDTH);
  return "-".repeat(WIDTH);
}

export function buildThermalPreviewLines(blocks: ReceiptBlock[], ctx: PreviewContext): string[] {
  const lines: string[] = [];
  const d = SAMPLE_RECEIPT_DATA;

  for (const block of blocks) {
    if (!block.visible) continue;

    switch (block.type) {
      case "business_name":
        lines.push(alignedLine((block.text || ctx.businessName).toUpperCase(), block.align ?? "center"));
        break;

      case "subtitle": {
        const parts = [block.text || undefined, ctx.branchName].filter(Boolean);
        const text = parts.length > 0 ? parts.join(" · ") : ctx.address || "";
        if (text) lines.push(alignedLine(text, block.align ?? "center"));
        break;
      }

      case "divider":
        lines.push(ruleChar(block.style));
        break;

      case "order_metadata": {
        const f = block.metadataFields;
        const showTicket = f?.showTicketNumber ?? true;
        const showTable = f?.showTable ?? true;
        if (showTicket || showTable) {
          lines.push(
            twoCol(
              showTicket ? `TICKET #${d.ticketNumber}` : "",
              showTable ? d.billTag : "",
            ),
          );
        }
        if (f?.showInvoiceNumber ?? true) {
          lines.push(twoCol("Invoice No:", d.invoiceNumber));
        }
        if (f?.showDateTime ?? true) {
          lines.push(twoCol("Date & Time:", new Date().toLocaleString()));
        }
        if (f?.showCashier ?? true) {
          lines.push(twoCol("Cashier:", ctx.cashierName));
        }
        if (showTable) {
          lines.push(twoCol("Table:", d.table));
        }
        break;
      }

      case "items_list":
        lines.push(twoCol("QTY ITEM", "AMOUNT"));
        for (const item of d.items) {
          lines.push(twoCol(`${item.qty} ${item.name}`, money(ctx, item.total)));
        }
        break;

      case "totals":
        lines.push(ruleChar("dashed"));
        lines.push(twoCol("Subtotal", money(ctx, d.subtotal)));
        lines.push(twoCol(`Discount (${d.discountPct}%)`, `-${money(ctx, d.discountAmount)}`));
        if (block.showTaxBreakdown ?? false) {
          lines.push(twoCol(d.taxLabel, money(ctx, d.taxAmount)));
        } else {
          lines.push(twoCol("Tax & Charges", money(ctx, d.taxAmount)));
        }
        lines.push(ruleChar("solid"));
        lines.push(twoCol("GRAND TOTAL", money(ctx, d.grandTotal)));
        break;

      case "payment_info":
        if (block.showPaymentMethod ?? true) {
          lines.push(twoCol("Payment:", "Cash"));
        }
        break;

      case "customer_info":
        if (block.showCustomerName ?? true) lines.push(twoCol("Customer:", "Walk-in"));
        break;

      case "notes":
        lines.push("Notes: " + d.notes);
        break;

      case "footer_message":
        lines.push(alignedLine(block.text || "Thank you for your visit!", block.align ?? "center"));
        break;

      case "custom_text":
        if (block.text) lines.push(alignedLine(block.text, block.align ?? "center"));
        break;
    }
  }

  return lines;
}
