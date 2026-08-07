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
// these — it's not auto-applied anymore; editing a preset's blocks keeps
// that preset's card highlighted (see the Receipt Designer page), so
// "custom" only ever shows up on older saved templates from before that
// behavior changed.
export const RECEIPT_PRESETS: ReceiptPresetMeta[] = [
  {
    id: "minimal",
    name: "Minimal",
    description: "Clean & compact layout for fast takeaway and quick billing",
  },
  {
    id: "classic",
    name: "Classic",
    description: "Full business details, itemized notes, and a plain-text footer",
  },
  {
    id: "modern",
    name: "Modern",
    description: "Bold centered header, itemized tax breakdown, no clutter below the total",
  },
  {
    id: "branded",
    name: "Branded",
    description: "Logo header, double-rule dividers, and a custom promo line",
  },
];

// Human labels + short helper copy shown in the block architecture list.
export const BLOCK_LABELS: Record<ReceiptBlockType, string> = {
  logo_header: "Logo Header",
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
    showInvoiceNumber: true,
    showDateTime: true,
    showCashier: true,
    ...overrides,
  };
}

export function buildPresetBlocks(presetId: ReceiptTemplatePresetId): ReceiptBlock[] {
  switch (presetId) {
    // Compact: no subtitle/address block at all, single solid dividers,
    // combined tax line, short footer. Built for fast takeaway counters.
    case "minimal":
      return [
        { id: id(), type: "business_name", visible: true, align: "center", bold: true },
        { id: id(), type: "divider", visible: true, style: "solid" },
        { id: id(), type: "order_metadata", visible: true, metadataFields: metadataFields() },
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

    // Traditional layout: full business details (address, phone, branch),
    // customer info, an itemized breakdown, and room for order notes.
    case "classic":
      return [
        { id: id(), type: "business_name", visible: true, align: "center", bold: false },
        {
          id: id(),
          type: "subtitle",
          visible: true,
          align: "center",
          showAddress: true,
          showPhone: true,
          showBranchName: true,
        },
        { id: id(), type: "divider", visible: true, style: "solid" },
        { id: id(), type: "order_metadata", visible: true, metadataFields: metadataFields() },
        { id: id(), type: "customer_info", visible: true, showCustomerName: true, showCustomerPhone: true },
        { id: id(), type: "divider", visible: true, style: "solid" },
        { id: id(), type: "items_list", visible: true, showModifiers: true },
        { id: id(), type: "divider", visible: true, style: "solid" },
        { id: id(), type: "totals", visible: true, showTaxBreakdown: true },
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

    // Bold centered header, no address/branch clutter under the name,
    // dashed dividers, and nothing below the grand total — a shorter,
    // punchier receipt than Classic.
    case "modern":
      return [
        { id: id(), type: "business_name", visible: true, align: "center", bold: true },
        { id: id(), type: "divider", visible: true, style: "dashed" },
        {
          id: id(),
          type: "order_metadata",
          visible: true,
          metadataFields: metadataFields({ showCashier: false }),
        },
        { id: id(), type: "items_list", visible: true, showModifiers: true },
        { id: id(), type: "divider", visible: true, style: "dashed" },
        { id: id(), type: "totals", visible: true, showTaxBreakdown: true },
        { id: id(), type: "payment_info", visible: true, showPaymentMethod: true },
      ];

    // Logo-first header, double-rule dividers framing the metadata, and a
    // custom promo line above the footer.
    case "branded":
      return [
        { id: id(), type: "logo_header", visible: true, align: "center", imageKey: null },
        { id: id(), type: "business_name", visible: true, align: "center", bold: true },
        {
          id: id(),
          type: "subtitle",
          visible: true,
          align: "center",
          showAddress: true,
          showPhone: true,
          showBranchName: true,
        },
        { id: id(), type: "divider", visible: true, style: "double" },
        { id: id(), type: "order_metadata", visible: true, metadataFields: metadataFields() },
        { id: id(), type: "divider", visible: true, style: "double" },
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

    case "custom":
    default:
      return buildPresetBlocks("classic");
  }
}

export function newDividerBlock(): ReceiptBlock {
  return { id: id(), type: "divider", visible: true, style: "solid" };
}

export function newLogoHeaderBlock(): ReceiptBlock {
  return { id: id(), type: "logo_header", visible: true, align: "center", imageKey: null };
}

export function newCustomTextBlock(): ReceiptBlock {
  return { id: id(), type: "custom_text", visible: true, text: "", align: "center" };
}

export function newCustomerInfoBlock(): ReceiptBlock {
  return {
    id: id(),
    type: "customer_info",
    visible: true,
    showCustomerName: true,
    showCustomerPhone: true,
  };
}
