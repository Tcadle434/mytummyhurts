/**
 * Canonical text normalization for the scan engine.
 *
 * Lowercases, trims, and collapses any run of non-alphanumeric characters
 * (including punctuation and whitespace) into single spaces. Accepts
 * null/undefined, which normalize to an empty string.
 *
 * NOTE: This intentionally does NOT expand `&` to `and`. Helpers that need
 * that behavior (e.g. menu/diet text matching) keep their own variant.
 */
export function normalize(value: string | undefined | null): string {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
