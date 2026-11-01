import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as q from "./queries.ts";

let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  fetchMock = vi.fn().mockImplementation(() => Promise.resolve(new Response("{}", { status: 200 })));
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

const last = () => {
  const [url, init] = fetchMock.mock.calls.at(-1) as [string, RequestInit];
  return { url, method: init.method, body: init.body as string | undefined, headers: init.headers as Record<string, string> };
};

describe("BFF operations hit only /api/storefront with the documented verbs", () => {
  const cases: [string, () => Promise<unknown>, string, string, unknown?][] = [
    ["searchProducts", () => q.searchProducts({ q: "mug", limit: 5 }), "GET", "/api/storefront/products?q=mug&limit=5"],
    ["searchProducts by category", () => q.searchProducts({ categoryId: "cat-1" }), "GET", "/api/storefront/products?categoryId=cat-1"],
    ["getProduct", () => q.getProduct("a/b"), "GET", "/api/storefront/products/a%2Fb"],
    ["listCategories", () => q.listCategories(), "GET", "/api/storefront/categories"],
    ["quoteDeliveryDates", () => q.quoteDeliveryDates("p1", "787"), "POST", "/api/storefront/products/p1:delivery-dates", { postalPrefix: "787" }],
    ["createCart", () => q.createCart("act"), "POST", "/api/storefront/carts"],
    ["listCarts", () => q.listCarts(), "GET", "/api/storefront/carts?state=OPEN"],
    ["getCart", () => q.getCart("c1"), "GET", "/api/storefront/carts/c1"],
    ["addCartLine", () => q.addCartLine("c1", "i1", 2), "POST", "/api/storefront/carts/c1/lines", { catalogItemId: "i1", quantity: 2 }],
    ["setLineQuantity", () => q.setLineQuantity("c1", "i1", 3), "PATCH", "/api/storefront/carts/c1/lines/i1", { quantity: 3 }],
    ["removeLine", () => q.removeLine("c1", "i1"), "DELETE", "/api/storefront/carts/c1/lines/i1"],
    ["setDestination", () => q.setDestination("c1", "787"), "POST", "/api/storefront/carts/c1/destination", { destinationPostalPrefix: "787" }],
    ["quoteCartDelivery", () => q.quoteCartDelivery("c1"), "POST", "/api/storefront/carts/c1/delivery:quote"],
    ["selectCartDelivery", () => q.selectCartDelivery("c1", 1, "o1"), "POST", "/api/storefront/carts/c1/delivery:select", { groupNo: 1, offerId: "o1" }],
    ["openCheckout", () => q.openCheckout("addr-1"), "POST", "/api/storefront/checkout", { shipToAddressId: "addr-1" }],
    ["getCheckout", () => q.getCheckout("s1"), "GET", "/api/storefront/checkout/s1"],
    ["confirmCheckout", () => q.confirmCheckout("s1", "tok_approve"), "POST", "/api/storefront/checkout/s1:confirm", { paymentMethodToken: "tok_approve" }],
    ["listOrders", () => q.listOrders("n1"), "GET", "/api/storefront/orders?after=n1"],
    ["getOrder", () => q.getOrder("o1"), "GET", "/api/storefront/orders/o1"],
    ["cancelOrder", () => q.cancelOrder("o1", "why"), "POST", "/api/storefront/orders/o1:cancel", { reason: "why" }],
    ["createSession", () => q.createSession("a@example.test"), "POST", "/api/storefront/sessions", { email: "a@example.test" }],
    ["registerShopper", () => q.registerShopper({ email: "a@example.test" }), "POST", "/api/storefront/shoppers", { email: "a@example.test" }],
    ["getMe", () => q.getMe(), "GET", "/api/storefront/me"],
    ["addMyAddress", () => q.addMyAddress({ line1: "x" }), "POST", "/api/storefront/me/addresses", { line1: "x" }],
  ];
  it.each(cases)("%s", async (_n, run, method, url, body) => {
    await run();
    const c = last();
    expect(c.method).toBe(method);
    expect(c.url).toBe(url);
    if (body) expect(JSON.parse(c.body ?? "null")).toEqual(body);
  });

  it("sends the cart destination as exactly {destinationPostalPrefix}: shopping-cart's strict decoder rejects postalPrefix", async () => {
    await q.setDestination("c1", "787", "act-9");
    expect(Object.keys(JSON.parse(last().body ?? "{}"))).toEqual(["destinationPostalPrefix"]);
    expect(last().headers["X-Action-Id"]).toBe("act-9");
  });

  it("passes the optional cartId and action ids through", async () => {
    await q.openCheckout("addr-1", "c9", "act-1");
    expect(JSON.parse(last().body ?? "{}")).toEqual({ shipToAddressId: "addr-1", cartId: "c9" });
    expect(last().headers["X-Action-Id"]).toBe("act-1");
  });
});
