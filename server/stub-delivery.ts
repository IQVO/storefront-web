// The stub's delivery network, mirroring the real contract: the destination is a 3-character postal
// prefix (customer-ordering shipto.PrefixLength = 3) and only the seeded service areas are served; any
// other destination (a full ZIP such as "78701" included) answers DESTINATION_NOT_SERVED.
export const SERVED_PREFIXES = new Set(["786", "787"]);
export const TIERS = ["SAME_DAY", "NEXT_DAY", "TWO_DAY", "STANDARD"] as const;
export type Tier = (typeof TIERS)[number];

interface Terms { tier: Tier; fromDays: number; toDays: number; chargeMinor: number; freeOverMinor?: number }

/** Offered tiers (SAME_DAY is past its cutoff in this stub), with the delivery-charge schedule. */
const OFFERED: Terms[] = [
  { tier: "NEXT_DAY", fromDays: 1, toDays: 1, chargeMinor: 999 },
  { tier: "TWO_DAY", fromDays: 2, toDays: 2, chargeMinor: 599, freeOverMinor: 5000 },
  { tier: "STANDARD", fromDays: 4, toDays: 6, chargeMinor: 499, freeOverMinor: 2500 },
];

const DAY = 86_400_000;
/** A calendar day `days` after `now`, at 18:00 UTC (mid-day in the Texas service area). */
const instant = (now: number, days: number) => {
  const d = new Date(now + days * DAY);
  d.setUTCHours(18, 0, 0, 0);
  return d.toISOString();
};
const day = (now: number, days: number) => instant(now, days).slice(0, 10);

export const isServed = (prefix: string): boolean => SERVED_PREFIXES.has(prefix);

export const notServed = () => TIERS.map((tier) => ({ tier, constraint: "DESTINATION_NOT_SERVED" }));

/** POST /products/{id}:delivery-dates tiers: instants, charges and free-over thresholds. */
export function productTiers(now: number) {
  return OFFERED.map((t) => ({
    tier: t.tier,
    deliverByEarliest: instant(now, t.fromDays),
    deliverByLatest: instant(now, t.toDays),
    offerExpiresAt: new Date(now + 15 * 60_000).toISOString(),
    charge: { amountMinor: t.chargeMinor, currency: "USD" },
    ...(t.freeOverMinor !== undefined ? { freeOver: { amountMinor: t.freeOverMinor, currency: "USD" } } : {}),
  }));
}

/** The cart quote's offers for one group: calendar dates (shopping-cart's QuotedOffer uses format date). */
export function cartOffers(cartId: string, groupNo: number, now: number) {
  return OFFERED.map((t) => ({
    offerId: `offer-${cartId}-${groupNo}-${t.tier.toLowerCase()}`,
    groupNo,
    tier: t.tier,
    deliverByEarliest: day(now, t.fromDays),
    deliverByLatest: day(now, t.toDays),
    expiresAt: new Date(now + 15 * 60_000).toISOString(),
  }));
}

export function chargeFor(tier: string, itemsMinor: number): number {
  const t = OFFERED.find((x) => x.tier === tier);
  if (!t) return 0;
  return t.freeOverMinor !== undefined && itemsMinor >= t.freeOverMinor ? 0 : t.chargeMinor;
}

export const unavailableTiers = (): Tier[] => TIERS.filter((t) => !OFFERED.some((o) => o.tier === t));
