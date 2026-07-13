/**
 * Loose international phone validation.
 * Accepts: optional leading +, then digits/spaces/hyphens, 7-15 digits total.
 * Works for PK, IN, US, UK, UAE, and virtually any country.
 * Does NOT verify the number is real or reachable.
 */
export function validatePhone(raw: string): { valid: boolean; error: string | null } {
  if (!raw.trim()) return { valid: false, error: null };

  const digitsOnly = raw.replace(/[\s\-\(\)]/g, "");

  if (!/^\+?\d+$/.test(digitsOnly)) {
    return { valid: false, error: "Only digits, spaces, or hyphens allowed" };
  }

  const digitCount = digitsOnly.replace("+", "").length;

  if (digitCount < 7) {
    return { valid: false, error: "Too short — minimum 7 digits" };
  }
  if (digitCount > 15) {
    return { valid: false, error: "Too long — maximum 15 digits" };
  }

  return { valid: true, error: null };
}
