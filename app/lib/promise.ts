import { promiseDate } from "./dates.ts";
import type { DeliveryTier, Tier } from "./types.ts";

export const TIER_LABEL: Record<Tier, string> = {
  SAME_DAY: "Same-Day Delivery",
  NEXT_DAY: "Next-Day Delivery",
  TWO_DAY: "Two-Day Delivery",
  STANDARD: "Standard Delivery",
};

export const tierLabel = (t: string): string => TIER_LABEL[t as Tier] ?? t;

export interface PromiseOption {
  tier: Tier;
  earliest: string;
  latest: string;
  /** The window's IANA zone; absent means UTC. */
  timeZone?: string;
  /** The charge for this order value: 0 when free (no charge, or the order is over the tier's free threshold); null when unknown. */
  chargeMinor: number | null;
  currency: string;
}

/** What a tier costs for an order of orderMinor: free over its threshold, else its charge. */
export function effectiveCharge(t: DeliveryTier, orderMinor: number): number | null {
  const charge = t.charge?.amountMinor;
  const over = t.freeOver?.amountMinor;
  if (over !== undefined && orderMinor >= over) return 0;
  return charge ?? null;
}

const toOption = (t: DeliveryTier, orderMinor: number, currency: string): PromiseOption => ({
  tier: t.tier,
  earliest: t.deliverByEarliest,
  latest: t.deliverByLatest,
  ...(t.timeZone ? { timeZone: t.timeZone } : {}),
  chargeMinor: effectiveCharge(t, orderMinor),
  currency: t.charge?.currency ?? currency,
});

/**
 * The buy box's promise: the main line is the cheapest tier (free when the order is over its threshold),
 * the earliest when tied; the fastest line is the tier that arrives first, when that is another tier.
 */
export function pickPromise(tiers: DeliveryTier[], orderMinor: number, currency = "USD"): { main: PromiseOption; fastest: PromiseOption | null } | null {
  if (tiers.length === 0) return null;
  const opts = tiers.map((t) => toOption(t, orderMinor, currency));
  const cost = (o: PromiseOption) => o.chargeMinor ?? Number.MAX_SAFE_INTEGER;
  const byArrival = (a: PromiseOption, b: PromiseOption) => a.latest.localeCompare(b.latest) || a.earliest.localeCompare(b.earliest);
  const main = [...opts].sort((a, b) => cost(a) - cost(b) || byArrival(a, b))[0] as PromiseOption;
  const fastest = [...opts].sort(byArrival)[0] as PromiseOption;
  // A faster tier that lands on the same promised day(s) adds nothing for the shopper.
  const sameDays = sameWindow(fastest, main);
  return { main, fastest: fastest.tier === main.tier || sameDays ? null : fastest };
}

function sameWindow(a: PromiseOption, b: PromiseOption): boolean {
  return promiseDate(a.earliest, a.latest, a.timeZone) === promiseDate(b.earliest, b.latest, b.timeZone);
}

/** "FREE" or "$4.99"; null when the charge is unknown. */
export function chargeText(o: Pick<PromiseOption, "chargeMinor" | "currency">, format: (minor: number, currency: string) => string): string | null {
  if (o.chargeMinor === null) return null;
  return o.chargeMinor === 0 ? "FREE" : format(o.chargeMinor, o.currency);
}
