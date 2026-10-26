import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "~/lib/api.ts";
import * as q from "~/lib/queries.ts";
import type { CheckoutSession } from "~/lib/types.ts";
import type { Route as AccountRoute } from "./+types/account";
import type { Route as CartRoute } from "./+types/cart";
import type { Route as CheckoutRoute } from "./+types/checkout";
import type { Route as OrderRoute } from "./+types/order-detail";
import { clientAction as accountAction } from "./account.tsx";
import { clientAction as cartAction } from "./cart.tsx";
import { clientAction as checkoutAction, outcomeMessage } from "./checkout.tsx";
import { clientAction as orderAction } from "./order-detail.tsx";

vi.mock("~/lib/queries.ts");
const post = (fields: Record<string, string>) => {
  const body = new FormData();
  for (const [k, v] of Object.entries(fields)) body.set(k, v);
  return new Request("http://web.test/x", { method: "POST", body });
};
const session = (state: string): CheckoutSession => ({ sessionId: "sess-1", state: state as CheckoutSession["state"], cartId: "c", shopperId: "s", shipToAddressId: "a", lines: [], groups: [], quoteExpiresAt: "2030-01-01T00:00:00Z", version: 1 });

beforeEach(() => {
  vi.resetAllMocks();
  sessionStorage.clear();
});

describe("cart action", () => {
  const run = (f: Record<string, string>) => cartAction({ request: post(f), params: {} } as CartRoute.ClientActionArgs);
  it("clamps quantity and pins the action id", async () => {
    vi.mocked(q.setLineQuantity).mockResolvedValue({} as never);
    await run({ intent: "set-quantity", cartId: "c1", item: "i1", quantity: "500", actionId: "act" });
    expect(q.setLineQuantity).toHaveBeenCalledWith("c1", "i1", 99, "act");
  });
  it.each([
    ["remove", () => q.removeLine, ["c1", "i1", undefined]],
    ["set-destination", () => q.setDestination, ["c1", "10001", undefined]],
    ["quote", () => q.quoteCartDelivery, ["c1", undefined]],
    ["select", () => q.selectCartDelivery, ["c1", 2, "offer-1", undefined]],
  ])("dispatches %s", async (intent, fn, args) => {
    vi.mocked(fn()).mockResolvedValue({} as never);
    expect(await run({ intent, cartId: "c1", item: "i1", postalPrefix: "10001", groupNo: "2", offerId: "offer-1" })).toMatchObject({ ok: true });
    expect(fn()).toHaveBeenCalledWith(...args);
  });
  it("turns upstream problems into shopper text instead of throwing", async () => {
    vi.mocked(q.quoteCartDelivery).mockRejectedValue(new ApiError(504, null));
    const r = await run({ intent: "quote", cartId: "c1" });
    expect(r).toEqual({ ok: false, error: expect.stringContaining("too long") });
  });
  it("rejects unknown intents", async () => expect(await run({ intent: "nope" })).toMatchObject({ ok: false }));
});

describe("checkout action", () => {
  const run = (f: Record<string, string>) => checkoutAction({ request: post(f), params: {} } as CheckoutRoute.ClientActionArgs);
  it("opens a session for a saved address id only and remembers its id", async () => {
    vi.mocked(q.openCheckout).mockResolvedValue(session("OPEN"));
    await run({ intent: "open", shipToAddressId: "addr-1", actionId: "a" });
    expect(q.openCheckout).toHaveBeenCalledWith("addr-1", undefined, "a");
    expect(sessionStorage.getItem("sf.checkoutId")).toBe("sess-1");
  });
  it("posts only the scenario token on confirm and redirects to the confirmation", async () => {
    vi.mocked(q.confirmCheckout).mockResolvedValue(session("COMPLETED"));
    const r = (await run({ intent: "confirm", sessionId: "sess-1", scenario: "approve" })) as Response;
    expect(q.confirmCheckout).toHaveBeenCalledWith("sess-1", "tok_approve", undefined);
    expect(r.status).toBe(302);
    expect(r.headers.get("Location")).toBe("/confirmation/sess-1");
  });
  it("sends an in-doubt placement to the confirmation page to poll", async () => {
    vi.mocked(q.confirmCheckout).mockResolvedValue(session("PLACING"));
    const r = (await run({ intent: "confirm", sessionId: "sess-1", scenario: "timeout" })) as Response;
    expect(r.headers.get("Location")).toBe("/confirmation/sess-1");
  });
  it("stays on checkout when declined", async () => {
    vi.mocked(q.confirmCheckout).mockResolvedValue(session("DECLINED"));
    const r = await run({ intent: "confirm", sessionId: "sess-1", scenario: "decline" });
    expect(r).toMatchObject({ ok: true, value: { state: "DECLINED" } });
  });
  it("refuses a scenario that is not on the list (never forwards a card-like value)", async () => {
    const r = await run({ intent: "confirm", sessionId: "sess-1", scenario: "4242424242424242" });
    expect(r).toMatchObject({ ok: false });
    expect(q.confirmCheckout).not.toHaveBeenCalled();
  });
  it("describes non-success outcomes", () => {
    expect(outcomeMessage(session("DECLINED"))).toMatch(/declined/);
    expect(outcomeMessage(session("REQUOTE_REQUIRED"))).toMatch(/changed/);
    expect(outcomeMessage(session("EXPIRED"))).toMatch(/expired/);
    expect(outcomeMessage({ ...session("FAILED"), failureCode: "x1" })).toMatch(/x1/);
    expect(outcomeMessage(session("OPEN"))).toBeNull();
  });
});

describe("account and order actions", () => {
  it("registers with a saved address and upper-cases the country", async () => {
    vi.mocked(q.registerShopper).mockResolvedValue({} as never);
    const f = { intent: "register", email: "a@example.test", name: "N", line1: "1 St", city: "C", region: "R", postalCode: "1", countryCode: "us", actionId: "k" };
    await accountAction({ request: post(f), params: {} } as AccountRoute.ClientActionArgs);
    expect(vi.mocked(q.registerShopper).mock.calls[0]?.[0]).toMatchObject({ email: "a@example.test", savedAddresses: [{ countryCode: "US", postalCode: "1" }] });
  });
  it("signs in by e-mail", async () => {
    vi.mocked(q.createSession).mockResolvedValue({} as never);
    expect(await accountAction({ request: post({ intent: "sign-in", email: "a@example.test" }), params: {} } as AccountRoute.ClientActionArgs)).toMatchObject({ ok: true });
  });
  it("cancels with a reason and shows the lock refusal as text", async () => {
    vi.mocked(q.cancelOrder).mockRejectedValue(new ApiError(409, { type: "/problems/cancel-after-lock", title: "locked", status: 409 }));
    const r = await orderAction({ request: post({ reason: "changed my mind" }), params: { id: "o1" } } as OrderRoute.ClientActionArgs);
    expect(q.cancelOrder).toHaveBeenCalledWith("o1", "changed my mind", undefined);
    expect(r).toEqual({ ok: false, error: expect.stringContaining("no longer be cancelled") });
  });
  it("requires a reason", async () => {
    expect(await orderAction({ request: post({ reason: " " }), params: { id: "o1" } } as OrderRoute.ClientActionArgs)).toMatchObject({ ok: false });
    expect(q.cancelOrder).not.toHaveBeenCalled();
  });
});
