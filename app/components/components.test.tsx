import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createRoutesStub } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "~/lib/api.ts";
import * as q from "~/lib/queries.ts";
import { DeliveryDates } from "./DeliveryDates.tsx";
import { PaymentFields } from "./PaymentFields.tsx";
import { ProblemAlert, problemMessage } from "./ProblemAlert.tsx";
import { ProductCard } from "./ProductCard.tsx";

vi.mock("~/lib/queries.ts");
beforeEach(() => vi.resetAllMocks());

describe("PaymentFields", () => {
  it("offers scenarios only: no card number, expiry or CVC input exists", async () => {
    const onChange = vi.fn();
    render(<PaymentFields value="approve" onChange={onChange} />);
    expect(screen.queryByLabelText(/card number|cvc|cvv|expiry/i)).toBeNull();
    expect(document.querySelectorAll('input[type="text"], input[type="tel"], input[type="number"]')).toHaveLength(0);
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
    expect(problemMessage(new ApiError(503, null))).toMatch(/temporarily unavailable/);
    expect(problemMessage(p(409, "other"))).toBe("D");
    expect(problemMessage(new Error("boom"))).toMatch(/Something went wrong/);
  });
  it("renders nothing without an error", () => {
    const { container } = render(<ProblemAlert error={null} />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe("ProductCard", () => {
  const hit = { catalogItemId: "i/1", title: "Mug", effectivePrice: { amountMinor: 2199, currency: "USD" }, inStock: true, purchasable: true };
  it("links with an encoded id, shows price and loads eagerly only when prioritised", () => {
    const Stub = createRoutesStub([{ path: "/", Component: () => <ul><ProductCard hit={{ ...hit, primaryMedia: { mediaId: "m", url: "/api/storefront/m.svg", altText: "A mug", role: "primary" } }} priority /></ul> }]);
    render(<Stub />);
    expect(screen.getByRole("link")).toHaveAttribute("href", "/products/i%2F1");
    expect(screen.getByText("$21.99")).toBeInTheDocument();
    expect(screen.getByAltText("A mug")).toHaveAttribute("loading", "eager");
  });
  it("marks unpurchasable products", () => {
    const Stub = createRoutesStub([{ path: "/", Component: () => <ul><ProductCard hit={{ ...hit, purchasable: false }} /></ul> }]);
    render(<Stub />);
    expect(screen.getByText("Currently unavailable")).toBeInTheDocument();
  });
});

describe("DeliveryDates", () => {
  it("does not call the BFF until asked, then shows tiers with charges", async () => {
    vi.mocked(q.quoteDeliveryDates).mockResolvedValue({
      postalPrefix: "10001", unavailable: [],
      tiers: [{ tier: "NEXT_DAY", deliverByEarliest: "2030-01-05T00:00:00Z", deliverByLatest: "2030-01-05T23:00:00Z", charge: { amountMinor: 999, currency: "USD" } }],
    });
    render(<DeliveryDates productId="item-1" />);
    expect(q.quoteDeliveryDates).not.toHaveBeenCalled();
    await userEvent.type(screen.getByLabelText("Postal code"), "10001");
    await userEvent.click(screen.getByRole("button", { name: "See delivery dates" }));
    expect(await screen.findByText(/Next day/)).toBeInTheDocument();
    expect(q.quoteDeliveryDates).toHaveBeenCalledWith("item-1", "10001");
    expect(screen.getByText(/\$9\.99/)).toBeInTheDocument();
  });
  it("keeps the enter-a-postal-code text when the quote times out", async () => {
    vi.mocked(q.quoteDeliveryDates).mockRejectedValue(new ApiError(504, null));
    render(<DeliveryDates productId="item-1" />);
    await userEvent.type(screen.getByLabelText("Postal code"), "10001");
    await userEvent.click(screen.getByRole("button", { name: "See delivery dates" }));
    await waitFor(() => expect(screen.getAllByText(/Enter your postal code/).length).toBeGreaterThan(0));
  });
  it("says so when no tier can serve the postal code", async () => {
    vi.mocked(q.quoteDeliveryDates).mockResolvedValue({ postalPrefix: "99999", unavailable: [], tiers: [] });
    render(<DeliveryDates productId="item-1" />);
    await userEvent.type(screen.getByLabelText("Postal code"), "99999");
    await userEvent.click(screen.getByRole("button", { name: "See delivery dates" }));
    expect(await screen.findByText(/cannot be delivered to 99999/)).toBeInTheDocument();
  });
});
