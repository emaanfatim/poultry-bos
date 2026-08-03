import type { Unit } from "@repo/types";

/** Whether two units convert against each other (same type + same base unit). */
export function sameFamily(a: Unit, b: Unit): boolean {
  if (a.type !== b.type) return false;
  const baseOf = (u: Unit) => u.baseUnitId ?? u.id;
  return baseOf(a) === baseOf(b);
}
