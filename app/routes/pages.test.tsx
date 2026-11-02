import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createRoutesStub } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SessionProvider } from "~/components/Session.tsx";
import type { Cart, CheckoutSession, DeliveryDates, Order } from "~/lib/types.ts";
import CartPage from "./cart.tsx";
import Confirmation from "./confirmation.tsx";
import OrderDetail from "./order-detail.tsx";
import Orders from "./orders.tsx";

vi.mock("~/lib/queries.ts");
beforeEach(() => vi.resetAllMocks());

// Route components take loaderData; the stub renders them with it and records submissions to the route action.
const mount = (component: unknown, loaderData: Record<string, unknown>, opts: { action?: (fd: FormData) => unknown; zip?: string } = {}) => {
  const Component = component as React.ComponentType<{ loaderData: unknown }>;
  const Stub = createRoutesStub([
    {
      path: "/",
      Component: () => <Component loaderData={loaderData} />,
      action: async ({ request }) => (opts.action ? opts.action(await request.formData()) : { ok: true }),
    },
  ]);
  const dest = opts.zip ? { zip: opts.zip, prefix: opts.zip.slice(0, 3) } : null;
  return render(<SessionProvider initialDestination={dest}><Stub /></SessionProvider>);
};

// One local delivery day in Chicago as delivery-promise sends it (ADR 0006): 9 AM – 9 PM CDT on Oct 31.
const CHICAGO_DAY = { deliverByEarliest: "2026-10-31T14:00:00Z", deliverByLatest: "2026-11-01T02:00:00Z", timeZone: "America/Chicago" };

const offers = [
  { offerId: "o-std", groupNo: 1, tier: "STANDARD" as const, deliverByEarliest: "2026-11-03", deliverByLatest: "2026-11-05", expiresAt: "2030-01-01T00:00:00Z" },
  { offerId: "o-nxt", groupNo: 1, tier: "NEXT_DAY" as const, deliverByEarliest: "2026-10-31", deliverByLatest: "2026-10-31", expiresAt: "2030-01-01T00:00:00Z" },
];
const cart: Cart = {
  cartId: "c1", state: "OPEN", version: 2, lines: [{ catalogItemId: "item-1", quantity: 2 }], destinationPostalPrefix: "787",
  estimate: { currency: "USD", itemsMinor: 5000, deliveryMinor: 0, taxMinor: 413, totalMinor: 5413 },
  checkoutReadiness: { ready: true, allGroupsSelected: true, noOfferExpired: true },
  deliveryQuote: { groups: [{ groupNo: 1, lineNos: [1], offers }], unavailableTiers: ["SAME_DAY"], quotedAt: "2030-01-01T00:00:00Z" },
  selections: [{ groupNo: 1, offerId: "o-std" }],
};
const schedule: DeliveryDates = { postalPrefix: "787", unavailable: [], tiers: [
  { tier: "STANDARD", deliverByEarliest: "x", deliverByLatest: "x", charge: { amountMinor: 499, currency: "USD" }, freeOver: { amountMinor: 2500, currency: "USD" } },
  { tier: "NEXT_DAY", deliverByEarliest: "x", deliverByLatest: "x", charge: { amountMinor: 999, currency: "USD" } },
] };
const products = { "item-1": { catalogItemId: "item-1", title: "Kettle", effectivePrice: { amountMinor: 2500, currency: "USD" }, inStock: true, purchasable: true, categoryPath: ["Kitchen & Dining"] } };

describe("cart page", () => {
  it("shows lines, delivery radio cards with promise and charge, the estimate and the checkout link once ready", () => {
    mount(CartPage, { cart, products, schedule }, { zip: "78701" });
    expect(screen.getByRole("heading", { name: "Shopping Cart" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Kettle" })).toBeInTheDocument();
    expect(screen.getAllByText("Subtotal (2 items):")).toHaveLength(2);
    expect(screen.getByRole("radio", { name: /Arriving Nov 3 – Nov 5 Standard Delivery · FREE/ })).toBeChecked();
    expect(screen.getByRole("radio", { name: /Arriving Saturday, Oct 31 Next-Day Delivery · \$9\.99/ })).not.toBeChecked();
    expect(screen.getByText("Delivering to ZIP 78701")).toBeInTheDocument();
    expect(screen.getByText(/non-binding estimate/)).toBeInTheDocument();
    expect(screen.getByText("$54.13")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Proceed to checkout" })).toHaveAttribute("href", "/checkout");
  });
  it("selects a delivery option, changes quantity and deletes a line through the cart action", async () => {
    const seen: Record<string, string>[] = [];
    mount(CartPage, { cart, products, schedule }, { zip: "78701", action: (fd) => (seen.push(Object.fromEntries(fd) as Record<string, string>), { ok: true }) });
    await userEvent.click(screen.getByRole("radio", { name: /Next-Day/ }));
    await waitFor(() => expect(seen.at(-1)).toMatchObject({ intent: "select", groupNo: "1", offerId: "o-nxt", cartId: "c1" }));
    await userEvent.selectOptions(screen.getByLabelText("Quantity for Kettle"), "3");
    await waitFor(() => expect(seen.at(-1)).toMatchObject({ intent: "set-quantity", item: "item-1", quantity: "3" }));
    await userEvent.click(screen.getByRole("button", { name: "Delete Kettle" }));
    await waitFor(() => expect(seen.at(-1)).toMatchObject({ intent: "remove", item: "item-1" }));
    expect(seen.every((s) => s["actionId"])).toBe(true);
  });
  it("sets the destination from the shopper's ZIP automatically when the cart has none", async () => {
    const seen: Record<string, string>[] = [];
    mount(CartPage, { cart: { ...cart, destinationPostalPrefix: null, deliveryQuote: undefined, selections: [] }, products, schedule: null }, { zip: "78701", action: (fd) => (seen.push(Object.fromEntries(fd) as Record<string, string>), { ok: true }) });
    await waitFor(() => expect(seen[0]).toMatchObject({ intent: "set-destination", zip: "78701", cartId: "c1" }));
  });
  it("re-quotes automatically when the destination is set but not quoted, and offers a manual retry", async () => {
    const seen: Record<string, string>[] = [];
    mount(CartPage, { cart: { ...cart, deliveryQuote: undefined, selections: [] }, products, schedule: null }, { zip: "78701", action: (fd) => (seen.push(Object.fromEntries(fd) as Record<string, string>), { ok: false, error: "That took too long." }) });
    await waitFor(() => expect(seen[0]).toMatchObject({ intent: "quote" }));
    expect(await screen.findByText("That took too long.")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Get delivery options" }));
    await waitFor(() => expect(seen).toHaveLength(2));
  });
  it("says when the ZIP is not served and hides checkout until every shipment has a delivery choice", () => {
    const notServed: Cart = { ...cart, destinationPostalPrefix: "100", checkoutReadiness: { ready: false, allGroupsSelected: false, noOfferExpired: true }, selections: [],
      deliveryQuote: { groups: [], unavailableTiers: ["SAME_DAY", "NEXT_DAY", "TWO_DAY", "STANDARD"], unavailable: [{ tier: "STANDARD", constraint: "DESTINATION_NOT_SERVED" }], quotedAt: "x" } };
    mount(CartPage, { cart: notServed, products, schedule: null });
    expect(screen.getByRole("alert")).toHaveTextContent("We don't deliver to ZIP 100 yet.");
    expect(screen.queryByRole("link", { name: "Proceed to checkout" })).toBeNull();
    expect(screen.getByText(/Choose a ZIP code and a delivery option/)).toBeInTheDocument();
  });
  it("submits a typed ZIP from the destination form", async () => {
    const seen: Record<string, string>[] = [];
    mount(CartPage, { cart, products, schedule }, { action: (fd) => (seen.push(Object.fromEntries(fd) as Record<string, string>), { ok: false, error: "Enter a valid ZIP code." }) });
    await userEvent.type(screen.getByLabelText("Deliver to ZIP code"), "78610");
    await userEvent.click(screen.getByRole("button", { name: "Update" }));
    await waitFor(() => expect(seen.at(-1)).toMatchObject({ intent: "set-destination", zip: "78610" }));
    expect((await screen.findAllByText("Enter a valid ZIP code.")).length).toBeGreaterThan(0);
  });
  it("shows the empty state", () => {
    mount(CartPage, { cart: null, products: {}, schedule: null });
    expect(screen.getByRole("heading", { name: /Cart is empty/ })).toBeInTheDocument();
  });
});

describe("confirmation page", () => {
  const session = (state: string, extra: Partial<CheckoutSession> = {}): CheckoutSession => ({ sessionId: "s1", state: state as CheckoutSession["state"], cartId: "c1", shopperId: "sh", shipToAddressId: "a", lines: [{ lineNo: 1, catalogItemId: "item-1", quantity: 2 }], groups: [{ groupNo: 1, offerId: "o-std", tier: "STANDARD", lineNos: [1], amountMinor: 0 }], quoteExpiresAt: "2030-01-01T00:00:00Z", version: 1, ...extra });
  it("celebrates a placed order with the order's promise per shipment and links to it", () => {
    const order = { orderId: "ord-1", shopperId: "sh", status: "PLACED", destinationPostalPrefix: "787", placedAt: "2026-10-29T15:00:00Z", lines: [], groups: [{ groupNo: 1, tier: "STANDARD", deliverByEarliest: "2026-10-31T19:00:00Z", deliverByLatest: "2026-11-01T23:00:00Z", lineNos: [1], status: "PROMISED" }] };
    mount(Confirmation, { session: session("COMPLETED", { orderId: "ord-1", totalMinor: 5413, currency: "USD" }), order, cart: null });
    expect(screen.getByRole("heading", { name: "Order placed, thank you!" })).toBeInTheDocument();
    expect(screen.getByTestId("promise-window")).toHaveTextContent("Arriving Oct 31 – Nov 1");
    expect(screen.getByTestId("order-id")).toHaveTextContent("ord-1");
    expect(screen.getByRole("link", { name: "Review or track your order" })).toHaveAttribute("href", "/orders/ord-1");
  });
  it("shows the order's one-day promise in its time zone with hours", () => {
    const order = { orderId: "ord-1", shopperId: "sh", status: "PLACED", destinationPostalPrefix: "787", placedAt: "2026-10-29T15:00:00Z", lines: [], groups: [{ groupNo: 1, tier: "NEXT_DAY", ...CHICAGO_DAY, lineNos: [1], status: "PROMISED" }] };
    mount(Confirmation, { session: session("COMPLETED", { orderId: "ord-1" }), order, cart: null });
    expect(screen.getByTestId("promise-window")).toHaveTextContent("Arriving Saturday, Oct 31, 9 AM – 9 PM");
  });
  it("falls back to the cart's quoted offer while the order is not readable yet", () => {
    mount(Confirmation, { session: session("COMPLETED", { orderId: "ord-1" }), order: null, cart });
    expect(screen.getByTestId("promise-window")).toHaveTextContent("Arriving Nov 3 – Nov 5");
  });
  it("tells the shopper an in-doubt placement is still settling", () => {
    mount(Confirmation, { session: session("PLACING"), order: null, cart: null });
    expect(screen.getByRole("heading", { name: /placing your order/ })).toBeInTheDocument();
  });
  it("says nothing was charged when the checkout ended otherwise", () => {
    mount(Confirmation, { session: session("EXPIRED"), order: null, cart: null });
    expect(screen.getByText(/Nothing was charged/)).toBeInTheDocument();
  });
});

const order = (status: string, extra: Partial<Order> = {}): Order => ({
  orderId: "ord-1", shopperId: "s", status, destinationPostalPrefix: "787", placedAt: "2026-10-29T15:00:00Z", lines: [{ lineNo: 1, catalogItemId: "item-1", quantity: 1 }],
  groups: [{ groupNo: 1, tier: "STANDARD", deliverByEarliest: "2026-10-31T19:00:00Z", deliverByLatest: "2026-11-01T23:00:00Z", lineNos: [1], status: "PROMISED" }], ...extra,
});

describe("orders pages", () => {
  it("asks a signed-out visitor to sign in", () => {
    mount(Orders, { orders: null, signedOut: true });
    expect(screen.getByRole("link", { name: "sign in" })).toBeInTheDocument();
  });
  it("lists order cards with placed date, status and the promise per shipment", () => {
    mount(Orders, { orders: { items: [order("SHIPPED", { totals: { currency: "USD", totalMinor: 5413 } })], nextCursor: "n1" }, signedOut: false });
    expect(screen.getByRole("link", { name: "ord-1" })).toHaveAttribute("href", "/orders/ord-1");
    expect(screen.getByText("Oct 29, 2026")).toBeInTheDocument();
    expect(screen.getByText("Shipped")).toBeInTheDocument();
    expect(screen.getByText("Arriving Oct 31 – Nov 1")).toBeInTheDocument();
    expect(screen.getByText("$54.13")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Older orders" })).toHaveAttribute("href", "/orders?cursor=n1");
  });
  it("shows the promise, the tracker and cancel before shipment", () => {
    const tracking = { orderId: "ord-1", status: "PLACED", groups: [{ groupNo: 1, status: "SHIPPED", deliverByEarliest: "2026-10-31T19:00:00Z", deliverByLatest: "2026-11-01T23:00:00Z", atRiskReason: "weather", packages: [{ trackingNumber: "TRK1", carrier: "Carrier", state: "OUT_FOR_DELIVERY" }] }] };
    mount(OrderDetail, { order: order("PLACED", { tracking, totals: { currency: "USD", totalMinor: 100 } }), products: { "item-1": { title: "Kettle" } } });
    expect(screen.getByTestId("promise-window")).toHaveTextContent("Arriving Oct 31 – Nov 1");
    expect(screen.getByRole("list", { name: "Shipment progress" })).toBeInTheDocument();
    expect(screen.getByText("Out for delivery").closest("li")).toHaveAttribute("aria-current", "step");
    expect(screen.getByText(/TRK1/)).toBeInTheDocument();
    expect(screen.getByText(/weather/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Kettle" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cancel order" })).toBeInTheDocument();
  });
  it("lists and details orders on the destination's calendar; tracking without a zone uses the group's", () => {
    // Placed 03:00Z Oct 30 is still Oct 29 in Chicago.
    const zoned = order("PLACED", { placedAt: "2026-10-30T03:00:00Z", groups: [{ groupNo: 1, tier: "NEXT_DAY", ...CHICAGO_DAY, lineNos: [1], status: "PROMISED" }] });
    const view = mount(Orders, { orders: { items: [zoned] }, signedOut: false });
    expect(screen.getByText("Oct 29, 2026")).toBeInTheDocument();
    expect(screen.getByText("Arriving Saturday, Oct 31, 9 AM – 9 PM")).toBeInTheDocument();
    view.unmount();
    const tracking = { orderId: "ord-1", status: "PLACED", groups: [{ groupNo: 1, status: "PROMISED", deliverByEarliest: CHICAGO_DAY.deliverByEarliest, deliverByLatest: CHICAGO_DAY.deliverByLatest, packages: [] }] };
    mount(OrderDetail, { order: { ...zoned, tracking }, products: {} });
    expect(screen.getByTestId("promise-window")).toHaveTextContent("Arriving Saturday, Oct 31, 9 AM – 9 PM");
    expect(screen.getByText(/Ordered on Oct 29, 2026/)).toBeInTheDocument();
  });
  it("hides cancel once shipped and says when there are no shipments yet", () => {
    mount(OrderDetail, { order: order("SHIPPED", { groups: [] }), products: {} });
    expect(screen.queryByRole("button", { name: "Cancel order" })).toBeNull();
    expect(screen.getByText("Tracking is not available yet.")).toBeInTheDocument();
  });
  it("shows a stopped shipment instead of the tracker", () => {
    mount(OrderDetail, { order: order("CANCELLED", { groups: [{ groupNo: 1, tier: "STANDARD", deliverByEarliest: "2026-10-31", deliverByLatest: "2026-10-31", lineNos: [1], status: "CANCELLED" }] }), products: {} });
    expect(screen.getAllByText("Cancelled").length).toBeGreaterThan(0);
    expect(screen.queryByRole("list", { name: "Shipment progress" })).toBeNull();
  });
});
