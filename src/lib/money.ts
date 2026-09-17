/**
 * Parses a rupee amount typed by a person or found in a spreadsheet:
 * "2500", "2,500", "₹2,500", "Rs. 2,500/-", "INR 2500.50", 2500.
 * Returns undefined for blank, null for anything that isn't a valid non-negative amount.
 */
export function parseRupees(input: unknown): number | undefined | null {
  if (input == null) return undefined;
  if (typeof input === 'number') return Number.isFinite(input) && input >= 0 ? input : null;
  const s = String(input)
    .trim()
    .replace(/^(₹|rs\.?|inr)\s*/i, '')
    .replace(/\/-$/, '')
    .replace(/[,\s]/g, '');
  if (s === '' || s === '-') return undefined;
  if (!/^\d*\.?\d+$/.test(s)) return null;
  return Number(s);
}
