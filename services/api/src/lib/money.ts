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

export type SummaryPeriod = "hourly" | "daily" | "weekly" | "monthly" | "yearly";

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function monthName(monthIndex: number): string {
  return MONTH_NAMES[((monthIndex % 12) + 12) % 12] ?? "";
}

/** Converts a shop-timezone "wall clock" Date (as produced by nowInShopTimezone,
 * i.e. UTC fields holding shop-local values) back into a real UTC instant. */
function shopWallClockToUtcInstant(wallClockUtc: Date): Date {
  return new Date(wallClockUtc.getTime() - SHOP_UTC_OFFSET_MINUTES * 60 * 1000);
}

/** Converts a real UTC instant (e.g. a transaction's createdAt) into shop-
 * timezone "wall clock" fields, expressed as UTC getters for convenience —
 * the inverse of shopWallClockToUtcInstant. */
function instantToShopWallClock(instant: Date): Date {
  return new Date(instant.getTime() + SHOP_UTC_OFFSET_MINUTES * 60 * 1000);
}

function formatHourShortLabel(hour: number): string {
  if (hour === 0) return "12a";
  if (hour < 12) return `${hour}a`;
  if (hour === 12) return "12p";
  return `${hour - 12}p`;
}

function formatHourFullLabel(hour: number): string {
  return new Date(2000, 0, 1, hour).toLocaleTimeString(undefined, {
    hour: "numeric",
    hour12: true,
  });
}

const WEEKDAY_SHORT_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export interface SummaryTrendPoint {
  /** Short axis label, e.g. "2p", "Tue", "14", "Mar". */
  label: string;
  /** Fuller label for tooltips/captions, e.g. "2:00 PM", "Tue, Mar 4". */
  fullLabel: string;
  revenue: string;
}

/**
 * Builds the time-series buckets shown in the owner portal's "Sales
 * Trend" chart, at a granularity that matches the selected period:
 *
 * - hourly:  12 buckets of 5 minutes, spanning the current hour
 * - daily:   24 buckets of 1 hour, spanning the current day
 * - weekly:  7 buckets of 1 day (Mon–Sun), spanning the current week
 * - monthly: 1 bucket per day of the current month
 * - yearly:  12 buckets of 1 month, spanning the current year
 *
 * `start`/`end` must be the exact window returned by
 * getSummaryPeriodRange() for the same period, and `sales` the completed
 * sale transactions already filtered to that window.
 */
export function buildSummaryTrend(
  period: SummaryPeriod,
  start: Date,
  end: Date,
  sales: Array<{ createdAt: Date; total: string }>,
): SummaryTrendPoint[] {
  if (period === "hourly") {
    const bucketMs = 5 * 60 * 1000;
    const bucketCount = 12;
    const totals = Array.from({ length: bucketCount }, () => 0);
    for (const sale of sales) {
      const idx = clampIndex(
        Math.floor((sale.createdAt.getTime() - start.getTime()) / bucketMs),
        bucketCount,
      );
      totals[idx] = (totals[idx] ?? 0) + parseFloat(sale.total);
    }
    return totals.map((revenue, idx) => {
      const minuteStart = idx * 5;
      return {
        label: `:${pad2(minuteStart)}`,
        fullLabel: `${minuteStart}–${minuteStart + 5} min past the hour`,
        revenue: roundMoney(revenue ?? 0),
      };
    });
  }

  if (period === "daily") {
    const bucketCount = 24;
    const totals = Array.from({ length: bucketCount }, () => 0);
    for (const sale of sales) {
      const idx = clampIndex(
        Math.floor((sale.createdAt.getTime() - start.getTime()) / (60 * 60 * 1000)),
        bucketCount,
      );
      totals[idx] = (totals[idx] ?? 0) + parseFloat(sale.total);
    }
    return totals.map((revenue, hour) => ({
      label: formatHourShortLabel(hour),
      fullLabel: formatHourFullLabel(hour),
      revenue: roundMoney(revenue ?? 0),
    }));
  }

  if (period === "weekly") {
    const bucketCount = 7;
    const totals = Array.from({ length: bucketCount }, () => 0);
    for (const sale of sales) {
      const idx = clampIndex(
        Math.floor((sale.createdAt.getTime() - start.getTime()) / (24 * 60 * 60 * 1000)),
        bucketCount,
      );
      totals[idx] = (totals[idx] ?? 0) + parseFloat(sale.total);
    }
    return totals.map((revenue, idx) => {
      const dayWall = instantToShopWallClock(new Date(start.getTime() + idx * 24 * 60 * 60 * 1000));
      return {
        label: WEEKDAY_SHORT_NAMES[idx] ?? "",
        fullLabel: `${WEEKDAY_SHORT_NAMES[idx] ?? ""}, ${monthName(dayWall.getUTCMonth()).slice(0, 3)} ${dayWall.getUTCDate()}`,
        revenue: roundMoney(revenue ?? 0),
      };
    });
  }

  if (period === "monthly") {
    // Days in this specific month — derived from the actual window length
    // rather than a fixed 28-31 guess, so it's correct for every month.
    const bucketCount = Math.round((end.getTime() - start.getTime()) / (24 * 60 * 60 * 1000));
    const totals = Array.from({ length: bucketCount }, () => 0);
    for (const sale of sales) {
      const idx = clampIndex(
        Math.floor((sale.createdAt.getTime() - start.getTime()) / (24 * 60 * 60 * 1000)),
        bucketCount,
      );
      totals[idx] = (totals[idx] ?? 0) + parseFloat(sale.total);
    }
    return totals.map((revenue, idx) => {
      const dayWall = instantToShopWallClock(new Date(start.getTime() + idx * 24 * 60 * 60 * 1000));
      return {
        label: `${idx + 1}`,
        fullLabel: `${monthName(dayWall.getUTCMonth()).slice(0, 3)} ${dayWall.getUTCDate()}`,
        revenue: roundMoney(revenue ?? 0),
      };
    });
  }

  // yearly — bucket by calendar month, since months vary in length.
  const bucketCount = 12;
  const totals = Array.from({ length: bucketCount }, () => 0);
  const startWall = instantToShopWallClock(start);
  const startYear = startWall.getUTCFullYear();
  const startMonth = startWall.getUTCMonth();
  for (const sale of sales) {
    const wall = instantToShopWallClock(sale.createdAt);
    const idx = clampIndex(
      (wall.getUTCFullYear() - startYear) * 12 + (wall.getUTCMonth() - startMonth),
      bucketCount,
    );
    totals[idx] = (totals[idx] ?? 0) + parseFloat(sale.total);
  }
  return totals.map((revenue, idx) => ({
    label: monthName(idx).slice(0, 3),
    fullLabel: `${monthName(idx)} ${startYear}`,
    revenue: roundMoney(revenue ?? 0),
  }));
}

function clampIndex(idx: number, count: number): number {
  if (idx < 0) return 0;
  if (idx >= count) return count - 1;
  return idx;
}

/**
 * Computes the [start, end) window (as real UTC instants) covering the
 * given period, anchored to "now" in shop time, along with a human-
 * readable label and a stable `date` key for the response payload.
 *
 * - hourly: the current hour, e.g. 14:00–15:00
 * - daily: today, midnight to midnight (shop time) — same as
 *   startOfToday()/endOfToday() above
 * - weekly: the current Mon–Sun week
 * - monthly: the current calendar month
 * - yearly: the current calendar year
 */
export function getSummaryPeriodRange(period: SummaryPeriod): {
  start: Date;
  end: Date;
  dateKey: string;
  rangeLabel: string;
} {
  const shopNow = nowInShopTimezone();
  const year = shopNow.getUTCFullYear();
  const month = shopNow.getUTCMonth();
  const day = shopNow.getUTCDate();
  const hour = shopNow.getUTCHours();

  switch (period) {
    case "hourly": {
      const startWall = new Date(Date.UTC(year, month, day, hour));
      const endWall = new Date(startWall.getTime() + 60 * 60 * 1000);
      const start = shopWallClockToUtcInstant(startWall);
      const end = shopWallClockToUtcInstant(endWall);
      const hourLabel = new Date(2000, 0, 1, hour).toLocaleTimeString(undefined, {
        hour: "numeric",
        hour12: true,
      });
      return {
        start,
        end,
        dateKey: `${year}${pad2(month + 1)}${pad2(day)}-h${pad2(hour)}`,
        rangeLabel: `${monthName(month)} ${day}, ${year} · ${hourLabel}`,
      };
    }

    case "weekly": {
      // ISO-ish week starting Monday.
      const weekday = new Date(Date.UTC(year, month, day)).getUTCDay(); // 0=Sun..6=Sat
      const daysSinceMonday = (weekday + 6) % 7;
      const startWall = new Date(Date.UTC(year, month, day - daysSinceMonday));
      const endWall = new Date(startWall.getTime() + 7 * 24 * 60 * 60 * 1000);
      const start = shopWallClockToUtcInstant(startWall);
      const end = shopWallClockToUtcInstant(endWall);
      const lastDayWall = new Date(endWall.getTime() - 24 * 60 * 60 * 1000);
      const startLabel = `${monthName(startWall.getUTCMonth()).slice(0, 3)} ${startWall.getUTCDate()}`;
      const endLabel = `${monthName(lastDayWall.getUTCMonth()).slice(0, 3)} ${lastDayWall.getUTCDate()}, ${lastDayWall.getUTCFullYear()}`;
      return {
        start,
        end,
        dateKey: `${startWall.getUTCFullYear()}${pad2(startWall.getUTCMonth() + 1)}${pad2(startWall.getUTCDate())}-week`,
        rangeLabel: `${startLabel} – ${endLabel}`,
      };
    }

    case "monthly": {
      const startWall = new Date(Date.UTC(year, month, 1));
      const endWall = new Date(Date.UTC(year, month + 1, 1));
      const start = shopWallClockToUtcInstant(startWall);
      const end = shopWallClockToUtcInstant(endWall);
      return {
        start,
        end,
        dateKey: `${year}${pad2(month + 1)}`,
        rangeLabel: `${monthName(month)} ${year}`,
      };
    }

    case "yearly": {
      const startWall = new Date(Date.UTC(year, 0, 1));
      const endWall = new Date(Date.UTC(year + 1, 0, 1));
      const start = shopWallClockToUtcInstant(startWall);
      const end = shopWallClockToUtcInstant(endWall);
      return {
        start,
        end,
        dateKey: `${year}`,
        rangeLabel: `${year}`,
      };
    }

    case "daily":
    default: {
      const start = startOfToday();
      const end = endOfToday();
      return {
        start,
        end,
        // Kept as "YYYY-MM-DD" (not the compact todayDateKey() format) for
        // backward compatibility with clients that parse this field by
        // splitting on "-" (e.g. the counter-app's daily summary view).
        dateKey: `${year}-${pad2(month + 1)}-${pad2(day)}`,
        rangeLabel: `${monthName(month)} ${day}, ${year}`,
      };
    }
  }
}