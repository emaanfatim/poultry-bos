import { Hono } from "hono";
import { and, desc, eq, gte, inArray, isNull, lt, or } from "drizzle-orm";
import { z } from "zod";
import {
  currencyDenominations,
  tillDenominationCounts,
  tillHandovers,
  tillSessions,
  transactions,
  users,
} from "@repo/database";
import { getDb } from "../db";
import { roundMoney, startOfToday, endOfToday } from "../lib/money";
import { authMiddleware } from "../middleware/auth";
import type { AppVariables } from "../types";

export const tillRoutes = new Hono<{ Variables: AppVariables }>();

tillRoutes.use("*", authMiddleware);

const denomCountSchema = z.object({
  denominationId: z.string().uuid(),
  quantity: z.number().int().min(0),
});

const openTillSchema = z.object({
  openingCash: z.number().min(0),
  denominationCounts: z.array(denomCountSchema).optional(),
});

const closeTillSchema = z.object({
  actualClosingCash: z.number().min(0),
  denominationCounts: z.array(denomCountSchema).optional(),
});

const createHandoverSchema = z.object({
  tillSessionIds: z.array(z.string().uuid()).min(1),
  totalReceived: z.number().min(0),
});

function sumDenomCounts(
  denomsById: Map<string, { value: string }>,
  ids: Array<{ denominationId: string; quantity: number }>,
): number {
  return ids.reduce((sum, entry) => {
    const denom = denomsById.get(entry.denominationId);
    if (!denom) return sum;
    return sum + parseFloat(denom.value) * entry.quantity;
  }, 0);
}

async function loadDenominationMap(tenantId: string) {
  const db = getDb();
  const rows = await db
    .select()
    .from(currencyDenominations)
    .where(eq(currencyDenominations.tenantId, tenantId));
  return new Map(rows.map((row) => [row.id, row]));
}

async function attachCounts(tenantId: string, sessionId: string) {
  const db = getDb();
  const rows = await db
    .select({
      denominationId: tillDenominationCounts.denominationId,
      countType: tillDenominationCounts.countType,
      quantity: tillDenominationCounts.quantity,
      value: currencyDenominations.value,
      type: currencyDenominations.type,
    })
    .from(tillDenominationCounts)
    .innerJoin(
      currencyDenominations,
      eq(tillDenominationCounts.denominationId, currencyDenominations.id),
    )
    .where(
      and(
        eq(tillDenominationCounts.tenantId, tenantId),
        eq(tillDenominationCounts.tillSessionId, sessionId),
      ),
    );

  const openingCounts = rows
    .filter((row) => row.countType === "opening")
    .map((row) => ({
      denominationId: row.denominationId,
      value: row.value,
      type: row.type,
      quantity: row.quantity,
    }));

  const closingCounts = rows
    .filter((row) => row.countType === "closing")
    .map((row) => ({
      denominationId: row.denominationId,
      value: row.value,
      type: row.type,
      quantity: row.quantity,
    }));

  return { openingCounts, closingCounts };
}

interface DenomCountLine {
  denominationId: string;
  value: string;
  type: "note" | "coin";
  quantity: number;
}

function formatSession(
  session: typeof tillSessions.$inferSelect,
  userName: string | undefined,
  counts: { openingCounts: DenomCountLine[]; closingCounts: DenomCountLine[] },
) {
  return {
    id: session.id,
    status: session.status,
    userId: session.userId,
    userName,
    branchId: session.branchId,
    openingCash: session.openingCash,
    expectedClosingCash: session.expectedClosingCash,
    actualClosingCash: session.actualClosingCash,
    variance: session.variance,
    openedAt: session.openedAt.toISOString(),
    closedAt: session.closedAt ? session.closedAt.toISOString() : null,
    handoverId: session.handoverId,
    openingCounts: counts.openingCounts,
    closingCounts: counts.closingCounts,
  };
}

// Cash sales made by this cashier during their shift, minus refunds issued
// against those sales in the same window — what the drawer *should* hold on
// top of the opening float.
async function computeExpectedClosingCash(
  tenantId: string,
  branchId: string,
  userId: string,
  openedAt: Date,
  closedAt: Date,
  openingCash: number,
): Promise<number> {
  const db = getDb();

  const rows = await db
    .select({
      status: transactions.status,
      total: transactions.total,
    })
    .from(transactions)
    .where(
      and(
        eq(transactions.tenantId, tenantId),
        eq(transactions.branchId, branchId),
        eq(transactions.createdBy, userId),
        eq(transactions.paymentMethod, "cash"),
        gte(transactions.createdAt, openedAt),
        lt(transactions.createdAt, closedAt),
      ),
    );

  let net = 0;
  for (const row of rows) {
    const amount = parseFloat(row.total);
    if (row.status === "completed") net += amount;
    if (row.status === "refunded") net -= amount;
  }

  return openingCash + net;
}

// GET /till/denominations — active denominations for this tenant
tillRoutes.get("/denominations", async (c) => {
  const tenantId = c.get("tenantId");
  const db = getDb();

  const rows = await db
    .select()
    .from(currencyDenominations)
    .where(and(eq(currencyDenominations.tenantId, tenantId), eq(currencyDenominations.isActive, true)))
    .orderBy(desc(currencyDenominations.value));

  return c.json({
    denominations: rows.map((row) => ({
      id: row.id,
      value: row.value,
      type: row.type,
      isActive: row.isActive,
    })),
  });
});

// GET /till/current — this cashier's open session, if any (null if none)
tillRoutes.get("/current", async (c) => {
  const tenantId = c.get("tenantId");
  const user = c.get("user");
  const db = getDb();

  const [session] = await db
    .select()
    .from(tillSessions)
    .where(
      and(
        eq(tillSessions.tenantId, tenantId),
        eq(tillSessions.userId, user.id),
        eq(tillSessions.status, "open"),
      ),
    )
    .limit(1);

  if (!session) {
    return c.json({ session: null });
  }

  const counts = await attachCounts(tenantId, session.id);
  return c.json({ session: formatSession(session, user.displayName, counts) });
});

// POST /till/open — start a shift
tillRoutes.post("/open", async (c) => {
  const tenantId = c.get("tenantId");
  const branchId = c.get("branchId");
  const user = c.get("user");
  const body = await c.req.json();
  const parsed = openTillSchema.safeParse(body);

  if (!parsed.success) {
    return c.json({ error: parsed.error.issues[0]?.message ?? "Invalid opening data" }, 400);
  }

  const db = getDb();

  const [existing] = await db
    .select({ id: tillSessions.id })
    .from(tillSessions)
    .where(
      and(
        eq(tillSessions.tenantId, tenantId),
        eq(tillSessions.userId, user.id),
        eq(tillSessions.status, "open"),
      ),
    )
    .limit(1);

  if (existing) {
    return c.json({ error: "A till session is already open for this cashier" }, 409);
  }

  if (user.requiresTillCount) {
    if (!parsed.data.denominationCounts || parsed.data.denominationCounts.length === 0) {
      return c.json({ error: "An itemized denomination count is required to open this till" }, 400);
    }
    const denomsById = await loadDenominationMap(tenantId);
    const countedTotal = sumDenomCounts(denomsById, parsed.data.denominationCounts);
    if (Math.abs(countedTotal - parsed.data.openingCash) > 0.01) {
      return c.json(
        { error: "Denomination count total doesn't match the opening cash amount" },
        400,
      );
    }
  }

  const [session] = await db
    .insert(tillSessions)
    .values({
      tenantId,
      branchId,
      userId: user.id,
      status: "open",
      openingCash: roundMoney(parsed.data.openingCash),
    })
    .returning();

  if (parsed.data.denominationCounts?.length) {
    await db.insert(tillDenominationCounts).values(
      parsed.data.denominationCounts.map((entry) => ({
        tenantId,
        tillSessionId: session!.id,
        denominationId: entry.denominationId,
        countType: "opening" as const,
        quantity: entry.quantity,
      })),
    );
  }

  const counts = await attachCounts(tenantId, session!.id);
  return c.json({ session: formatSession(session!, user.displayName, counts) });
});

// POST /till/close — end a shift; system computes expected cash from real sales
tillRoutes.post("/close", async (c) => {
  const tenantId = c.get("tenantId");
  const branchId = c.get("branchId");
  const user = c.get("user");
  const body = await c.req.json();
  const parsed = closeTillSchema.safeParse(body);

  if (!parsed.success) {
    return c.json({ error: parsed.error.issues[0]?.message ?? "Invalid closing data" }, 400);
  }

  const db = getDb();

  const [session] = await db
    .select()
    .from(tillSessions)
    .where(
      and(
        eq(tillSessions.tenantId, tenantId),
        eq(tillSessions.userId, user.id),
        eq(tillSessions.status, "open"),
      ),
    )
    .limit(1);

  if (!session) {
    return c.json({ error: "No open till session for this cashier" }, 400);
  }

  if (user.requiresTillCount) {
    if (!parsed.data.denominationCounts || parsed.data.denominationCounts.length === 0) {
      return c.json({ error: "An itemized denomination count is required to close this till" }, 400);
    }
    const denomsById = await loadDenominationMap(tenantId);
    const countedTotal = sumDenomCounts(denomsById, parsed.data.denominationCounts);
    if (Math.abs(countedTotal - parsed.data.actualClosingCash) > 0.01) {
      return c.json(
        { error: "Denomination count total doesn't match the closing cash amount" },
        400,
      );
    }
  }

  const closedAt = new Date();
  const expected = await computeExpectedClosingCash(
    tenantId,
    branchId,
    user.id,
    session.openedAt,
    closedAt,
    parseFloat(session.openingCash),
  );
  const variance = parsed.data.actualClosingCash - expected;

  const [updated] = await db
    .update(tillSessions)
    .set({
      status: "closed",
      actualClosingCash: roundMoney(parsed.data.actualClosingCash),
      expectedClosingCash: roundMoney(expected),
      variance: roundMoney(variance),
      closedAt,
    })
    .where(eq(tillSessions.id, session.id))
    .returning();

  if (parsed.data.denominationCounts?.length) {
    await db.insert(tillDenominationCounts).values(
      parsed.data.denominationCounts.map((entry) => ({
        tenantId,
        tillSessionId: session.id,
        denominationId: entry.denominationId,
        countType: "closing" as const,
        quantity: entry.quantity,
      })),
    );
  }

  const counts = await attachCounts(tenantId, session.id);
  return c.json({ session: formatSession(updated!, user.displayName, counts) });
});

// Sessions this receiver is allowed to fold into a handover: closed, not yet
// handed over, and either they report to this receiver, this receiver *is*
// the session's own cashier, or the receiver is the owner (owner can collect
// from anyone in the branch).
function handoverEligibilityFilter(receiverId: string, isOwner: boolean) {
  if (isOwner) return undefined;
  return or(eq(users.reportsToId, receiverId), eq(tillSessions.userId, receiverId));
}

// GET /till/handover/candidates — closed sessions this receiver may collect
tillRoutes.get("/handover/candidates", async (c) => {
  const tenantId = c.get("tenantId");
  const branchId = c.get("branchId");
  const user = c.get("user");

  if (!user.canReceiveHandover) {
    return c.json({ error: "Forbidden — no handover permission" }, 403);
  }

  const db = getDb();
  const eligibility = handoverEligibilityFilter(user.id, user.role === "owner");

  const rows = await db
    .select({ session: tillSessions, userName: users.displayName })
    .from(tillSessions)
    .innerJoin(users, eq(tillSessions.userId, users.id))
    .where(
      and(
        eq(tillSessions.tenantId, tenantId),
        eq(tillSessions.branchId, branchId),
        eq(tillSessions.status, "closed"),
        isNull(tillSessions.handoverId),
        eligibility,
      ),
    )
    .orderBy(desc(tillSessions.closedAt));

  const sessions = await Promise.all(
    rows.map(async (row) => {
      const counts = await attachCounts(tenantId, row.session.id);
      return formatSession(row.session, row.userName, counts);
    }),
  );

  return c.json({ sessions });
});

// POST /till/handover — recount and confirm a combined handover
tillRoutes.post("/handover", async (c) => {
  const tenantId = c.get("tenantId");
  const branchId = c.get("branchId");
  const user = c.get("user");
  const body = await c.req.json();
  const parsed = createHandoverSchema.safeParse(body);

  if (!parsed.success) {
    return c.json({ error: parsed.error.issues[0]?.message ?? "Invalid handover data" }, 400);
  }

  if (!user.canReceiveHandover) {
    return c.json({ error: "Forbidden — no handover permission" }, 403);
  }

  const db = getDb();
  const eligibility = handoverEligibilityFilter(user.id, user.role === "owner");

  const rows = await db
    .select({ session: tillSessions })
    .from(tillSessions)
    .innerJoin(users, eq(tillSessions.userId, users.id))
    .where(
      and(
        eq(tillSessions.tenantId, tenantId),
        eq(tillSessions.branchId, branchId),
        eq(tillSessions.status, "closed"),
        isNull(tillSessions.handoverId),
        inArray(tillSessions.id, parsed.data.tillSessionIds),
        eligibility,
      ),
    );

  if (rows.length !== parsed.data.tillSessionIds.length) {
    return c.json(
      { error: "One or more selected sessions are not eligible for handover" },
      400,
    );
  }

  const totalExpected = rows.reduce(
    (sum, row) => sum + parseFloat(row.session.actualClosingCash ?? "0"),
    0,
  );
  const variance = parsed.data.totalReceived - totalExpected;

  const [handover] = await db
    .insert(tillHandovers)
    .values({
      tenantId,
      branchId,
      receivedBy: user.id,
      totalExpected: roundMoney(totalExpected),
      totalReceived: roundMoney(parsed.data.totalReceived),
      variance: roundMoney(variance),
    })
    .returning();

  await db
    .update(tillSessions)
    .set({ handoverId: handover!.id })
    .where(inArray(tillSessions.id, parsed.data.tillSessionIds));

  const sessions = await Promise.all(
    rows.map(async (row) => {
      const counts = await attachCounts(tenantId, row.session.id);
      const [sessionUser] = await db
        .select({ displayName: users.displayName })
        .from(users)
        .where(eq(users.id, row.session.userId))
        .limit(1);
      return formatSession(row.session, sessionUser?.displayName, counts);
    }),
  );

  return c.json({
    handover: {
      id: handover!.id,
      receivedBy: handover!.receivedBy,
      receivedByName: user.displayName,
      branchId: handover!.branchId,
      totalExpected: handover!.totalExpected,
      totalReceived: handover!.totalReceived,
      variance: handover!.variance,
      createdAt: handover!.createdAt.toISOString(),
      sessions,
    },
  });
});

// GET /till/handover/history — past handovers for this branch
tillRoutes.get("/handover/history", async (c) => {
  const tenantId = c.get("tenantId");
  const branchId = c.get("branchId");
  const user = c.get("user");

  if (!user.canReceiveHandover) {
    return c.json({ error: "Forbidden — no handover permission" }, 403);
  }

  const db = getDb();

  const rows = await db
    .select({ handover: tillHandovers, receivedByName: users.displayName })
    .from(tillHandovers)
    .innerJoin(users, eq(tillHandovers.receivedBy, users.id))
    .where(and(eq(tillHandovers.tenantId, tenantId), eq(tillHandovers.branchId, branchId)))
    .orderBy(desc(tillHandovers.createdAt));

  const handovers = await Promise.all(
    rows.map(async (row) => {
      const sessionRows = await db
        .select({ session: tillSessions, userName: users.displayName })
        .from(tillSessions)
        .innerJoin(users, eq(tillSessions.userId, users.id))
        .where(eq(tillSessions.handoverId, row.handover.id));

      const sessions = await Promise.all(
        sessionRows.map(async (sessionRow) => {
          const counts = await attachCounts(tenantId, sessionRow.session.id);
          return formatSession(sessionRow.session, sessionRow.userName, counts);
        }),
      );

      return {
        id: row.handover.id,
        receivedBy: row.handover.receivedBy,
        receivedByName: row.receivedByName,
        branchId: row.handover.branchId,
        totalExpected: row.handover.totalExpected,
        totalReceived: row.handover.totalReceived,
        variance: row.handover.variance,
        createdAt: row.handover.createdAt.toISOString(),
        sessions,
      };
    }),
  );

  return c.json({ handovers });
});

// GET /till/report — live reconciliation summary across all cashiers, today
tillRoutes.get("/report", async (c) => {
  const tenantId = c.get("tenantId");
  const branchId = c.get("branchId");
  const user = c.get("user");

  if (!user.canReceiveHandover && user.role !== "owner") {
    return c.json({ error: "Forbidden" }, 403);
  }

  const db = getDb();
  const todayStart = startOfToday();
  const todayEnd = endOfToday();

  const rows = await db
    .select({ session: tillSessions, userName: users.displayName })
    .from(tillSessions)
    .innerJoin(users, eq(tillSessions.userId, users.id))
    .where(
      and(
        eq(tillSessions.tenantId, tenantId),
        eq(tillSessions.branchId, branchId),
        or(
          eq(tillSessions.status, "open"),
          and(gte(tillSessions.openedAt, todayStart), lt(tillSessions.openedAt, todayEnd)),
        ),
      ),
    )
    .orderBy(desc(tillSessions.openedAt));

  const reportRows = rows.map((row) => ({
    userId: row.session.userId,
    userName: row.userName,
    sessionId: row.session.id,
    status: row.session.status,
    openingCash: row.session.openingCash,
    expectedClosingCash: row.session.expectedClosingCash,
    actualClosingCash: row.session.actualClosingCash,
    variance: row.session.variance,
    openedAt: row.session.openedAt.toISOString(),
    closedAt: row.session.closedAt ? row.session.closedAt.toISOString() : null,
    handedOver: row.session.handoverId !== null,
  }));

  const totalVariance = rows.reduce(
    (sum, row) => sum + parseFloat(row.session.variance ?? "0"),
    0,
  );

  return c.json({
    summary: {
      date: todayStart.toISOString().split("T")[0],
      rows: reportRows,
      totalVariance: roundMoney(totalVariance),
      openSessionsCount: rows.filter((r) => r.session.status === "open").length,
      closedSessionsCount: rows.filter((r) => r.session.status === "closed").length,
    },
  });
});
