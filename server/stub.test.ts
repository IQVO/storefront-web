// @vitest-environment node
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createStubHandler } from "./stub-handler.ts";

// The stub mirrors the upstream contracts the BFF relays unchanged, so the web cannot drift from them unnoticed.
let server: Server;
let base = "";
let cookie = "";

async function call(method: string, path: string, body?: unknown, noKey = false) {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (cookie) headers["Cookie"] = cookie;
  if ((method === "POST" || method === "PATCH") && !noKey) headers["Idempotency-Key"] = crypto.randomUUID();
  const r = await fetch(`${base}/api/storefront${path}`, { method, headers, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  const set = r.headers.get("set-cookie");
  if (set) cookie = set.split(";")[0] ?? "";
  return { status: r.status, json: (await r.json()) as Record<string, unknown> };
}

beforeAll(async () => {
  const stub = createStubHandler();
  server = createServer((req, res) => void stub(req, res));
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

describe("stub BFF contract", () => {
  it("answers 400 idempotency-key-required on a POST/PATCH without the header, and 400 idempotency-key-invalid for a bad key", async () => {
    const missing = await call("POST", "/carts", undefined, true);
    expect(missing.status).toBe(400);
    expect(String(missing.json["type"])).toMatch(/idempotency-key-required$/);
    const r = await fetch(`${base}/api/storefront/carts`, { method: "POST", headers: { "Idempotency-Key": "x".repeat(129) } });
    expect(r.status).toBe(400);
    expect(String(((await r.json()) as { type: string }).type)).toMatch(/idempotency-key-invalid$/);
  });

  it.each([
    ["POST", "/products/item-kettle:delivery-dates"],
    ["POST", "/carts/c1/destination"],
    ["POST", "/carts/c1/delivery:quote"],
    ["POST", "/carts/c1/delivery:select"],
    ["POST", "/checkout/s1:confirm"],
    ["POST", "/orders/o1:cancel"],
  ])("retired route %s %s is gone", async (method, path) => {
    expect([404, 405]).toContain((await call(method, path, {})).status);
  });

  it("answers 422 session-required for GET /carts without a shopper session", async () => {
    expect((await call("GET", "/carts?state=OPEN")).status).toBe(422);
  });

  it("serves the category tree with purchasable counts and media on the request's host", async () => {
    const { json } = await call("GET", "/categories");
    const cats = json["categories"] as unknown as { categoryId: string; parentId?: string; name: string; purchasableCount: number }[];
    expect(cats.find((c) => c.name === "Kitchen & Dining")).toMatchObject({ categoryId: "cat-kitchen-dining", purchasableCount: 3 });
    expect(cats.filter((c) => !c.parentId)).toHaveLength(13);
    const { json: found } = await call("GET", "/products?categoryId=cat-kitchen-dining");
    const hits = found["items"] as unknown as { primaryMedia: { url: string }; categoryPath: string[] }[];
    expect(hits).toHaveLength(3);
    expect(hits[0]?.primaryMedia.url).toBe(`${base}/media/departments/kitchen-dining.svg`);
    expect(hits[0]?.categoryPath[0]).toBe("Kitchen & Dining");
  });

  it("quotes delivery dates only for a served 3-character prefix: a full ZIP is DESTINATION_NOT_SERVED", async () => {
    const full = await call("POST", "/products/item-kettle/delivery-date-quotes", { postalPrefix: "78701" });
    expect(full.json["tiers"]).toEqual([]);
    expect(JSON.stringify(full.json["unavailable"])).toContain("DESTINATION_NOT_SERVED");
    const served = await call("POST", "/products/item-kettle/delivery-date-quotes", { postalPrefix: "787" });
    expect((served.json["tiers"] as unknown as unknown[]).length).toBeGreaterThan(0);
  });

  it("sends each tier's window as the real promise does: 14:00Z..02:00Z instants with the destination's timeZone", async () => {
    const { json } = await call("POST", "/products/item-kettle/delivery-date-quotes", { postalPrefix: "787" });
    const tiers = json["tiers"] as unknown as { tier: string; deliverByEarliest: string; deliverByLatest: string; timeZone: string }[];
    for (const t of tiers) {
      expect(t.timeZone).toBe("America/Chicago");
      expect(t.deliverByEarliest).toMatch(/T14:00:00Z$/);
      expect(t.deliverByLatest).toMatch(/T02:00:00Z$/);
    }
    const next = tiers.find((t) => t.tier === "NEXT_DAY");
    expect(Date.parse(next?.deliverByLatest ?? "") - Date.parse(next?.deliverByEarliest ?? "")).toBe(12 * 3_600_000);
  });

  it("rejects postalPrefix on the cart destination (strict decoder) and answers DESTINATION_NOT_SERVED for an unserved prefix", async () => {
    const { json: cart } = await call("POST", "/carts");
    const id = String(cart["cartId"]);
    await call("POST", `/carts/${id}/lines`, { catalogItemId: "item-kettle", quantity: 1 });
    const wrong = await call("PUT", `/carts/${id}/destination`, { postalPrefix: "787" });
    expect(wrong.status).toBe(400);
    expect(wrong.json["detail"]).toBe('json: unknown field "postalPrefix"');
    expect((await call("PUT", `/carts/${id}/destination`, { destinationPostalPrefix: "78701" })).status).toBe(200);
    const unserved = await call("POST", `/carts/${id}/delivery-quotes`);
    const quote = unserved.json["deliveryQuote"] as unknown as { groups: unknown[]; unavailable: { constraint: string }[] };
    expect(quote.groups).toEqual([]);
    expect(quote.unavailable[0]?.constraint).toBe("DESTINATION_NOT_SERVED");
    await call("PUT", `/carts/${id}/destination`, { destinationPostalPrefix: "787" });
    const served = await call("POST", `/carts/${id}/delivery-quotes`);
    const groups = (served.json["deliveryQuote"] as unknown as { groups: { offers: { offerId: string }[] }[] }).groups;
    expect(groups[0]?.offers.length).toBeGreaterThan(0);
    expect((await call("PUT", `/carts/${id}/delivery-selection`, { groupNo: 1, offerId: "stale" })).status).toBe(409);
    const selected = await call("PUT", `/carts/${id}/delivery-selection`, { groupNo: 1, offerId: groups[0]?.offers[0]?.offerId });
    expect(selected.json["checkoutReadiness"]).toMatchObject({ ready: true });
  });
});
