import { byId } from "./fixtures.ts";
import { looksLikeCard, ok, problem, str, type Ctx, type Reply } from "./stub.ts";
import { cartView, nextId, quoteGroups, selectedOffer, type StubOrder } from "./stub-state.ts";
import { DESTINATION_TIME_ZONE, windowEnd, windowStart } from "./stub-delivery.ts";

const needShopper = () => problem(422, "session-required", "Sign in or register first");

export function checkoutRoutes(ctx: Ctx): Reply | null {
  const { store, method, path, body, state } = ctx;
  const session = (s: NonNullable<ReturnType<typeof store.sessions.get>>) => {
    const cart = store.carts.get(s.cartId);
    const offer = cart ? selectedOffer(cart) : undefined;
    const delivery = cart ? cartView(cart, byId).estimate.deliveryMinor : 0;
    return {
      sessionId: s.sessionId, state: s.state, cartId: s.cartId, cartVersion: cart?.version ?? 1, shopperId: s.shopperId, shipToAddressId: s.shipToAddressId,
      lines: (cart?.lines ?? []).map((l, i) => ({ lineNo: i + 1, ...l })),
      groups: [{ groupNo: 1, offerId: offer?.offerId ?? "offer", tier: offer?.tier ?? "STANDARD", lineNos: (cart?.lines ?? []).map((_, i) => i + 1), amountMinor: delivery }],
      currency: "USD", totalMinor: s.totalMinor, quoteExpiresAt: new Date(Date.now() + 15 * 60_000).toISOString(), orderId: s.orderId, version: s.version,
    };
  };
  if (path === "/checkout" && method === "POST") {
    if (!state.s) return needShopper();
    const cartId = str(body["cartId"]) || state.c || "";
    const cart = store.carts.get(cartId);
    if (!cart || cart.lines.length === 0 || !cartView(cart, byId).checkoutReadiness.ready) return problem(409, "cart-not-ready", "The cart is not ready for checkout");
    const shopper = store.shoppers.get(state.s);
    const addressId = str(body["shipToAddressId"]);
    if (!shopper?.addresses.some((_, i) => `addr-${shopper.shopperId}-${i + 1}` === addressId)) return problem(422, "validation-failed", "Unknown saved address");
    const total = cartView(cart, byId).estimate.totalMinor;
    const s = { sessionId: nextId(store, "sess"), cartId, shopperId: state.s, shipToAddressId: addressId, state: "OPEN", totalMinor: total, orderId: null, polls: 0, version: 1 };
    store.sessions.set(s.sessionId, s);
    ctx.setState.k = s.sessionId;
    return ok(session(s), 201);
  }
  const m = /^\/checkout\/([^/:]+)(:confirm)?$/.exec(path);
  if (!m) return null;
  const s = store.sessions.get(decodeURIComponent(m[1] ?? ""));
  if (!s) return problem(404, "not-found", "Checkout session not found");
  if (!m[2] && method === "GET") {
    if (s.state === "PLACING" && ++s.polls >= 2) place(ctx, s);
    return ok(session(s));
  }
  if (m[2] && method === "POST") {
    const token = str(body["paymentMethodToken"]);
    if (Object.keys(body).some((k) => /^(card|pan|cvc|cvv|number|expiry)/i.test(k)) || looksLikeCard(token)) {
      return problem(422, "validation-failed", "Card data is not accepted; send a payment method token");
    }
    if (s.state === "COMPLETED") return ok(session(s));
    if (token === "tok_decline") { s.state = "DECLINED"; return ok(session(s)); }
    if (token === "tok_timeout") { s.state = "PLACING"; s.polls = 0; return ok(session(s), 202); }
    place(ctx, s);
    return ok(session(s));
  }
  return null;
}

function place(ctx: Ctx, s: { cartId: string; shopperId: string; state: string; orderId: string | null; totalMinor: number }): void {
  const { store } = ctx;
  const cart = store.carts.get(s.cartId);
  const offer = cart ? selectedOffer(cart) : undefined;
  const lineNos = (cart?.lines ?? []).map((_, i) => i + 1);
  // customer-ordering stores the promise as instants with the destination's zone; the cart quoted calendar days.
  const now = new Date().toISOString();
  const order: StubOrder = {
    orderId: nextId(store, "ord"), shopperId: s.shopperId, status: "PLACED", placedAt: now,
    postal: cart?.destinationPostalPrefix ?? "000", totalMinor: s.totalMinor,
    lines: (cart?.lines ?? []).map((l, i) => ({ lineNo: i + 1, ...l })),
    groups: offer && cart && quoteGroups(cart).length > 0
      ? [{ groupNo: 1, tier: offer.tier, deliverByEarliest: windowStart(offer.deliverByEarliest), deliverByLatest: windowEnd(offer.deliverByLatest), timeZone: DESTINATION_TIME_ZONE, lineNos }]
      : [],
  };
  store.orders.set(order.orderId, order);
  if (cart) cart.state = "CHECKED_OUT";
  s.state = "COMPLETED";
  s.orderId = order.orderId;
}

export function orderRoutes(ctx: Ctx): Reply | null {
  const { store, method, path, body, state } = ctx;
  const groupStatus = (o: StubOrder) => (o.status === "CANCELLED" ? "CANCELLED" : "PROMISED");
  const view = (o: StubOrder) => ({
    orderId: o.orderId, shopperId: o.shopperId, status: o.status, destinationPostalPrefix: o.postal, placedAt: o.placedAt,
    ...(o.cancelledAt ? { cancelledAt: o.cancelledAt } : {}), lines: o.lines,
    groups: o.groups.map((g) => ({ ...g, promiseId: `prm-${o.orderId}-${g.groupNo}`, shipBy: o.placedAt, status: groupStatus(o) })),
  });
  if (path === "/orders" && method === "GET") {
    const shopper = ctx.url.searchParams.get("shopperId") ?? state.s;
    if (!shopper) return needShopper();
    return ok({ items: [...store.orders.values()].filter((o) => o.shopperId === shopper).reverse().map(view) });
  }
  const m = /^\/orders\/([^/:]+)(:cancel)?$/.exec(path);
  if (!m) return null;
  const o = store.orders.get(decodeURIComponent(m[1] ?? ""));
  if (!o) return problem(404, "not-found", "Order not found");
  if (!m[2] && method === "GET") {
    return ok({
      ...view(o),
      tracking: { orderId: o.orderId, status: o.status, groups: o.groups.map((g) => ({ groupNo: g.groupNo, promiseId: `prm-${o.orderId}-${g.groupNo}`, status: groupStatus(o), deliverByEarliest: g.deliverByEarliest, deliverByLatest: g.deliverByLatest, ...(g.timeZone ? { timeZone: g.timeZone } : {}), packages: [] })) },
      totals: { currency: "USD", totalMinor: o.totalMinor },
    });
  }
  if (m[2] && method === "POST") {
    if (!str(body["reason"])) return problem(422, "validation-failed", "reason is required");
    if (!["PLACED", "IN_FULFILLMENT", "CANCELLED"].includes(o.status)) return problem(409, "cancel-after-lock", "A group is already locked");
    o.status = "CANCELLED";
    o.cancelledAt = new Date().toISOString();
    return ok(view(o));
  }
  return null;
}

export function accountRoutes(ctx: Ctx): Reply | null {
  const { store, method, path, body, state } = ctx;
  const addr = (shopper: { shopperId: string; addresses: Record<string, string>[] }) =>
    shopper.addresses.map((a, i) => ({ addressId: `addr-${shopper.shopperId}-${i + 1}`, ...a }));
  const shopperView = (s: { shopperId: string; email: string; addresses: Record<string, string>[] }) => ({
    shopperId: s.shopperId, email: s.email, status: "ACTIVE", registeredAt: "2030-01-01T00:00:00Z", savedAddresses: addr(s),
  });
  const pickAddress = (b: Record<string, unknown>) => Object.fromEntries(Object.entries(b).filter(([, v]) => typeof v === "string")) as Record<string, string>;
  if (path === "/shoppers" && method === "POST") {
    const email = str(body["email"]).toLowerCase();
    if (!email.includes("@")) return problem(422, "validation-failed", "A valid e-mail is required");
    if ([...store.shoppers.values()].some((s) => s.email === email)) return problem(409, "email-taken", "E-mail already registered");
    const list = Array.isArray(body["savedAddresses"]) ? (body["savedAddresses"] as Record<string, unknown>[]).map(pickAddress) : [];
    const s = { shopperId: nextId(store, "shp"), email, addresses: list };
    store.shoppers.set(s.shopperId, s);
    ctx.setState.s = s.shopperId;
    return ok(shopperView(s), 201);
  }
  if (path === "/sessions" && method === "POST") {
    const email = str(body["email"]).toLowerCase();
    const s = [...store.shoppers.values()].find((x) => x.email === email);
    if (!s) return problem(404, "shopper-not-found", "No shopper with that e-mail");
    ctx.setState.s = s.shopperId;
    return ok(shopperView(s));
  }
  if (path === "/me" && method === "GET") {
    const s = state.s ? store.shoppers.get(state.s) : undefined;
    return s ? ok(shopperView(s)) : needShopper();
  }
  if (path === "/me/addresses" && method === "POST") {
    const s = state.s ? store.shoppers.get(state.s) : undefined;
    if (!s) return needShopper();
    s.addresses.push(pickAddress(body));
    return ok(shopperView(s), 201);
  }
  return null;
}
