import { describe, expect, it } from "vitest";
import { formatMinor } from "./money.ts";
import { chargeText, effectiveCharge, pickPromise, tierLabel } from "./promise.ts";
import type { DeliveryTier } from "./types.ts";

const usd = (amountMinor: number) => ({ amountMinor, currency: "USD" });
const std: DeliveryTier = { tier: "STANDARD", deliverByEarliest: "2026-11-03T18:00:00Z", deliverByLatest: "2026-11-05T18:00:00Z", charge: usd(499), freeOver: usd(2500) };
const two: DeliveryTier = { tier: "TWO_DAY", deliverByEarliest: "2026-11-01T18:00:00Z", deliverByLatest: "2026-11-01T18:00:00Z", charge: usd(599), freeOver: usd(5000) };
const next: DeliveryTier = { tier: "NEXT_DAY", deliverByEarliest: "2026-10-31T18:00:00Z", deliverByLatest: "2026-10-31T18:00:00Z", charge: usd(999) };

describe("delivery promise selection", () => {
  it("is free over the tier's threshold, else the tier's charge", () => {
    expect(effectiveCharge(std, 3499)).toBe(0);
    expect(effectiveCharge(std, 899)).toBe(499);
    expect(effectiveCharge({ ...std, charge: undefined, freeOver: undefined }, 1)).toBeNull();
  });
  it("leads with the cheapest tier and adds the fastest when it is another tier", () => {
    const p = pickPromise([next, two, std], 3499);
    expect(p?.main).toMatchObject({ tier: "STANDARD", chargeMinor: 0 });
    expect(p?.fastest).toMatchObject({ tier: "NEXT_DAY", chargeMinor: 999 });
  });
  it("breaks ties on the earliest arrival and omits a fastest line that repeats the main one", () => {
    const p = pickPromise([std, two], 6000);
    expect(p?.main.tier).toBe("TWO_DAY");
    expect(p?.fastest).toBeNull();
    expect(pickPromise([], 1)).toBeNull();
  });
  it("labels tiers and charges", () => {
    expect(tierLabel("NEXT_DAY")).toBe("Next-Day Delivery");
    expect(tierLabel("OTHER")).toBe("OTHER");
    expect(chargeText({ chargeMinor: 0, currency: "USD" }, formatMinor)).toBe("FREE");
    expect(chargeText({ chargeMinor: 499, currency: "USD" }, formatMinor)).toBe("$4.99");
    expect(chargeText({ chargeMinor: null, currency: "USD" }, formatMinor)).toBeNull();
  });
});
