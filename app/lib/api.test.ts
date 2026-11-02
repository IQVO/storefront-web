import { describe, expect, it, vi } from "vitest";
import { API_BASE, ApiError, call, callRaw, query, seg } from "./api.ts";

const json = (body: unknown, init: ResponseInit = {}) =>
  new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" }, ...init });

describe("api", () => {
  it("uses only the relative BFF base by default", async () => {
    const f = vi.fn().mockResolvedValue(json({ ok: 1 }));
    await call("/products", { fetchImpl: f });
    expect(f.mock.calls[0]?.[0]).toBe(`${API_BASE}/products`);
    expect(API_BASE).toBe("/api/storefront");
  });

  it("sends JSON body, idempotency key and forwarded cookie", async () => {
    const f = vi.fn().mockResolvedValue(json({}, { status: 201 }));
    const r = await callRaw("/carts", { method: "POST", body: { a: 1 }, idempotencyKey: "act-1", cookie: "sf_state=c%3D1", base: "http://bff.test/api/storefront", fetchImpl: f });
    const [url, init] = f.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://bff.test/api/storefront/carts");
    expect(init.body).toBe('{"a":1}');
    expect(init.headers).toMatchObject({ "Content-Type": "application/json", "Idempotency-Key": "act-1", Cookie: "sf_state=c%3D1" });
    expect(r.status).toBe(201);
  });

  it("throws ApiError with the RFC 9457 problem and its slug", async () => {
    const problem = { type: "/problems/session-required", title: "Session required", status: 422 };
    const f = vi.fn().mockResolvedValue(new Response(JSON.stringify(problem), { status: 422, headers: { "Content-Type": "application/problem+json" } }));
    const err = await call("/me", { fetchImpl: f }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).status).toBe(422);
    expect((err as ApiError).slug).toBe("session-required");
  });

  it("tolerates a non-problem error body and an empty success body", async () => {
    const bad = vi.fn().mockResolvedValue(new Response("<html>bad gateway</html>", { status: 502 }));
    const err = (await call("/x", { fetchImpl: bad }).catch((e: unknown) => e)) as ApiError;
    expect(err.problem).toBeNull();
    expect(err.slug).toBe("");
    const empty = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    expect(await call("/x", { fetchImpl: empty })).toBeNull();
  });

  it("encodes path segments and drops empty query values", () => {
    expect(seg("a/b:c")).toBe("a%2Fb%3Ac");
    expect(query({ q: "red pen", limit: 24, after: undefined, x: "", inStock: false })).toBe("?q=red+pen&limit=24&inStock=false");
    expect(query({})).toBe("");
  });
});
