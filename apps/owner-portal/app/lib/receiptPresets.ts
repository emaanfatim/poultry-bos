import type {
  ReceiptBlock,
  ReceiptBlockType,
  ReceiptTemplatePresetId,
} from "@repo/types";

export interface ReceiptPresetMeta {
  id: ReceiptTemplatePresetId;
  name: string;
  description: string;
}

// Matches the 4 starter cards in the designer. "custom" isn't one of
// these — it's the presetId a template gets stamped with once the owner
// edits away from a starter (see markCustom() below).
export const RECEIPT_PRESETS: ReceiptPresetMeta[] = [
  {
    id: "minimal",
    name: "Minimal",
    description: "Clean & compact layout for fast takeaway and quick billing",
  },
  {
    id: "classic",
    name: "Classic",
    description: "Traditional full-service restaurant receipt layout",
  },
  {
    id: "modern",
    name: "Modern",
    description: "Bold high-impact header with prominent daily ticket callout & QR",
  },
  {
    id: "branded",
    name: "Branded",
    description: "Prominent 1-bit mono logo bitmap header with custom promo tags",
  },
];

// Human labels + short helper copy shown in the block architecture list.
export const BLOCK_LABELS: Record<ReceiptBlockType, string> = {
  business_name: "Business Name",
  subtitle: "Subtitle",
  divider: "Divider",
  order_metadata: "Order Metadata",
  items_list: "Items List",
  totals: "Totals",
  payment_info: "Payment Info",
  customer_info: "Customer Info",
  notes: "Notes",
  footer_message: "Footer Message",
  custom_text: "Custom Text",
};

function id() {
  return `blk_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`;
}

function metadataFields(overrides: Partial<ReceiptBlock["metadataFields"]> = {}) {
  return {
    showTicketNumber: true,
    showInvoiceNumber: true,
    showDateTime: true,
    showCashier: true,
    showTable: true,
    ...overrides,
  };
}

export function buildPresetBlocks(presetId: ReceiptTemplatePresetId): ReceiptBlock[] {
  switch (presetId) {
    case "minimal":
      return [
        { id: id(), type: "business_name", visible: true, align: "center", bold: true },
        { id: id(), type: "divider", visible: true, style: "solid" },
        {
          id: id(),
          type: "order_metadata",
          visible: true,
          metadataFields: metadataFields({ showTicketNumber: false, showTable: false }),
        },
        { id: id(), type: "items_list", visible: true, showModifiers: true },
        { id: id(), type: "divider", visible: true, style: "solid" },
        { id: id(), type: "totals", visible: true, showTaxBreakdown: false },
        {
          id: id(),
          type: "footer_message",
          visible: true,
          text: "Thank you for your order!",
          align: "center",
        },
      ];

    case "branded":
      return [
        { id: id(), type: "business_name", visible: true, align: "center", bold: true },
        { id: id(), type: "subtitle", visible: true, align: "center" },
        { id: id(), type: "divider", visible: true, style: "double" },
        { id: id(), type: "order_metadata", visible: true, metadataFields: metadataFields() },
        { id: id(), type: "divider", visible: true, style: "solid" },
        { id: id(), type: "items_list", visible: true, showModifiers: true },
        { id: id(), type: "divider", visible: true, style: "solid" },
        { id: id(), type: "totals", visible: true, showTaxBreakdown: true },
        { id: id(), type: "payment_info", visible: true, showPaymentMethod: true },
        {
          id: id(),
          type: "custom_text",
          visible: true,
          text: "Follow us @yourbrand for weekly deals!",
          align: "center",
        },
        {
          id: id(),
          type: "footer_message",
          visible: true,
          text: "Thank you — see you again soon!",
          align: "center",
        },
      ];

    case "classic":
    case "modern":
    case "custom":
    default:
      return [
        {
          id: id(),
          type: "business_name",
          visible: true,
          align: "center",
          bold: presetId === "modern",
        },
        { id: id(), type: "subtitle", visible: true, align: "center" },
        { id: id(), type: "divider", visible: true, style: "solid" },
        { id: id(), type: "order_metadata", visible: true, metadataFields: metadataFields() },
        { id: id(), type: "divider", visible: true, style: "solid" },
        { id: id(), type: "items_list", visible: true, showModifiers: true },
        { id: id(), type: "divider", visible: true, style: "solid" },
        { id: id(), type: "totals", visible: true, showTaxBreakdown: false },
        { id: id(), type: "payment_info", visible: true, showPaymentMethod: true },
        { id: id(), type: "notes", visible: true },
        {
          id: id(),
          type: "footer_message",
          visible: true,
          text: "Thank you for your visit!",
          align: "center",
        },
      ];
  }
}

export function newDividerBlock(): ReceiptBlock {
  return { id: id(), type: "divider", visible: true, style: "solid" };
}

export function newCustomTextBlock(): ReceiptBlock {
  return { id: id(), type: "custom_text", visible: true, text: "", align: "center" };
}
