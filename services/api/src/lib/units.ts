// Conversion math for the Units feature. A unit either IS a base unit (isBase
// true, baseUnitId null) or converts into exactly one base unit via
// conversionFactor (e.g. 1 Maund = 40 Kilograms, 1 Pound = 0.45359237 Kilograms).

export interface UnitLike {
  id: string;
  type: string;
  isBase: boolean;
  baseUnitId: string | null;
  conversionFactor: string | null;
}

/** How many base units equal 1 of this unit. Base units themselves are 1. */
export function unitFactor(unit: UnitLike): number {
  if (unit.isBase) return 1;
  return parseFloat(unit.conversionFactor ?? "1");
}

/** Whether two units convert against each other (same type + same base unit). */
export function sameFamily(a: UnitLike, b: UnitLike): boolean {
  if (a.type !== b.type) return false;
  const baseOf = (u: UnitLike) => u.baseUnitId ?? u.id;
  return baseOf(a) === baseOf(b);
}

/** Convert a quantity expressed in `from` into the equivalent quantity in `to`. */
export function convertQuantity(quantity: number, from: UnitLike, to: UnitLike): number {
  if (from.id === to.id) return quantity;
  return (quantity * unitFactor(from)) / unitFactor(to);
}

/**
 * Given a price per `priceUnit`, return the equivalent price per `targetUnit`.
 * e.g. priceUnitRate = "290.00" (per kg), priceUnit = kg, targetUnit = maund (factor 40)
 *   → "11600.00" (per maund)
 */
export function rateForUnit(priceUnitRate: string, priceUnit: UnitLike, targetUnit: UnitLike): string {
  const rate = parseFloat(priceUnitRate);
  const converted = rate * (unitFactor(targetUnit) / unitFactor(priceUnit));
  return converted.toFixed(2);
}
