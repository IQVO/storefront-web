import { describe, expect, it } from "vitest";
import { isInDoubt, offerById, reviewGroups } from "./checkout.ts";
import type { Cart, CheckoutSession } from "./types.ts";

const cart: Cart = {
  cartId: "c1", state: "OPEN", version: 1, lines: [{ catalogItemId: "a", quantity: 1 }, { catalogItemId: "b", quantity: 2 }],
  deliveryQuote: { groups: [{ groupNo: 1, lineNos: [1, 2], offers: [{ offerId: "o1", groupNo: 1, tier: "STANDARD", deliverByEarliest: "2026-11-03", deliverByLatest: "2026-11-05", expiresAt: "x" }] }], unavailableTiers: [], quotedAt: "x" },
  selections: [{ groupNo: 1, offerId: "o1" }],
};

describe("checkout review", () => {
  it("finds the quoted offer behind an offer id", () => {
    expect(offerById(cart, "o1")?.tier).toBe("STANDARD");
    expect(offerById(cart, "nope")).toBeUndefined();
    expect(offerById(null, "o1")).toBeUndefined();
  });
  it("reviews the cart's selections before a session exists, and the session's groups after", () => {
    expect(reviewGroups(cart, null)).toEqual([{ groupNo: 1, tier: "STANDARD", offer: cart.deliveryQuote?.groups[0]?.offers[0], lines: cart.lines }]);
    const s = { lines: [{ lineNo: 1, catalogItemId: "a", quantity: 1 }], groups: [{ groupNo: 1, offerId: "o1", tier: "STANDARD", lineNos: [1, 9], amountMinor: 0 }] } as unknown as CheckoutSession;
    expect(reviewGroups(null, s)).toEqual([{ groupNo: 1, tier: "STANDARD", offer: undefined, lines: [{ lineNo: 1, catalogItemId: "a", quantity: 1 }] }]);
    expect(reviewGroups({ ...cart, selections: [{ groupNo: 2, offerId: "zz" }] }, null)).toEqual([{ groupNo: 2, tier: "", offer: undefined, lines: [] }]);
  });
  it("knows which placements are still in doubt", () => {
    expect(isInDoubt("AUTHORIZING")).toBe(true);
    expect(isInDoubt("COMPLETED")).toBe(false);
  });
});
