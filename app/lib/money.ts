import type { Money } from "./types.ts";

/** Minor units are integers; the exponent is 2 for every currency this study uses. */
export function formatMinor(amountMinor: number, currency: string, locale = "en-US"): string {
  return new Intl.NumberFormat(locale, { style: "currency", currency }).format(amountMinor / 100);
}

export function formatMoney(m: Money | undefined, fallback = "Price unavailable"): string {
  return m ? formatMinor(m.amountMinor, m.currency) : fallback;
}

/** The parts of a price for the big-number display: "$", "1,234", "99". */
export function priceParts(amountMinor: number, currency: string, locale = "en-US"): { symbol: string; whole: string; cents: string } {
  const parts = new Intl.NumberFormat(locale, { style: "currency", currency }).formatToParts(amountMinor / 100);
  const join = (types: string[]) => parts.filter((p) => types.includes(p.type)).map((p) => p.value).join("");
  return { symbol: join(["currency"]), whole: join(["integer", "group"]), cents: join(["fraction"]) };
}
