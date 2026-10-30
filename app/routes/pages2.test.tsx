import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createRoutesStub } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SessionProvider } from "~/components/Session.tsx";
import { ApiError } from "~/lib/api.ts";
import * as cartSession from "~/lib/cart-session.ts";
import * as q from "~/lib/queries.ts";
import { currentShopper, hasShopperSession, rememberShopper } from "~/lib/shopper.ts";
import type { Cart, CheckoutSession, Shopper } from "~/lib/types.ts";
import Account, { clientLoader as accountLoader } from "./account.tsx";
import { clientLoader as cartLoader } from "./cart.tsx";
import Checkout, { clientLoader as checkoutLoader } from "./checkout.tsx";
import { clientLoader as confirmationLoader } from "./confirmation.tsx";
import Home from "./home.tsx";
import { clientLoader as orderLoader } from "./order-detail.tsx";
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
const shopper: Shopper = { shopperId: "s1", email: "a@example.test", status: "ACTIVE", registeredAt: "2030-01-01T00:00:00Z", savedAddresses: [{ addressId: "addr-1", name: "A Shopper", line1: "1100 Congress Ave", city: "Austin", region: "TX", postalCode: "78701", countryCode: "US" }] };
const readyCart: Cart = {
  cartId: "c1", state: "OPEN", version: 1, lines: [{ catalogItemId: "i1", quantity: 1 }], destinationPostalPrefix: "787",
  checkoutReadiness: { ready: true, allGroupsSelected: true, noOfferExpired: true },
  estimate: { currency: "USD", itemsMinor: 5000, deliveryMinor: 0, taxMinor: 413, totalMinor: 5413 },
  deliveryQuote: { groups: [{ groupNo: 1, lineNos: [1], offers: [{ offerId: "o1", groupNo: 1, tier: "STANDARD", deliverByEarliest: "2026-11-03", deliverByLatest: "2026-11-05", expiresAt: "x" }] }], unavailableTiers: [], quotedAt: "x" },
  selections: [{ groupNo: 1, offerId: "o1" }],
};
const mount = (component: unknown, loaderData: Record<string, unknown>, rootData: Record<string, unknown> = { categories: null, destination: null }) => {
  const Component = component as React.ComponentType<{ loaderData: unknown }>;
  const Stub = createRoutesStub([{ id: "root", path: "/", loader: () => rootData, HydrateFallback: () => null, children: [{ index: true, Component: () => <Component loaderData={loaderData} />, action: () => ({ ok: true }) }] }]);
  return render(<SessionProvider initialDestination={null}><Stub /></SessionProvider>);
};
const run = (fn: unknown, args: unknown = {}) => (fn as (a: unknown) => Promise<unknown>)(args);

describe("client loaders", () => {
  it("currentShopper treats session-required as signed out, forgets the marker and rethrows real failures", async () => {
    rememberShopper("s1");
    vi.mocked(q.getMe).mockRejectedValueOnce(err(422, "session-required"));
    expect(await currentShopper()).toBeNull();
    expect(hasShopperSession()).toBe(false);
    vi.mocked(q.getMe).mockRejectedValueOnce(err(503));
    await expect(currentShopper()).rejects.toBeInstanceOf(ApiError);
  });
  it("account asks /me only when the browser holds a shopper session", async () => {
    expect(await run(accountLoader)).toEqual({ shopper: null });
    expect(q.getMe).not.toHaveBeenCalled();
    rememberShopper("s1");
    vi.mocked(q.getMe).mockResolvedValueOnce(shopper);
    expect(await run(accountLoader)).toEqual({ shopper });
  });
  it("cart loader fetches product details and the tier charges for the destination, tolerating failures", async () => {
    vi.mocked(cartSession.currentCart).mockResolvedValue(readyCart);
    vi.mocked(q.getProduct).mockRejectedValue(err(404));
    vi.mocked(q.quoteDeliveryDates).mockRejectedValue(err(503));
    expect(await run(cartLoader)).toEqual({ cart: readyCart, products: { i1: null }, schedule: null });
    expect(q.quoteDeliveryDates).toHaveBeenCalledWith("i1", "787");
    vi.mocked(cartSession.currentCart).mockResolvedValue(null);
    expect(await run(cartLoader)).toEqual({ cart: null, products: {}, schedule: null });
  });
  it("orders loader reports a signed-out visitor and passes the cursor", async () => {
    vi.mocked(q.listOrders).mockRejectedValueOnce(err(422, "session-required"));
    expect(await run(ordersLoader, { request: new Request("http://w.test/orders") })).toEqual({ orders: null, signedOut: true });
    vi.mocked(q.listOrders).mockResolvedValueOnce({ items: [] });
    await run(ordersLoader, { request: new Request("http://w.test/orders?after=n1") });
    expect(q.listOrders).toHaveBeenLastCalledWith("n1");
  });
  it("order loader reads the order and its product titles", async () => {
    vi.mocked(q.getOrder).mockResolvedValue({ orderId: "o1", lines: [{ lineNo: 1, catalogItemId: "i1", quantity: 1 }] } as never);
    vi.mocked(q.getProduct).mockResolvedValue({ title: "Kettle" } as never);
    expect(await run(orderLoader, { params: { id: "o1" } })).toMatchObject({ products: { i1: { title: "Kettle" } } });
  });
  it("confirmation loader reads the session, then the placed order and its cart", async () => {
    vi.mocked(q.getCheckout).mockResolvedValueOnce({ sessionId: "s1", state: "PLACING" } as CheckoutSession);
    expect(await run(confirmationLoader, { params: { sessionId: "s1" } })).toEqual({ session: { sessionId: "s1", state: "PLACING" }, order: null, cart: null });
    vi.mocked(q.getCheckout).mockResolvedValueOnce({ sessionId: "s1", state: "COMPLETED", orderId: "o1", cartId: "c1" } as CheckoutSession);
    vi.mocked(q.getOrder).mockRejectedValue(err(404));
    vi.mocked(q.getCart).mockResolvedValue(readyCart);
    expect(await run(confirmationLoader, { params: { sessionId: "s1" } })).toMatchObject({ order: null, cart: { cartId: "c1" } });
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
  it("checkout loader resumes a remembered open session with its cart", async () => {
    vi.mocked(q.getMe).mockResolvedValue(shopper);
    sessionStorage.setItem("sf.checkoutId", "sess-1");
    vi.mocked(q.getCheckout).mockResolvedValue({ sessionId: "sess-1", state: "OPEN", cartId: "c1", lines: [{ lineNo: 1, catalogItemId: "i1", quantity: 1 }] } as CheckoutSession);
    vi.mocked(q.getCart).mockResolvedValue(readyCart);
    vi.mocked(q.getProduct).mockResolvedValue({ title: "Kettle" } as never);
    expect(await run(checkoutLoader)).toMatchObject({ session: { sessionId: "sess-1" }, cart: { cartId: "c1" }, products: { i1: { title: "Kettle" } } });
  });
});

describe("page components", () => {
  const session = { sessionId: "sess-1", state: "OPEN", cartId: "c1", shipToAddressId: "addr-1", lines: [{ lineNo: 1, catalogItemId: "i1", quantity: 2 }], groups: [{ groupNo: 1, offerId: "o1", tier: "STANDARD", lineNos: [1], amountMinor: 0 }], currency: "USD", totalMinor: 5413, quoteExpiresAt: "2030-01-01T10:00:00Z" };
  it("checkout asks for a delivery address first as radio cards", async () => {
    mount(Checkout, { shopper, session: null, cart: readyCart, products: { i1: { title: "Kettle" } } });
    expect(await screen.findByRole("heading", { name: "Checkout (1 item)" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: /A Shopper/ })).toBeChecked();
    expect(screen.getAllByRole("button", { name: "Use this address" })).toHaveLength(2);
    expect(screen.getByText("Choose a delivery address first.")).toBeInTheDocument();
    expect(screen.getByText("Arriving Nov 3 – Nov 5")).toBeInTheDocument();
  });
  it("checkout reviews the open session with simulated payment, the promise and the binding total", async () => {
    mount(Checkout, { shopper, session, cart: readyCart, products: { i1: { title: "Kettle" } } });
    expect(await screen.findByRole("button", { name: "Place your order" })).toBeInTheDocument();
    expect(screen.getByText(/1100 Congress Ave/)).toBeInTheDocument();
    expect(screen.getByRole("group", { name: "Simulated hosted card fields" })).toBeInTheDocument();
    expect(screen.getByText("Arriving Nov 3 – Nov 5")).toBeInTheDocument();
    expect(screen.getByText("Kettle")).toBeInTheDocument();
    expect(screen.getAllByText("$54.13").length).toBeGreaterThan(0);
    await userEvent.click(screen.getByRole("button", { name: "Change" }));
    expect(screen.getByRole("radio", { name: /A Shopper/ })).toBeChecked();
  });
  it("checkout without saved addresses points to the account page", async () => {
    mount(Checkout, { shopper: { ...shopper, savedAddresses: [] }, session: null, cart: readyCart, products: {} });
    expect(await screen.findByRole("link", { name: /Add one on your account page/ })).toBeInTheDocument();
  });
  it("account shows sign-in and create-account cards when signed out, addresses when signed in", async () => {
    mount(Account, { shopper: null });
    expect(await screen.findByRole("heading", { name: "Create account" })).toBeInTheDocument();
    expect(screen.getByLabelText("Street address", { selector: "#reg-line1" })).toHaveAttribute("placeholder", "1100 Congress Ave");
    mount(Account, { shopper });
    expect(await screen.findByText("a@example.test")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save address" })).toBeInTheDocument();
  });
  it("home shows department cards and popular rows", async () => {
    mount(Home, {
      departments: [{ categoryId: "cat-k", name: "Kitchen & Dining", count: 3, image: "/media/departments/kitchen-dining.svg" }, { categoryId: "cat-t", name: "Toys", count: 1, image: null }],
      rows: [{ title: "Kitchen & Dining", categoryId: "cat-k", hits: [{ catalogItemId: "i1", title: "Kettle", inStock: true, purchasable: true }] }],
    });
    expect(await screen.findByRole("heading", { name: "Shop by department" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Kitchen & Dining 3 items/ })).toHaveAttribute("href", "/search?categoryId=cat-k");
    expect(screen.getByRole("heading", { name: "Popular in Kitchen & Dining" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Kettle/ })).toBeInTheDocument();
    mount(Home, { departments: [], rows: [] });
    expect(await screen.findByText(/No products are available/)).toBeInTheDocument();
  });
  it("search shows the results header, named department facets, price bands and paging", async () => {
    const result = {
      hits: [{ catalogItemId: "i1", title: "Kettle", inStock: true, purchasable: true, categoryId: "cat-80c58ef626f7", categoryPath: ["Jewelry", "Rings"] }],
      facets: [
        { name: "category", values: [{ value: "cat-80c58ef626f7", count: 1 }, { value: "cat-k", count: 2 }] },
        { name: "price-band", values: [{ value: "<2500", count: 1 }, { value: "bogus", count: 1 }] },
        { name: "in-stock", values: [{ value: "true", count: 2 }, { value: "false", count: 1 }] },
      ],
      next: "cur",
    };
    const tree = { version: 1, categories: [{ categoryId: "cat-k", name: "Kitchen & Dining", path: "/k", purchasableCount: 2 }] };
    mount(Search, { params: { q: "pen", priceMax: 2499, limit: 24 }, offset: 0, result }, { categories: tree, destination: null });
    expect(await screen.findByRole("status")).toHaveTextContent("1-1 of 3 results for “pen”");
    expect(screen.getByRole("link", { name: "Rings (1)" })).toHaveAttribute("href", "/search?q=pen&categoryId=cat-80c58ef626f7&priceMax=2499");
    expect(screen.getByRole("link", { name: "Kitchen & Dining (2)" })).toBeInTheDocument();
    expect(screen.queryByText(/cat-80c58ef626f7/)).toBeNull();
    expect(screen.getByRole("link", { name: "Under $25 (1)" })).toHaveClass("is-active");
    expect(screen.getByRole("link", { name: "‹ Any Price" })).toHaveAttribute("href", "/search?q=pen");
    expect(screen.getByRole("checkbox", { name: "In stock only" })).toHaveAttribute("aria-checked", "false");
    expect(screen.getByRole("link", { name: "Next page" })).toHaveAttribute("href", expect.stringContaining("after=cur"));
  });
  it("search says when nothing matched in a department", async () => {
    mount(Search, { params: { categoryId: "cat-k", inStock: true, limit: 24 }, offset: 0, result: { hits: [], facets: [] } });
    expect(await screen.findByText(/No products matched/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "‹ Any Department" })).toHaveAttribute("href", "/search?inStock=true");
  });
});

describe("product page", () => {
  const product = {
    catalogItemId: "i1", title: "Kettle", effectivePrice: { amountMinor: 3000, currency: "USD" }, listPrice: { amountMinor: 3500, currency: "USD" }, inStock: true, purchasable: true,
    bullets: ["Fast"], attributes: [{ name: "Colour", value: "Clear" }], description: "A kettle.", categoryId: "cat-k-s", categoryPath: ["Kitchen & Dining", "Small Appliances"],
    media: [{ mediaId: "m", url: "http://storefront.localhost/media/departments/kitchen-dining.svg", altText: "Kettle picture", role: "PRIMARY" }],
  };
  it("renders the three columns and adds to the cart with an action id", async () => {
    vi.mocked(cartSession.addToCart).mockResolvedValue(readyCart);
    mount(Product, { product });
    expect(await screen.findByRole("heading", { level: 1, name: "Kettle" })).toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: "Breadcrumb" })).toHaveTextContent("Kitchen & Dining");
    expect(screen.getByAltText("Kettle picture")).toHaveAttribute("src", "/media/departments/kitchen-dining.svg");
    expect(screen.getByRole("heading", { name: "About this item" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Product information" })).toBeInTheDocument();
    expect(screen.getByText("$35.00")).toBeInTheDocument();
    expect(screen.getByText("In Stock")).toBeInTheDocument();
    expect(screen.getByText("Austin, TX")).toBeInTheDocument();
    await userEvent.selectOptions(screen.getByLabelText("Quantity:"), "2");
    await userEvent.click(screen.getByRole("button", { name: "Add to Cart" }));
    await waitFor(() => expect(screen.getByText(/Added to your cart/)).toBeInTheDocument());
    expect(cartSession.addToCart).toHaveBeenCalledWith("i1", 2, expect.any(String));
  });
  it("buys now: adds, then goes to the cart", async () => {
    vi.mocked(cartSession.addToCart).mockResolvedValue(readyCart);
    mount(Product, { product: { ...product, media: [] } });
    await userEvent.click(await screen.findByRole("button", { name: "Buy Now" }));
    await waitFor(() => expect(cartSession.addToCart).toHaveBeenCalled());
  });
  it("shows the failure and offers nothing to buy when unpurchasable", async () => {
    vi.mocked(cartSession.addToCart).mockRejectedValue(err(503));
    mount(Product, { product });
    await userEvent.click(await screen.findByRole("button", { name: "Add to Cart" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/temporarily unavailable/);
    mount(Product, { product: { ...product, purchasable: false, media: undefined, categoryPath: undefined } });
    expect(await screen.findByText(/Currently unavailable/)).toBeInTheDocument();
  });
});
