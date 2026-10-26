import { describe, expect, it } from "vitest";
import { formatDay, formatMinor, formatMoney, formatRange } from "./money.ts";

describe("money", () => {
  it("formats integer minor units", () => {
    expect(formatMinor(3499, "USD")).toBe("$34.99");
    expect(formatMinor(0, "USD")).toBe("$0.00");
    expect(formatMoney({ amountMinor: 899, currency: "USD" })).toBe("$8.99");
    expect(formatMoney(undefined)).toBe("Price unavailable");
  });
  it("formats dates in UTC and collapses single-day ranges", () => {
    expect(formatDay("2030-01-05T23:30:00Z")).toBe("Sat, Jan 5");
    expect(formatRange("2030-01-05T00:00:00Z", "2030-01-05T23:59:00Z")).toBe("Sat, Jan 5");
    expect(formatRange("2030-01-10T00:00:00Z", "2030-01-12T00:00:00Z")).toBe("Thu, Jan 10 – Sat, Jan 12");
  });
});
