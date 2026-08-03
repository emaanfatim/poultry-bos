import type { Unit } from "@repo/types";

/** How many base units equal 1 of this unit. Base units themselves are 1. */
export function unitFactor(unit: Unit): number {
  if (unit.isBase) return 1;
  return parseFloat(unit.conversionFactor ?? "1");
}

export function sameFamily(a: Unit, b: Unit): boolean {
  if (a.type !== b.type) return false;
  const baseOf = (u: Unit) => u.baseUnitId ?? u.id;
  return baseOf(a) === baseOf(b);
}

export function convertQuantity(quantity: number, from: Unit, to: Unit): number {
  if (from.id === to.id) return quantity;
  return (quantity * unitFactor(from)) / unitFactor(to);
}

/** Price per `priceUnit` converted into price per `targetUnit`. */
export function rateForUnit(priceUnitRate: string, priceUnit: Unit, targetUnit: Unit): string {
  const rate = parseFloat(priceUnitRate);
  const converted = rate * (unitFactor(targetUnit) / unitFactor(priceUnit));
  return converted.toFixed(2);
}
