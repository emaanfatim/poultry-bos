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

export function todayDateKey(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}${month}${day}`;
}

export function startOfToday(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

export function endOfToday(): Date {
  const start = startOfToday();
  return new Date(start.getTime() + 24 * 60 * 60 * 1000);
}
