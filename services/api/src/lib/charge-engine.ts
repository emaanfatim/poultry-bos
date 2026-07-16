// Charge Rule Engine — implements charges-tax-module-dev-handover.md §4
// (calculation algorithm), §4.1 (interactive cash rounding), and §5
// (circular dependency prevention). This is the one piece the rest of the
// module (sales.ts, charge-resolution.ts, charge-categories.ts) is built
// against but that didn't exist yet — everything here is written to match
// the exact call sites already in those files.
//
// Critical rule carried through this whole file (§4, closing note): never
// round any intermediate value. Every function below works in full-
// precision floats; only the caller (sales.ts, at insert time) rounds to
// 2dp for storage.

export type ChargeCategoryType = "tax" | "surcharge" | "other";
export type CalculationType = "fixed" | "percentage";
export type ChargeScope = "per_product" | "whole_bill";
export type ConditionType = "payment_method" | "manual_selection" | "default";
export type RoundingMethod = "exact" | "round_up" | "round_down" | "custom";

export interface ChargeCategoryLike {
  id: string;
  categoryType: ChargeCategoryType;
  countsTowardOtherBases: boolean;
  refundableOnReturn: boolean;
  isActive: boolean;
}

export interface ChargeRateLineLike {
  id: string;
  chargeCategoryId: string;
  calculationType: CalculationType;
  value: string;
  scope: ChargeScope;
  conditionType: ConditionType;
  conditionPaymentMethodId: string | null;
  manualSelectionLabel: string | null;
  dependsOnChargeCategoryId: string | null;
}

// One already-resolved (category, rate line) pairing that applies to this
// bill. Per_product scope produces one ResolvedCharge per line item that
// carries the category (lineItemId/lineItemBase set); whole_bill scope
// produces exactly one, deduped by category (see sales.ts wholeBillSeen).
export interface ResolvedCharge {
  category: ChargeCategoryLike;
  rateLine: ChargeRateLineLike;
  lineItemId?: string;
  lineItemBase?: number;
}

export interface CalculatedChargeLine {
  categoryId: string;
  rateLineId: string;
  categoryType: ChargeCategoryType;
  calculationType: CalculationType;
  rateValue: string;
  baseAmount: number;
  calculatedAmount: number;
  includedInOtherCategoryBase: boolean;
  // Set only for per_product-scope lines — the synthetic `idx:N` placeholder
  // sales.ts maps onto a real transaction_line_items id after insert.
  lineItemId?: string;
}

export interface CalculateChargesInput {
  discountedSubtotal: number;
  charges: ResolvedCharge[];
}

export interface CalculateChargesResult {
  // Full precision, §4 step 6 — discountedSubtotal + all non-tax + all tax.
  trueTotal: number;
  nonTaxLines: CalculatedChargeLine[];
  taxLines: CalculatedChargeLine[];
}

/**
 * §1 rate-line resolution — picks the one rate line that applies out of a
 * category's set, in priority order: an exact payment-method match, then a
 * manual-selection match, then the mandatory `default` fallback. Returns
 * null only if the category has no `default` line configured (a data
 * problem — callers skip rather than crash checkout, per sales.ts).
 */
export function selectApplicableRateLine(
  rateLines: ChargeRateLineLike[],
  context: { paymentMethodId?: string; manualSelectionLabel?: string },
): ChargeRateLineLike | null {
  if (context.paymentMethodId) {
    const match = rateLines.find(
      (rl) =>
        rl.conditionType === "payment_method" &&
        rl.conditionPaymentMethodId === context.paymentMethodId,
    );
    if (match) return match;
  }
  if (context.manualSelectionLabel) {
    const match = rateLines.find(
      (rl) =>
        rl.conditionType === "manual_selection" &&
        rl.manualSelectionLabel === context.manualSelectionLabel,
    );
    if (match) return match;
  }
  return rateLines.find((rl) => rl.conditionType === "default") ?? null;
}

/**
 * Topological sort via DFS. Throws if a cycle is found — should be
 * unreachable at calculation time if §5's save-time validateNoCycle ran
 * correctly, but this is a deliberate defensive backstop rather than an
 * infinite loop if that invariant is ever violated.
 */
function topologicalSort(ids: string[], dependsOn: (id: string) => string | null): string[] {
  const visited = new Set<string>();
  const visiting = new Set<string>();
  const order: string[] = [];

  const visit = (id: string) => {
    if (visited.has(id)) return;
    if (visiting.has(id)) {
      throw new Error(`Circular charge category dependency detected involving category ${id}`);
    }
    visiting.add(id);
    const dep = dependsOn(id);
    if (dep) visit(dep);
    visiting.delete(id);
    visited.add(id);
    order.push(id);
  };

  for (const id of ids) visit(id);
  return order;
}

/**
 * §4 steps 4-6 — the core calculation. Resolves every non-tax category in
 * dependency order, then every tax category last (tax can never be a
 * dependency target — enforced at save time in §5's validateNoCycle), and
 * sums everything into the full-precision trueTotal.
 *
 * Design note (the doc specifies the ordering and base-resolution rule but
 * not the exact dimensional handling of a dependency across scopes, so this
 * is the concrete implementation): a depended-on category's contribution to
 * another category's base is that category's *total calculated amount*
 * across the whole bill (summed across all its line items if per_product,
 * or its single whole-bill amount otherwise) — added once per unit of the
 * dependent category. In the normal case (a whole_bill category depending
 * on another whole_bill or per_product category) this behaves exactly as
 * the worked examples in the doc describe. A per_product category
 * depending on a bill-level total is an edge case the doc doesn't spell
 * out; this implementation adds the same scalar dependency amount into
 * every line's base, which is the most literal reading of "discounted
 * subtotal + any dependency amounts it's configured to include" (§4 step
 * 4d) applied per unit.
 */
export function calculateCharges(input: CalculateChargesInput): CalculateChargesResult {
  const { discountedSubtotal, charges } = input;

  // Group resolved charges by category id. Every entry for the same
  // category shares the same rate line (exactly one is resolved per
  // category per checkout, via selectApplicableRateLine upstream) — only
  // lineItemId/lineItemBase differ across per_product entries.
  const byCategory = new Map<string, ResolvedCharge[]>();
  for (const charge of charges) {
    const list = byCategory.get(charge.category.id) ?? [];
    list.push(charge);
    byCategory.set(charge.category.id, list);
  }

  const categoryIds = [...byCategory.keys()];
  const nonTaxIds = categoryIds.filter(
    (id) => byCategory.get(id)![0]!.category.categoryType !== "tax",
  );
  const taxIds = categoryIds.filter(
    (id) => byCategory.get(id)![0]!.category.categoryType === "tax",
  );

  // Only follow a dependency edge if the depended-on category is actually
  // present in this bill's resolved set — a category assigned elsewhere in
  // the catalogue but not to anything on this particular bill contributes
  // nothing, it's simply not part of this calculation.
  const dependsOn = (id: string): string | null => {
    const dep = byCategory.get(id)![0]!.rateLine.dependsOnChargeCategoryId;
    return dep && byCategory.has(dep) ? dep : null;
  };

  const nonTaxOrder = topologicalSort(nonTaxIds, dependsOn);
  // §4 step 5 — tax is always resolved last, after every non-tax category,
  // regardless of ordering among tax categories themselves (tax can never
  // depend on tax, so there's no ordering constraint left to resolve there).
  const order = [...nonTaxOrder, ...taxIds];

  const dependedOnBy = new Set<string>();
  for (const id of order) {
    const dep = dependsOn(id);
    if (dep) dependedOnBy.add(dep);
  }

  const totalsById = new Map<string, number>();
  const nonTaxLines: CalculatedChargeLine[] = [];
  const taxLines: CalculatedChargeLine[] = [];

  for (const categoryId of order) {
    const entries = byCategory.get(categoryId)!;
    const { category, rateLine } = entries[0]!;
    const dep = dependsOn(categoryId);
    const dependencyAmount = dep ? totalsById.get(dep) ?? 0 : 0;
    const rateValueNum = parseFloat(rateLine.value);

    let categoryTotal = 0;
    const lines: CalculatedChargeLine[] = [];

    for (const entry of entries) {
      const ownBase =
        rateLine.scope === "per_product" ? entry.lineItemBase ?? 0 : discountedSubtotal;
      const base = ownBase + dependencyAmount;
      const calculatedAmount =
        rateLine.calculationType === "fixed" ? rateValueNum : (base * rateValueNum) / 100;

      categoryTotal += calculatedAmount;
      lines.push({
        categoryId,
        rateLineId: rateLine.id,
        categoryType: category.categoryType,
        calculationType: rateLine.calculationType,
        rateValue: rateLine.value,
        baseAmount: base,
        calculatedAmount,
        includedInOtherCategoryBase: false, // finalized below once the total is known
        lineItemId: entry.lineItemId,
      });
    }

    totalsById.set(categoryId, categoryTotal);

    const included = dependedOnBy.has(categoryId);
    for (const line of lines) {
      line.includedInOtherCategoryBase = included;
      if (category.categoryType === "tax") taxLines.push(line);
      else nonTaxLines.push(line);
    }
  }

  const nonTaxTotal = nonTaxIds.reduce((sum, id) => sum + (totalsById.get(id) ?? 0), 0);
  const taxTotal = taxIds.reduce((sum, id) => sum + (totalsById.get(id) ?? 0), 0);
  const trueTotal = discountedSubtotal + nonTaxTotal + taxTotal;

  return { trueTotal, nonTaxLines, taxLines };
}

/**
 * §1/§5 — a tax-type category can never be depended on by another category's
 * base, and that must be structurally forced, not just validated. The
 * database check constraint (charge_categories_tax_cannot_count_toward_other_bases)
 * is the real backstop; this mirrors it at the application layer so a save
 * request never even reaches the DB with a mismatched value.
 */
export function normalizeCountsTowardOtherBases(
  categoryType: ChargeCategoryType,
  requested: boolean,
): boolean {
  return categoryType === "tax" ? false : requested;
}

export interface ChargeCategoryGraphNode {
  id: string;
  categoryType: ChargeCategoryType;
  dependsOn: string[];
}

/**
 * §5 — save-time circular dependency validation, exact algorithm from the
 * handover doc. `allCategories` must include every current-version category
 * for the tenant (plus the category being saved, even if it doesn't exist
 * yet), each with its already-known dependsOn edges.
 */
export function validateNoCycle(
  categoryId: string,
  dependsOnId: string,
  allCategories: Map<string, ChargeCategoryGraphNode>,
): void {
  if (categoryId === dependsOnId) {
    throw new Error("A charge category cannot depend on itself");
  }
  const dependsOnNode = allCategories.get(dependsOnId);
  if (dependsOnNode?.categoryType === "tax") {
    throw new Error("Non-tax categories cannot depend on a tax category");
  }

  const visited = new Set<string>();
  const stack = [dependsOnId];
  while (stack.length > 0) {
    const current = stack.pop()!;
    if (current === categoryId) {
      throw new Error("This would create a circular charge category dependency");
    }
    if (visited.has(current)) continue;
    visited.add(current);
    const node = allCategories.get(current);
    if (node) stack.push(...node.dependsOn);
  }
}

// ─── §4.1 — Interactive cash rounding ───────────────────────────────────────

export interface ApplyRoundingInput {
  trueTotal: number;
  method: RoundingMethod;
  increment: number;
  threshold: number;
  customAmount?: number;
  hasCustomCashPermission: boolean;
  customEntryMaxDeviation: number | null;
  customEntryStepMultiple: number | null;
}

export interface ApplyRoundingResult {
  total: number;
  roundingAdjustment: number;
  roundingMethod: RoundingMethod;
}

function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/**
 * §4.1 — cashier-facing rounding flow, called only when the selected
 * payment method's requiresRounding = true (sales.ts gates the call itself;
 * this function assumes it's already appropriate to run).
 *
 * `threshold` is accepted for interface symmetry with the branch settings
 * object and is what a client-side UI uses to pre-select a suggested
 * default (§4.1's `suggestedMethod` calculation) — it plays no role in the
 * actual charged amount once the cashier's chosen `method` reaches here,
 * since Exact/Round Up/Round Down/Custom are all explicit, deliberate
 * choices, not threshold-driven outcomes.
 */
export function applyRounding(input: ApplyRoundingInput): ApplyRoundingResult {
  const {
    trueTotal,
    method,
    increment,
    customAmount,
    hasCustomCashPermission,
    customEntryMaxDeviation,
    customEntryStepMultiple,
  } = input;

  // Round Down and Custom are gated — the business is knowingly collecting
  // a self-chosen amount rather than the exact/rounded-up figure. Exact and
  // Round Up are always available to every cashier (§4.1 table).
  if ((method === "round_down" || method === "custom") && !hasCustomCashPermission) {
    throw new Error("You don't have permission to apply this rounding method");
  }

  let total: number;

  if (method === "exact") {
    total = trueTotal;
  } else if (method === "round_up" || method === "round_down") {
    if (increment <= 0) {
      throw new Error("Branch rounding increment must be greater than zero");
    }
    const remainder = round2(trueTotal % increment);
    if (remainder === 0) {
      total = trueTotal;
    } else if (method === "round_up") {
      total = trueTotal - remainder + increment;
    } else {
      total = trueTotal - remainder;
    }
  } else {
    // custom — validateCustomEntry from §4.1, inlined here since both
    // checks gate the same confirmation step.
    if (customAmount === undefined || customAmount === null) {
      throw new Error("customAmount is required for custom rounding");
    }
    const deviation = Math.abs(round2(customAmount - trueTotal));
    if (customEntryMaxDeviation !== null && deviation > customEntryMaxDeviation) {
      throw new Error("Amount is too far from the billed total");
    }
    if (customEntryStepMultiple !== null && customEntryStepMultiple > 0) {
      const remainder = round2(customAmount % customEntryStepMultiple);
      const distanceToNextMultiple = round2(customEntryStepMultiple - remainder);
      if (remainder !== 0 && distanceToNextMultiple !== 0) {
        throw new Error(`Amount must be a multiple of ${customEntryStepMultiple}`);
      }
    }
    total = customAmount;
  }

  return {
    total: round2(total),
    roundingAdjustment: round2(total - trueTotal),
    roundingMethod: method,
  };
}
