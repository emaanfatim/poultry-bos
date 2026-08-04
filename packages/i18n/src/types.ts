export type Locale = "en" | "ur" | "ne";

export interface TranslationKeys {
  app: {
    title: string;
    subtitle: string;
  };
  nav: {
    pos: string;
    prices: string;
    summary: string;
    till: string;
    handover: string;
    logout: string;
  };
  login: {
    title: string;
    username: string;
    password: string;
    submit: string;
    error: string;
  };
  pos: {
    searchPlaceholder: string;
    cart: string;
    emptyCart: string;
    quantity: string;
    rate: string;
    lineTotal: string;
    subtotal: string;
    total: string;
    checkout: string;
    addToCart: string;
    perUnit: string;
    noProducts: string;
    // Product-catalogue handover §3.1 — Modifiers-style product picker
    customize: string;
    required: string;
    optional: string;
    selectOne: string;
    selectAny: string;
    includedFree: string;
    extraEach: string;
    note: string;
    notePlaceholder: string;
    addToCartWithOptions: string;
    selectionRequired: string;
  };
  payment: {
    title: string;
    cashOnly: string;
    confirm: string;
    cancel: string;
    processing: string;
  };
  discount: {
    label: string;
    add: string;
    remove: string;
    percentage: string;
    flat: string;
    valuePlaceholderPercentage: string;
    valuePlaceholderFlat: string;
    maxAllowed: string;
    notAllowed: string;
    restrictedNotice: string;
    noEligibleItems: string;
    amountOff: string;
  };
  receipt: {
  title: string;
  receiptNo: string;
  date: string;
  cashier: string;
  print: string;
  newSale: string;
  thankYou: string;
  payment: string;
  notes: string;
  notesPlaceholder: string;
  billType: string;
  pricedBill: string;
  deliveryNote: string;
  pricedBillDesc: string;
  deliveryNoteDesc: string;
  /** Shown on Priced Bill button when cashier lacks the authorized permission */
  pricedBillRestricted: string;
  /** Export as PDF button label — Section 13.5.5 */
  exportPdf: string;
  exportingPdf: string;
  discount: string;
  subtotalBeforeDiscount: string;
  subtotalAfterDiscount: string;
  rounding: string;
  viewReceipt: string;
  /** Button on the customer receipt to switch to the kitchen/fulfillment ticket view */
  viewTicket: string;
};
  // Generic kitchen/fulfillment ticket — what to prepare, no prices. Works
  // identically for any business type (product-catalogue handover §4).
  ticket: {
    title: string;
    subtitle: string;
    receiptNo: string;
    date: string;
    cashier: string;
    customer: string;
    product: string;
    quantity: string;
    notes: string;
    print: string;
    exportPdf: string;
    exportingPdf: string;
    backToReceipt: string;
    noItems: string;
  };
  prices: {
    title: string;
    subtitle: string;
    product: string;
    unit: string;
    price: string;
    save: string;
    saving: string;
    saved: string;
    ownerOnly: string;
  };
  summary: {
    title: string;
    today: string;
    totalRevenue: string;
    transactionCount: string;
    productBreakdown: string;
    modifierBreakdown: string;
    noSales: string;
  };
  common: {
    loading: string;
    error: string;
    retry: string;
    back: string;
    close: string;
  };
  till: {
    openTitle: string;
    openSubtitle: string;
    headerStartTill: string;
    headerCurrentTill: string;
    closeTitle: string;
    closeSubtitle: string;
    openingCash: string;
    closingCash: string;
    lumpSumHint: string;
    countHint: string;
    denomination: string;
    quantity: string;
    countedTotal: string;
    startShift: string;
    starting: string;
    endShift: string;
    ending: string;
    expectedClosing: string;
    actualClosing: string;
    variance: string;
    over: string;
    short: string;
    matched: string;
    roundingSummaryTitle: string;
    extraReceived: string;
    extraGiven: string;
    roundingNet: string;
    noRoundingActivity: string;
    currentSession: string;
    openedAt: string;
    goToSale: string;
    closeMismatch: string;
    handoverTitle: string;
    handoverSubtitle: string;
    selectSessions: string;
    noCandidateSessions: string;
    totalExpected: string;
    totalReceived: string;
    confirmHandover: string;
    submitting: string;
    handoverHistory: string;
    noHandovers: string;
    reportTitle: string;
    reportSubtitle: string;
    status: string;
    open: string;
    closed: string;
    handedOver: string;
    notHandedOver: string;
    cashier: string;
  };
  cashCount: {
    title: string;
    subtitle: string;
    tendered: string;
    tenderedHint: string;
    changeDue: string;
    changeGiven: string;
    suggested: string;
    suggestedExact: string;
    suggestedShort: string;
    noChangeNeeded: string;
    notEnoughTendered: string;
    skip: string;
    confirm: string;
    recording: string;
    recorded: string;
  };
}

export type Translations = TranslationKeys;