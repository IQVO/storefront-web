import type { StubProduct } from "./fixtures.ts";
import { cartOffers, chargeFor, notServed, unavailableTiers } from "./stub-delivery.ts";

export interface StubCart {
  cartId: string;
  shopperId: string | null;
  state: "OPEN" | "CHECKED_OUT";
  lines: { catalogItemId: string; quantity: number }[];
  destinationPostalPrefix: string | null;
  /** When the cart was quoted (ms), null when not; served tells whether the destination had offers. */
  quotedAt: number | null;
  served: boolean;
  selections: { groupNo: number; offerId: string }[];
  version: number;
}

export interface StubSession {
  sessionId: string;
  cartId: string;
  shopperId: string;
  shipToAddressId: string;
  state: string;
  totalMinor: number;
  orderId: string | null;
  polls: number;
  version: number;
}

export interface StubOrder {
  orderId: string;
  shopperId: string;
  status: string;
  placedAt: string;
  postal: string;
  lines: { lineNo: number; catalogItemId: string; quantity: number }[];
  groups: { groupNo: number; tier: string; deliverByEarliest: string; deliverByLatest: string; timeZone?: string; lineNos: number[] }[];
  totalMinor: number;
  cancelledAt?: string;
}

export interface StubShopper {
  shopperId: string;
  email: string;
  addresses: Record<string, string>[];
}

export interface Store {
  seq: number;
  carts: Map<string, StubCart>;
  sessions: Map<string, StubSession>;
  orders: Map<string, StubOrder>;
  shoppers: Map<string, StubShopper>;
}

export const newStore = (): Store => ({ seq: 0, carts: new Map(), sessions: new Map(), orders: new Map(), shoppers: new Map() });
export const nextId = (s: Store, prefix: string): string => `${prefix}-${++s.seq}`;

const TAX_RATE = 0.0825;

/** The cart's quote groups: one shipment group holding every line, or none when unquoted or not served. */
export function quoteGroups(cart: StubCart) {
  if (cart.quotedAt === null || !cart.served || cart.lines.length === 0) return [];
  return [{ groupNo: 1, lineNos: cart.lines.map((_, i) => i + 1), offers: cartOffers(cart.cartId, 1, cart.quotedAt) }];
}

export function selectedOffer(cart: StubCart) {
  const offers = quoteGroups(cart).flatMap((g) => g.offers);
  return offers.find((o) => o.offerId === cart.selections[0]?.offerId);
}

export function cartView(cart: StubCart, byId: (id: string) => StubProduct | undefined) {
  const itemsMinor = cart.lines.reduce((n, l) => n + (byId(l.catalogItemId)?.priceMinor ?? 0) * l.quantity, 0);
  const groups = quoteGroups(cart);
  const offer = selectedOffer(cart);
  const selected = groups.length > 0 && Boolean(offer);
  const deliveryMinor = offer ? chargeFor(offer.tier, itemsMinor) : 0;
  const taxMinor = cart.destinationPostalPrefix ? Math.round(itemsMinor * TAX_RATE) : 0;
  const quote = cart.quotedAt === null ? null : {
    groups,
    unavailableTiers: cart.served ? unavailableTiers() : notServed().map((u) => u.tier),
    unavailable: cart.served ? unavailableTiers().map((tier) => ({ tier, constraint: "PAST_ORDER_DEADLINE", groupNo: 1 })) : notServed(),
    quotedAt: new Date(cart.quotedAt).toISOString(),
  };
  return {
    cartId: cart.cartId,
    shopperId: cart.shopperId,
    state: cart.state,
    lines: cart.lines,
    destinationPostalPrefix: cart.destinationPostalPrefix,
    ...(quote ? { deliveryQuote: quote } : {}),
    selections: cart.selections,
    estimate: { currency: "USD", itemsMinor, deliveryMinor, taxMinor, totalMinor: itemsMinor + deliveryMinor + taxMinor, estimateComplete: Boolean(cart.destinationPostalPrefix) && selected },
    checkoutReadiness: { ready: cart.lines.length > 0 && selected, allGroupsSelected: selected, noOfferExpired: true },
    version: cart.version,
  };
}
