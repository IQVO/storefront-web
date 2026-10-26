import type { StubProduct } from "./fixtures.ts";

export interface StubCart {
  cartId: string;
  shopperId: string | null;
  state: "OPEN" | "CHECKED_OUT";
  lines: { catalogItemId: string; quantity: number }[];
  destinationPostalPrefix: string | null;
  quoted: boolean;
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

export type PriceOf = (p: StubProduct | undefined) => number;

const DELIVERY_MINOR = 499;
const TAX_RATE = 0.08;

export function cartView(store: Store, cart: StubCart, byId: (id: string) => StubProduct | undefined) {
  const itemsMinor = cart.lines.reduce((n, l) => n + (byId(l.catalogItemId)?.priceMinor ?? 0) * l.quantity, 0);
  const groups = cart.quoted && cart.lines.length > 0
    ? [{ groupNo: 1, lineNos: cart.lines.map((_, i) => i + 1), offers: [
        { offerId: `offer-${cart.cartId}-std`, groupNo: 1, tier: "STANDARD", deliverByEarliest: "2030-01-10", deliverByLatest: "2030-01-12", expiresAt: "2030-01-01T00:00:00Z" },
        { offerId: `offer-${cart.cartId}-nxt`, groupNo: 1, tier: "NEXT_DAY", deliverByEarliest: "2030-01-05", deliverByLatest: "2030-01-05", expiresAt: "2030-01-01T00:00:00Z" },
      ] }]
    : [];
  const selected = cart.selections.length === groups.length && groups.length > 0;
  const deliveryMinor = selected ? DELIVERY_MINOR : 0;
  const taxMinor = Math.round(itemsMinor * TAX_RATE);
  void store;
  return {
    cartId: cart.cartId,
    shopperId: cart.shopperId,
    state: cart.state,
    lines: cart.lines,
    destinationPostalPrefix: cart.destinationPostalPrefix,
    ...(cart.quoted ? { deliveryQuote: { groups, unavailableTiers: ["SAME_DAY", "TWO_DAY"], quotedAt: "2030-01-01T00:00:00Z" } } : {}),
    selections: cart.selections,
    estimate: { currency: "USD", itemsMinor, deliveryMinor, taxMinor, totalMinor: itemsMinor + deliveryMinor + taxMinor },
    checkoutReadiness: { ready: cart.lines.length > 0 && selected, allGroupsSelected: selected, noOfferExpired: true },
    version: cart.version,
  };
}
