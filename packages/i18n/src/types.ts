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
  };
  payment: {
    title: string;
    cashOnly: string;
    confirm: string;
    cancel: string;
    processing: string;
  };
  receipt: {
    title: string;
    receiptNo: string;
    date: string;
    cashier: string;
    print: string;
    newSale: string;
    thankYou: string;
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
    noSales: string;
  };
  common: {
    loading: string;
    error: string;
    retry: string;
    back: string;
  };
}

export type Translations = TranslationKeys;
