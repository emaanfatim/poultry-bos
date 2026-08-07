import type { ReceiptBlock } from "@repo/types";

const WIDTH = 48;

export const SAMPLE_RECEIPT_DATA = {
  invoiceNumber: "INV-10429",
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

// A real item pulled from the tenant's product catalog, used to make the
// preview's items/totals reflect what's actually being sold instead of the
// fixed sample dish names below.
export interface PreviewLineItem {
  name: string;
  qty: number;
  rate: number;
}

function buildPreviewTotals(items: PreviewLineItem[]) {
  const subtotal = items.reduce((sum, item) => sum + item.qty * item.rate, 0);
  const discountPct = 10;
  const discountAmount = subtotal * (discountPct / 100);
  // Matches the ~16% GST ratio the static sample data used, just derived
  // dynamically now so it scales with whatever items are shown.
  const taxAmount = (subtotal - discountAmount) * 0.16;
  const grandTotal = subtotal - discountAmount + taxAmount;
  return { subtotal, discountPct, discountAmount, taxAmount, grandTotal };
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

export function buildThermalPreviewLines(
  blocks: ReceiptBlock[],
  ctx: PreviewContext,
  // Real products from the current inventory, when available — shown
  // instead of the hardcoded sample dishes so the preview reflects what
  // this business actually sells. Falls back to the sample data when the
  // catalog hasn't loaded yet or has nothing in it.
  inventoryItems?: PreviewLineItem[],
): string[] {
  const lines: string[] = [];
  const d = SAMPLE_RECEIPT_DATA;
  const items: PreviewLineItem[] =
    inventoryItems && inventoryItems.length > 0
      ? inventoryItems
      : d.items.map((item) => ({ name: item.name, qty: parseInt(item.qty, 10) || 1, rate: item.rate }));
  const totals = buildPreviewTotals(items);

  for (const block of blocks) {
    if (!block.visible) continue;

    switch (block.type) {
      case "logo_header":
        // The hardware preview is plain monospace text — an actual bitmap
        // can't render here, so show a placeholder in the chosen slot.
        // The real printed/HTML receipt renders the uploaded image itself.
        if (block.imageKey) {
          lines.push(alignedLine("[ LOGO ]", block.align ?? "center"));
        }
        break;

      case "business_name":
        lines.push(alignedLine((block.text || ctx.businessName).toUpperCase(), block.align ?? "center"));
        break;

      case "subtitle": {
        const rows: string[] = [];
        if (block.text) rows.push(block.text);
        if ((block.showAddress ?? true) && ctx.address) rows.push(ctx.address);
        if ((block.showPhone ?? true) && ctx.phone) rows.push(ctx.phone);
        if ((block.showBranchName ?? true) && ctx.branchName) rows.push(ctx.branchName);
        for (const row of rows) lines.push(alignedLine(row, block.align ?? "center"));
        break;
      }

      case "divider":
        lines.push(ruleChar(block.style));
        break;

      case "order_metadata": {
        const f = block.metadataFields;
        if (f?.showInvoiceNumber ?? true) {
          lines.push(twoCol("Invoice No:", d.invoiceNumber));
        }
        if (f?.showDateTime ?? true) {
          lines.push(twoCol("Date & Time:", new Date().toLocaleString()));
        }
        if (f?.showCashier ?? true) {
          lines.push(twoCol("Cashier:", ctx.cashierName));
        }
        break;
      }

      case "items_list":
        lines.push(twoCol("QTY ITEM", "AMOUNT"));
        for (const item of items) {
          lines.push(twoCol(`${item.qty}x ${item.name}`, money(ctx, item.qty * item.rate)));
        }
        break;

      case "totals":
        lines.push(ruleChar("dashed"));
        lines.push(twoCol("Subtotal", money(ctx, totals.subtotal)));
        lines.push(twoCol(`Discount (${totals.discountPct}%)`, `-${money(ctx, totals.discountAmount)}`));
        if (block.showTaxBreakdown ?? true) {
          lines.push(twoCol(d.taxLabel, money(ctx, totals.taxAmount)));
        } else {
          lines.push(twoCol("Tax & Charges", money(ctx, totals.taxAmount)));
        }
        lines.push(ruleChar("solid"));
        lines.push(twoCol("GRAND TOTAL", money(ctx, totals.grandTotal)));
        break;

      case "payment_info":
        if (block.showPaymentMethod ?? true) {
          lines.push(twoCol("Payment:", "Cash"));
        }
        break;

      case "customer_info":
        if (block.showCustomerName ?? true) lines.push(twoCol("Customer:", "Walk-in"));
        if (block.showCustomerPhone ?? true) lines.push(twoCol("Phone:", "0300-0000000"));
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
