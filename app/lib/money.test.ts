import { describe, expect, it } from "vitest";
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
