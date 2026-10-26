import type { Money } from "./types.ts";

/** Minor units are integers; the exponent is 2 for every currency this study uses. */
export function formatMinor(amountMinor: number, currency: string, locale = "en-US"): string {
  return new Intl.NumberFormat(locale, { style: "currency", currency }).format(amountMinor / 100);
}

export function formatMoney(m: Money | undefined, fallback = "Price unavailable"): string {
  return m ? formatMinor(m.amountMinor, m.currency) : fallback;
}

export function formatDay(iso: string, locale = "en-US"): string {
  return new Intl.DateTimeFormat(locale, { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" }).format(new Date(iso));
}

export function formatRange(earliest: string, latest: string): string {
  const a = formatDay(earliest);
  const b = formatDay(latest);
  return a === b ? a : `${a} – ${b}`;
}
