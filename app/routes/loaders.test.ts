import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "~/lib/api.ts";
import * as q from "~/lib/queries.ts";
import type { Route as HomeRoute } from "./+types/home";
import type { Route as ProductRoute } from "./+types/product";
import type { Route as SearchRoute } from "./+types/search";
import { loader as homeLoader } from "./home.tsx";
import { loader as productLoader } from "./product.tsx";
import { loader as searchLoader } from "./search.tsx";

vi.mock("~/lib/queries.ts");
const req = (url: string) => new Request(`http://web.test${url}`, { headers: { cookie: "sf_state=c%3D1" } });
const result = { hits: [], facets: [{ name: "category", values: [{ value: "kitchen", count: 3 }] }] };

beforeEach(() => vi.resetAllMocks());

describe("SSR loaders", () => {
  it("home loads featured hits and category facets, calling the BFF with the forwarded cookie", async () => {
    vi.mocked(q.searchProducts).mockResolvedValue(result);
    const out = await homeLoader({ request: req("/") } as HomeRoute.LoaderArgs);
    expect(out.categories).toEqual([{ value: "kitchen", count: 3 }]);
    const opts = vi.mocked(q.searchProducts).mock.calls[0]?.[1];
    expect(opts?.cookie).toBe("sf_state=c%3D1");
    expect(opts?.base).toMatch(/\/api\/storefront$/);
  });

  it("search passes the validated filters", async () => {
    vi.mocked(q.searchProducts).mockResolvedValue(result);
    await searchLoader({ request: req("/search?q=mug&sort=title") } as SearchRoute.LoaderArgs);
    expect(vi.mocked(q.searchProducts).mock.calls[0]?.[0]).toMatchObject({ q: "mug", sort: "title", limit: 24 });
  });

  it("product turns an upstream 404 into a 404 response", async () => {
    vi.mocked(q.getProduct).mockRejectedValue(new ApiError(404, { type: "/problems/not-found", title: "n", status: 404 }));
    const err = await productLoader({ request: req("/products/x"), params: { id: "x" } } as ProductRoute.LoaderArgs).catch((e: unknown) => e);
    expect((err as { init?: { status?: number } }).init?.status).toBe(404);
  });

  it("product relays other failures to the error boundary", async () => {
    vi.mocked(q.getProduct).mockRejectedValue(new ApiError(503, null));
    await expect(productLoader({ request: req("/products/x"), params: { id: "x" } } as ProductRoute.LoaderArgs)).rejects.toBeInstanceOf(ApiError);
  });
});
