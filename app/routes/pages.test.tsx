import { render, screen } from "@testing-library/react";
import { createRoutesStub } from "react-router";
import { describe, expect, it } from "vitest";
import type { Cart, CheckoutSession, Order } from "~/lib/types.ts";
import CartPage from "./cart.tsx";
import Confirmation, { isInDoubt } from "./confirmation.tsx";
import OrderDetail from "./order-detail.tsx";
import Orders from "./orders.tsx";

// Route components take loaderData; the stub renders them with it and no router data fetching.
const mount = (component: unknown, loaderData: Record<string, unknown>) => {
  const Component = component as React.ComponentType<{ loaderData: unknown }>;
  const Stub = createRoutesStub([{ path: "/", Component: () => <Component loaderData={loaderData} /> }]);
  return render(<Stub />);
};

const cart: Cart = {
  cartId: "c1", state: "OPEN", version: 2, lines: [{ catalogItemId: "item-1", quantity: 2 }], destinationPostalPrefix: "10001",
  estimate: { currency: "USD", itemsMinor: 5000, deliveryMinor: 499, taxMinor: 400, totalMinor: 5899 },
  checkoutReadiness: { ready: true, allGroupsSelected: true, noOfferExpired: true },
  deliveryQuote: { groups: [{ groupNo: 1, lineNos: [1], offers: [{ offerId: "o1", groupNo: 1, tier: "NEXT_DAY", deliverByEarliest: "2030-01-05", deliverByLatest: "2030-01-05", expiresAt: "2030-01-01T00:00:00Z" }] }], unavailableTiers: [], quotedAt: "2030-01-01T00:00:00Z" },
  selections: [{ groupNo: 1, offerId: "o1" }],
};
const products = { "item-1": { catalogItemId: "item-1", title: "Kettle", effectivePrice: { amountMinor: 2500, currency: "USD" }, inStock: true, purchasable: true } };

describe("cart page", () => {
  it("shows lines, the labelled estimate and the checkout link once ready", () => {
    mount(CartPage as never, { cart, products });
    expect(screen.getByRole("link", { name: "Kettle" })).toBeInTheDocument();
    expect(screen.getByText(/non-binding estimate/)).toBeInTheDocument();
    expect(screen.getByText("$58.99")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Proceed to checkout" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Selected" })).toBeInTheDocument();
  });
  it("hides checkout until every shipment has a delivery choice", () => {
    mount(CartPage as never, { cart: { ...cart, checkoutReadiness: { ready: false, allGroupsSelected: false, noOfferExpired: true }, selections: [] }, products });
    expect(screen.queryByRole("link", { name: "Proceed to checkout" })).toBeNull();
    expect(screen.getByText(/Choose a destination/)).toBeInTheDocument();
  });
  it("shows the empty state", () => {
    mount(CartPage as never, { cart: null, products: {} });
    expect(screen.getByText("Your cart is empty.")).toBeInTheDocument();
  });
});

describe("confirmation page", () => {
  const session = (state: string, extra: Partial<CheckoutSession> = {}): CheckoutSession => ({ sessionId: "s1", state: state as CheckoutSession["state"], cartId: "c", shopperId: "sh", shipToAddressId: "a", lines: [], groups: [], quoteExpiresAt: "2030-01-01T00:00:00Z", version: 1, ...extra });
  it("celebrates a completed order and links to tracking", () => {
    mount(Confirmation as never, { session: session("COMPLETED", { orderId: "ord-1", totalMinor: 5899, currency: "USD" }) });
    expect(screen.getByTestId("order-id")).toHaveTextContent("ord-1");
    expect(screen.getByRole("link", { name: "Track your order" })).toHaveAttribute("href", "/orders/ord-1");
  });
  it("tells the shopper an in-doubt placement is still settling", () => {
    mount(Confirmation as never, { session: session("PLACING") });
    expect(screen.getByRole("heading", { name: /placing your order/ })).toBeInTheDocument();
    expect(isInDoubt("AUTHORIZING")).toBe(true);
    expect(isInDoubt("COMPLETED")).toBe(false);
  });
  it("says nothing was charged when the checkout ended otherwise", () => {
    mount(Confirmation as never, { session: session("EXPIRED") });
    expect(screen.getByText(/Nothing was charged/)).toBeInTheDocument();
  });
});

const order = (status: string, extra: Partial<Order> = {}): Order => ({ orderId: "ord-1", shopperId: "s", status, destinationPostalPrefix: "10001", placedAt: "2030-01-01T00:00:00Z", lines: [{ lineNo: 1, catalogItemId: "item-1", quantity: 1 }], groups: [], ...extra });

describe("orders pages", () => {
  it("asks a signed-out visitor to sign in", () => {
    mount(Orders as never, { orders: null, signedOut: true });
    expect(screen.getByRole("link", { name: "sign in" })).toBeInTheDocument();
  });
  it("lists orders newest first with their status", () => {
    mount(Orders as never, { orders: { items: [order("SHIPPED")], nextCursor: "n1" }, signedOut: false });
    expect(screen.getByRole("link", { name: "ord-1" })).toBeInTheDocument();
    expect(screen.getByText("Shipped")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Older orders" })).toHaveAttribute("href", "/orders?after=n1");
  });
  it("offers cancel and shows tracking before shipment", () => {
    const tracking = { orderId: "ord-1", status: "PLACED", groups: [{ groupNo: 1, status: "PLACED", deliverByEarliest: "2030-01-10T00:00:00Z", deliverByLatest: "2030-01-12T00:00:00Z", packages: [{ trackingNumber: "TRK1", carrier: "Carrier", state: "IN_TRANSIT" }] }] };
    mount(OrderDetail as never, { order: order("PLACED", { tracking }) });
    expect(screen.getByText(/TRK1/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cancel order" })).toBeInTheDocument();
  });
  it("hides cancel once shipped and says when tracking is missing", () => {
    mount(OrderDetail as never, { order: order("SHIPPED") });
    expect(screen.queryByRole("button", { name: "Cancel order" })).toBeNull();
    expect(screen.getByText("Tracking is not available yet.")).toBeInTheDocument();
  });
});
