export function formatMoney(amount: string | number, symbol: string): string {
  const value = typeof amount === "string" ? parseFloat(amount) : amount;
  return `${symbol} ${value.toLocaleString("en-PK", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export function roundMoney(value: number): string {
  return value.toFixed(2);
}

export function roundQuantity(value: number): string {
  return value.toFixed(3);
}

export function multiplyLineTotal(quantity: number, rate: string): string {
  return roundMoney(quantity * parseFloat(rate));
}

// The shop operates in Pakistan (Asia/Karachi, UTC+5, no DST — the offset
// never changes, so a fixed constant is safe and needs no timezone
// library). Every "what day is it / has today ended" calculation below is
// pinned to this, deliberately ignoring the API server's own system
// timezone. Without this, a server whose clock/timezone doesn't happen to
// match Pakistan (e.g. a cloud box defaulting to UTC) can disagree with
// the shop about what day it currently is — most visibly right around
// midnight PKT, where "today's" summary can silently show yesterday's (or
// tomorrow's) date and sales.
const SHOP_UTC_OFFSET_MINUTES = 5 * 60;

/** The current date/time, expressed as if read on a wall clock in Asia/Karachi. */
function nowInShopTimezone(): Date {
  const now = new Date();
  return new Date(now.getTime() + SHOP_UTC_OFFSET_MINUTES * 60 * 1000);
}

export function todayDateKey(): string {
  const shopNow = nowInShopTimezone();
  const year = shopNow.getUTCFullYear();
  const month = String(shopNow.getUTCMonth() + 1).padStart(2, "0");
  const day = String(shopNow.getUTCDate()).padStart(2, "0");
  return `${year}${month}${day}`;
}

/** Midnight today, Asia/Karachi time — returned as the equivalent real UTC instant. */
export function startOfToday(): Date {
  const shopNow = nowInShopTimezone();
  const shopMidnightAsIfUtc = new Date(
    Date.UTC(shopNow.getUTCFullYear(), shopNow.getUTCMonth(), shopNow.getUTCDate()),
  );
  return new Date(shopMidnightAsIfUtc.getTime() - SHOP_UTC_OFFSET_MINUTES * 60 * 1000);
}

export function endOfToday(): Date {
  const start = startOfToday();
  return new Date(start.getTime() + 24 * 60 * 60 * 1000);
}