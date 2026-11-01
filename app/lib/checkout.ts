import type { Cart, CheckoutSession, QuotedOffer } from "./types.ts";

/** What the shopper sees when a confirm answered with a session that is not a success. */
export function outcomeMessage(s: CheckoutSession): string | null {
  switch (s.state) {
    case "DECLINED":
      return "Your payment was declined. You can try again with a different payment method.";
    case "REQUOTE_REQUIRED":
      return "Delivery options changed while you were checking out. Please review your cart again.";
    case "EXPIRED":
      return "This checkout expired. Start again from your cart.";
    case "FAILED":
      return `We could not complete the order${s.failureCode ? ` (${s.failureCode})` : ""}. Nothing was charged.`;
    default:
      return null;
  }
}

export const isInDoubt = (state: string): boolean => state === "PLACING" || state === "AUTHORIZING";

/** The quoted offer (tier and promised window) behind an offer id, from the cart's delivery quote. */
export function offerById(cart: Cart | null | undefined, offerId: string): QuotedOffer | undefined {
  for (const g of cart?.deliveryQuote?.groups ?? []) {
    const o = g.offers.find((x) => x.offerId === offerId);
    if (o) return o;
  }
  return undefined;
}

export interface ReviewGroup {
  groupNo: number;
  tier: string;
  offer?: QuotedOffer;
  lines: { catalogItemId: string; quantity: number }[];
}

/** The shipment groups to review: the open session's when there is one, else the cart's selections. */
export function reviewGroups(cart: Cart | null | undefined, session: CheckoutSession | null | undefined): ReviewGroup[] {
  if (session) {
    const byNo = new Map(session.lines.map((l) => [l.lineNo, l]));
    return session.groups.map((g) => ({
      groupNo: g.groupNo,
      tier: g.tier,
      offer: offerById(cart, g.offerId),
      lines: g.lineNos.map((n) => byNo.get(n)).filter((l): l is NonNullable<typeof l> => Boolean(l)),
    }));
  }
  return (cart?.selections ?? []).map((s) => {
    const offer = offerById(cart, s.offerId);
    const group = cart?.deliveryQuote?.groups.find((g) => g.groupNo === s.groupNo);
    return {
      groupNo: s.groupNo,
      tier: offer?.tier ?? "",
      offer,
      lines: (group?.lineNos ?? []).map((n) => cart?.lines[n - 1]).filter((l): l is NonNullable<typeof l> => Boolean(l)),
    };
  });
}
