import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createRoutesStub } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "~/lib/api.ts";
import * as q from "~/lib/queries.ts";
import { rememberShopper } from "~/lib/shopper.ts";
import type { Category, DeliveryDates, Shopper } from "~/lib/types.ts";
import { DeliveryPromise } from "./DeliveryPromise.tsx";
import { PaymentFields } from "./PaymentFields.tsx";
import { Price } from "./Price.tsx";
import { ProblemAlert, problemMessage } from "./ProblemAlert.tsx";
import { ProductCard } from "./ProductCard.tsx";
import { SessionProvider, useSession } from "./Session.tsx";
import { SiteHeader } from "./SiteHeader.tsx";

vi.mock("~/lib/queries.ts");
beforeEach(() => {
  vi.resetAllMocks();
  document.cookie = "sf_dest=; Max-Age=0; Path=/";
});

const inRouter = (ui: React.ReactNode, path = "/") => {
  const Stub = createRoutesStub([{ path: "*", Component: () => <>{ui}</> }]);
  return render(<Stub initialEntries={[path]} />);
};
const usd = (amountMinor: number) => ({ amountMinor, currency: "USD" });
const dates = (over: Partial<DeliveryDates> = {}): DeliveryDates => ({
  postalPrefix: "787", unavailable: [],
  tiers: [
    { tier: "STANDARD", deliverByEarliest: "2026-11-03T18:00:00Z", deliverByLatest: "2026-11-05T18:00:00Z", charge: usd(499), freeOver: usd(2500) },
    { tier: "NEXT_DAY", deliverByEarliest: "2026-10-31T18:00:00Z", deliverByLatest: "2026-10-31T18:00:00Z", charge: usd(999) },
  ],
  ...over,
});
const shopper: Shopper = { shopperId: "shp-1", email: "a@example.test", status: "ACTIVE", registeredAt: "2030-01-01T00:00:00Z", savedAddresses: [{ addressId: "addr-1", name: "Sam Shopper", line1: "1100 Congress Ave", city: "Austin", region: "TX", postalCode: "78701", countryCode: "US" }] };

describe("PaymentFields", () => {
  it("offers simulated test cards only: no card number, expiry or CVC input exists", async () => {
    const onChange = vi.fn();
    render(<PaymentFields value="approve" onChange={onChange} />);
    expect(screen.queryByLabelText(/card number|cvc|cvv|expiry/i)).toBeNull();
    expect(document.querySelectorAll('input[type="text"], input[type="tel"], input[type="number"]')).toHaveLength(0);
    expect(screen.getByRole("group", { name: "Simulated hosted card fields" })).toBeInTheDocument();
    await userEvent.click(screen.getByLabelText(/Decline/));
    expect(onChange).toHaveBeenCalledWith("decline");
  });
});

describe("ProblemAlert", () => {
  it("maps stable problem slugs and statuses to shopper text", () => {
    const p = (status: number, slug: string) => new ApiError(status, { type: `/problems/${slug}`, title: "T", status, detail: "D" });
    expect(problemMessage(p(422, "session-required"))).toMatch(/sign in/);
    expect(problemMessage(p(409, "cancel-after-lock"))).toMatch(/no longer be cancelled/);
    expect(problemMessage(p(402, "payment-declined"))).toMatch(/declined/);
    expect(problemMessage(p(409, "stale-delivery-selection"))).toMatch(/choose your delivery option again/);
    expect(problemMessage(new ApiError(503, null))).toMatch(/temporarily unavailable/);
    expect(problemMessage(p(409, "other"))).toBe("D");
    expect(problemMessage(new Error("boom"))).toMatch(/Something went wrong/);
  });
  it("renders nothing without an error", () => {
    const { container } = render(<ProblemAlert error={null} />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe("Price and ProductCard", () => {
  const hit = { catalogItemId: "i/1", title: "Mug", effectivePrice: usd(2199), inStock: true, purchasable: true };
  it("shows a big price with superscript cents and a plain amount for screen readers", () => {
    render(<Price money={usd(123456)} size="lg" />);
    expect(screen.getByText("$1,234.56")).toHaveClass("sr-only");
    expect(screen.getByText("56").tagName).toBe("SUP");
    render(<Price money={undefined} />);
    expect(screen.getByText("Price unavailable")).toBeInTheDocument();
  });
  it("links with an encoded id, loads department media from this origin and eagerly only when prioritised", () => {
    inRouter(<ul><ProductCard hit={{ ...hit, primaryMedia: { mediaId: "m", url: "http://storefront.localhost/media/departments/kitchen-dining.svg", altText: "A mug", role: "PRIMARY" } }} priority /></ul>);
    expect(screen.getByRole("link")).toHaveAttribute("href", "/products/i%2F1");
    expect(screen.getByText("$21.99")).toBeInTheDocument();
    expect(screen.getByAltText("A mug")).toHaveAttribute("src", "/media/departments/kitchen-dining.svg");
    expect(screen.getByAltText("A mug")).toHaveAttribute("loading", "eager");
    expect(screen.getByText("In stock")).toBeInTheDocument();
  });
  it("marks unpurchasable products", () => {
    inRouter(<ul><ProductCard hit={{ ...hit, purchasable: false }} /></ul>);
    expect(screen.getByText("Currently unavailable")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "No image available" })).toBeInTheDocument();
  });
});

describe("DeliveryPromise", () => {
  const mount = (initial: { zip: string; prefix: string } | null, orderMinor = 3499) =>
    render(<SessionProvider initialDestination={initial}><DeliveryPromise productId="item-1" orderMinor={orderMinor} currency="USD" /></SessionProvider>);

  it("asks for a ZIP before calling the BFF, then quotes the 3-character prefix and shows the promise", async () => {
    vi.mocked(q.quoteDeliveryDates).mockResolvedValue(dates());
    mount(null);
    expect(q.quoteDeliveryDates).not.toHaveBeenCalled();
    await userEvent.type(screen.getByLabelText(/Enter your ZIP code/), "78701");
    await userEvent.click(screen.getByRole("button", { name: "Apply" }));
    expect(await screen.findByTestId("promise-main")).toHaveTextContent(/FREE delivery Tue, Nov 3 – Thu, Nov 5/);
    expect(q.quoteDeliveryDates).toHaveBeenCalledWith("item-1", "787");
    expect(screen.getByTestId("promise-fastest")).toHaveTextContent(/Or fastest delivery Saturday, October 31 · \$9\.99/);
    expect(screen.getByText(/Arriving Nov 3 – Nov 5/)).toBeInTheDocument();
    expect(screen.getByText(/delivery network's promise for ZIP 78701/)).toBeInTheDocument();
    expect(document.cookie).toContain("sf_dest=");
  });
  it("shows each tier's window on the destination's calendar with hours for a one-day window", async () => {
    const chicago = { deliverByEarliest: "2026-10-31T14:00:00Z", deliverByLatest: "2026-11-01T02:00:00Z", timeZone: "America/Chicago" };
    vi.mocked(q.quoteDeliveryDates).mockResolvedValue(dates({ tiers: [{ tier: "NEXT_DAY", ...chicago, charge: usd(999) }] }));
    mount({ zip: "78701", prefix: "787" });
    expect(await screen.findByTestId("promise-main")).toHaveTextContent(/\$9\.99 delivery Saturday, October 31/);
    expect(screen.getByText(/Arriving Saturday, Oct 31, 9 AM – 9 PM/)).toBeInTheDocument();
  });
  it("loads automatically when the destination is known and charges below the free threshold", async () => {
    vi.mocked(q.quoteDeliveryDates).mockResolvedValue(dates());
    mount({ zip: "78701", prefix: "787" }, 899);
    expect(await screen.findByTestId("promise-main")).toHaveTextContent(/\$4\.99 delivery/);
    expect(screen.getByText(/Deliver to 78701/)).toBeInTheDocument();
  });
  it("says when the ZIP is not served, when the quote fails and when the ZIP is unusable", async () => {
    vi.mocked(q.quoteDeliveryDates).mockResolvedValueOnce(dates({ tiers: [], unavailable: [{ tier: "STANDARD", constraint: "DESTINATION_NOT_SERVED" }] }));
    mount({ zip: "10001", prefix: "100" });
    expect(await screen.findByText(/cannot be delivered to ZIP 10001/)).toBeInTheDocument();
    vi.mocked(q.quoteDeliveryDates).mockRejectedValueOnce(new ApiError(504, null));
    await userEvent.click(screen.getByRole("button", { name: "Change" }));
    await userEvent.type(screen.getByLabelText(/another ZIP/), "78702");
    await userEvent.click(screen.getByRole("button", { name: "Apply" }));
    expect(await screen.findByText(/unavailable right now/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Change" }));
    await userEvent.clear(screen.getByLabelText(/another ZIP/));
    await userEvent.type(screen.getByLabelText(/another ZIP/), "1");
    await userEvent.click(screen.getByRole("button", { name: "Apply" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Enter a valid ZIP code.");
  });
  it("names another constraint when tiers are unavailable for other reasons", async () => {
    vi.mocked(q.quoteDeliveryDates).mockResolvedValue(dates({ tiers: [], unavailable: [{ tier: "STANDARD", constraint: "ITEM_QUANTITY_NOT_AVAILABLE" }] }));
    mount({ zip: "78701", prefix: "787" });
    expect(await screen.findByText(/No delivery option is available/)).toBeInTheDocument();
  });
});

describe("SiteHeader and session", () => {
  const depts: Category[] = [{ categoryId: "cat-k", name: "Kitchen & Dining", path: "/k", purchasableCount: 3 }];
  it("shows the department bar, the department select and an Enter ZIP chip for a new visitor", async () => {
    inRouter(<SessionProvider initialDestination={null}><SiteHeader depts={depts} /></SessionProvider>, "/search?categoryId=cat-k&q=pan");
    expect(screen.getByRole("navigation", { name: "Departments" })).toHaveTextContent("Kitchen & Dining");
    expect(screen.getByRole("link", { name: "Kitchen & Dining" })).toHaveAttribute("href", "/search?categoryId=cat-k");
    expect(screen.getByLabelText("Department")).toHaveValue("cat-k");
    expect(screen.getByLabelText("Search products")).toHaveValue("pan");
    expect(screen.getByText("Enter ZIP")).toBeInTheDocument();
    expect(screen.getByText("Hello, sign in")).toBeInTheDocument();
    expect(q.getMe).not.toHaveBeenCalled();
    await userEvent.click(screen.getByText("Enter ZIP"));
    await userEvent.type(screen.getByLabelText("Choose your location"), "x");
    await userEvent.click(screen.getByRole("button", { name: "Apply" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Enter a valid ZIP code.");
    await userEvent.clear(screen.getByLabelText("Choose your location"));
    await userEvent.type(screen.getByLabelText("Choose your location"), "78701");
    await userEvent.click(screen.getByRole("button", { name: "Apply" }));
    expect(screen.getByText("78701")).toBeInTheDocument();
  });
  it("greets a signed-in shopper and delivers to the first saved address", async () => {
    rememberShopper("shp-1");
    vi.mocked(q.getMe).mockResolvedValue(shopper);
    inRouter(<SessionProvider initialDestination={null}><SiteHeader depts={[]} /></SessionProvider>);
    expect(await screen.findByText("Hello, Sam")).toBeInTheDocument();
    expect(screen.getByText("Deliver to Austin")).toBeInTheDocument();
    expect(screen.getByText("78701")).toBeInTheDocument();
  });
  it("offers a usable default outside the provider", () => {
    let value: ReturnType<typeof useSession> | null = null;
    const Probe = () => {
      value = useSession();
      return null;
    };
    render(<Probe />);
    act(() => value?.setShopper(null));
    expect(value!.destination).toBeNull();
    expect(value!.setZip("78701")).toEqual({ zip: "78701", prefix: "787" });
  });
  it("keeps the cookie destination over the saved address", async () => {
    rememberShopper("shp-1");
    vi.mocked(q.getMe).mockResolvedValue(shopper);
    inRouter(<SessionProvider initialDestination={{ zip: "78610", prefix: "786" }}><SiteHeader depts={[]} /></SessionProvider>);
    await waitFor(() => expect(q.getMe).toHaveBeenCalled());
    expect(screen.getByText("78610")).toBeInTheDocument();
  });
});
