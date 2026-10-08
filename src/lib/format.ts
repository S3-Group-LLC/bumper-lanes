/** Small helpers for showing values to people. */

/** Shows a price stored in cents, e.g. 350 → "$3.50". */
export function formatPrice(cents: number, currency = 'USD', locale = 'en-US'): string {
  return new Intl.NumberFormat(locale, { style: 'currency', currency }).format(cents / 100);
}
