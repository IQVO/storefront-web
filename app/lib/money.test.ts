import { describe, expect, it } from "vitest";
import { arriving, formatDay, formatLongDay, formatPlaced, formatRange, promiseDate } from "./dates.ts";
import { formatMinor, formatMoney, priceParts } from "./money.ts";

describe("money", () => {
  it("formats integer minor units", () => {
    expect(formatMinor(3499, "USD")).toBe("$34.99");
    expect(formatMinor(0, "USD")).toBe("$0.00");
    expect(formatMoney({ amountMinor: 899, currency: "USD" })).toBe("$8.99");
    expect(formatMoney(undefined)).toBe("Price unavailable");
  });
  it("splits a price into symbol, whole and cents for the big-number display", () => {
    expect(priceParts(123456, "USD")).toEqual({ symbol: "$", whole: "1,234", cents: "56" });
    expect(priceParts(899, "USD")).toEqual({ symbol: "$", whole: "8", cents: "99" });
  });
});

describe("delivery dates", () => {
  it("shows instants on the delivery area's calendar and date-only values as calendar days", () => {
    // 03:00 UTC on Jan 6 is still Jan 5 in the Texas service area.
    expect(formatDay("2030-01-06T03:00:00Z")).toBe("Sat, Jan 5");
    expect(formatDay("2030-01-05")).toBe("Sat, Jan 5");
    expect(formatLongDay("2026-10-31T18:00:00Z")).toBe("Saturday, October 31");
    expect(formatPlaced("2026-10-29T15:00:00Z")).toBe("Oct 29, 2026");
  });
  it("collapses single-day windows and formats ranges like a retailer", () => {
    expect(formatRange("2030-01-05T14:00:00Z", "2030-01-05T23:59:00Z")).toBe("Sat, Jan 5");
    expect(formatRange("2030-01-10", "2030-01-12")).toBe("Thu, Jan 10 – Sat, Jan 12");
    expect(promiseDate("2026-10-31T18:00:00Z", "2026-10-31T22:00:00Z")).toBe("Saturday, October 31");
    expect(promiseDate("2026-10-31", "2026-11-01")).toBe("Sat, Oct 31 – Sun, Nov 1");
    expect(arriving("2026-10-31", "2026-11-01")).toBe("Arriving Oct 31 – Nov 1");
    expect(arriving("2026-10-31", "2026-10-31")).toBe("Arriving Saturday, Oct 31");
  });
});
