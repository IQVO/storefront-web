import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createRoutesStub } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "~/lib/api.ts";
import * as cartSession from "~/lib/cart-session.ts";
import * as q from "~/lib/queries.ts";
import type { Cart, CheckoutSession, Shopper } from "~/lib/types.ts";
import { currentShopper } from "~/lib/shopper.ts";
import Account, { clientLoader as accountLoader } from "./account.tsx";
import { clientLoader as cartLoader } from "./cart.tsx";
import Checkout, { clientLoader as checkoutLoader } from "./checkout.tsx";
import { clientLoader as confirmationLoader } from "./confirmation.tsx";
import Home from "./home.tsx";
import { clientLoader as ordersLoader } from "./orders.tsx";
import Product from "./product.tsx";
import Search from "./search.tsx";

vi.mock("~/lib/queries.ts");
vi.mock("~/lib/cart-session.ts", async (orig) => ({ ...(await orig<typeof cartSession>()), currentCart: vi.fn(), addToCart: vi.fn() }));
beforeEach(() => {
  vi.resetAllMocks();
  sessionStorage.clear();
});

const err = (status: number, slug = "x") => new ApiError(status, { type: `/problems/${slug}`, title: slug, status });
const shopper: Shopper = { shopperId: "s1", email: "a@example.test", status: "ACTIVE", registeredAt: "2030-01-01T00:00:00Z", savedAddresses: [{ addressId: "addr-1", name: "A", line1: "1 St", city: "C", region: "R", postalCode: "10001", countryCode: "US" }] };
const readyCart: Cart = { cartId: "c1", state: "OPEN", version: 1, lines: [{ catalogItemId: "i1", quantity: 1 }], checkoutReadiness: { ready: true, allGroupsSelected: true, noOfferExpired: true } };
const mount = (component: unknown, loaderData: Record<string, unknown>) => {
  const Component = component as React.ComponentType<{ loaderData: unknown }>;
  const Stub = createRoutesStub([{ path: "/", Component: () => <Component loaderData={loaderData} /> }]);
  return render(<Stub />);
};
const run = (fn: unknown, args: unknown = {}) => (fn as (a: unknown) => Promise<unknown>)(args);

describe("client loaders", () => {
  it("currentShopper treats session-required as signed out and rethrows real failures", async () => {
    vi.mocked(q.getMe).mockRejectedValueOnce(err(422, "session-required"));
    expect(await currentShopper()).toBeNull();
    vi.mocked(q.getMe).mockRejectedValueOnce(err(503));
    await expect(currentShopper()).rejects.toBeInstanceOf(ApiError);
    vi.mocked(q.getMe).mockResolvedValueOnce(shopper);
    expect(await run(accountLoader)).toEqual({ shopper });
  });
  it("cart loader fetches product details for each line and tolerates a missing product", async () => {
    vi.mocked(cartSession.currentCart).mockResolvedValue(readyCart);
    vi.mocked(q.getProduct).mockRejectedValue(err(404));
    expect(await run(cartLoader)).toEqual({ cart: readyCart, products: { i1: null } });
  });
  it("orders loader reports a signed-out visitor and passes the cursor", async () => {
    vi.mocked(q.listOrders).mockRejectedValueOnce(err(422, "session-required"));
    expect(await run(ordersLoader, { request: new Request("http://w.test/orders") })).toEqual({ orders: null, signedOut: true });
    vi.mocked(q.listOrders).mockResolvedValueOnce({ items: [] });
    await run(ordersLoader, { request: new Request("http://w.test/orders?after=n1") });
    expect(q.listOrders).toHaveBeenLastCalledWith("n1");
  });
  it("confirmation loader reads the session by id", async () => {
    vi.mocked(q.getCheckout).mockResolvedValue({ sessionId: "s1" } as CheckoutSession);
    expect(await run(confirmationLoader, { params: { sessionId: "s1" } })).toEqual({ session: { sessionId: "s1" } });
  });
  it("checkout loader sends a signed-out shopper to the account page and an unready cart back to the cart", async () => {
    vi.mocked(q.getMe).mockRejectedValueOnce(err(422, "session-required"));
    const r1 = (await run(checkoutLoader).catch((e: unknown) => e)) as Response;
    expect(r1.headers.get("Location")).toBe("/account");
    vi.mocked(q.getMe).mockResolvedValue(shopper);
    vi.mocked(cartSession.currentCart).mockResolvedValue({ ...readyCart, checkoutReadiness: { ready: false, allGroupsSelected: false, noOfferExpired: true } });
    const r2 = (await run(checkoutLoader).catch((e: unknown) => e)) as Response;
    expect(r2.headers.get("Location")).toBe("/cart");
  });
  it("checkout loader resumes a remembered open session", async () => {
    vi.mocked(q.getMe).mockResolvedValue(shopper);
    vi.mocked(cartSession.currentCart).mockResolvedValue(null);
    sessionStorage.setItem("sf.checkoutId", "sess-1");
    vi.mocked(q.getCheckout).mockResolvedValue({ sessionId: "sess-1", state: "OPEN" } as CheckoutSession);
    expect(await run(checkoutLoader)).toMatchObject({ session: { sessionId: "sess-1" } });
  });
});

describe("page components", () => {
  it("checkout asks for an address first, then reviews the session with simulated payment", () => {
    mount(Checkout as never, { shopper, session: null });
    expect(screen.getByRole("button", { name: "Review order" })).toBeInTheDocument();
    const session = { sessionId: "sess-1", state: "OPEN", lines: [{ lineNo: 1, catalogItemId: "i1", quantity: 2 }], groups: [{ groupNo: 1, offerId: "o", tier: "NEXT_DAY", lineNos: [1], amountMinor: 499 }], currency: "USD", totalMinor: 5499, quoteExpiresAt: "2030-01-01T10:00:00Z" };
    mount(Checkout as never, { shopper, session });
    expect(screen.getByText(/Total \$54\.99/)).toBeInTheDocument();
    expect(screen.getByRole("group", { name: "Simulated hosted card fields" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Place order" })).toBeInTheDocument();
  });
  it("checkout without saved addresses points to the account page", () => {
    mount(Checkout as never, { shopper: { ...shopper, savedAddresses: [] }, session: null });
    expect(screen.getByRole("link", { name: /Add one on your account page/ })).toBeInTheDocument();
  });
  it("account shows sign-in and register forms when signed out, addresses when signed in", () => {
    mount(Account as never, { shopper: null });
    expect(screen.getByRole("heading", { name: "Register" })).toBeInTheDocument();
    mount(Account as never, { shopper });
    expect(screen.getByText("a@example.test")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save address" })).toBeInTheDocument();
  });
  it("home lists featured products and categories", () => {
    mount(Home as never, { hits: [{ catalogItemId: "i1", title: "Kettle", inStock: true, purchasable: true }], categories: [{ value: "kitchen", count: 3 }] });
    expect(screen.getByRole("link", { name: /kitchen \(3\)/ })).toHaveAttribute("href", "/search?categoryId=kitchen");
    expect(screen.getByRole("link", { name: /Kettle/ })).toBeInTheDocument();
  });
  it("search shows results, an empty state and the next page link", () => {
    const params = { q: "pen" };
    mount(Search as never, { params, result: { hits: [], facets: [], next: "cur" } });
    expect(screen.getByText(/No products matched/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Next page" })).toHaveAttribute("href", expect.stringContaining("after=cur"));
  });
});

describe("product page", () => {
  const product = { catalogItemId: "i1", title: "Kettle", effectivePrice: { amountMinor: 3000, currency: "USD" }, listPrice: { amountMinor: 3500, currency: "USD" }, inStock: true, purchasable: true, bullets: ["Fast"], attributes: [{ name: "Colour", value: "Clear" }] };
  it("adds to the cart with an action id and links to the cart", async () => {
    vi.mocked(cartSession.addToCart).mockResolvedValue(readyCart);
    mount(Product as never, { product });
    await userEvent.click(screen.getByRole("button", { name: "Add to cart" }));
    await waitFor(() => expect(screen.getByText(/Added to your cart/)).toBeInTheDocument());
    expect(cartSession.addToCart).toHaveBeenCalledWith("i1", 1, expect.any(String));
    expect(screen.getByText("$35.00")).toBeInTheDocument();
  });
  it("shows the failure and offers nothing to buy when unpurchasable", async () => {
    vi.mocked(cartSession.addToCart).mockRejectedValue(err(503));
    mount(Product as never, { product });
    await userEvent.click(screen.getByRole("button", { name: "Add to cart" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/temporarily unavailable/);
    mount(Product as never, { product: { ...product, purchasable: false } });
    expect(screen.getByText(/currently unavailable/)).toBeInTheDocument();
  });
});
