import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "~/lib/api.ts";
import * as q from "~/lib/queries.ts";
import type { CategoryList, ProductHit } from "~/lib/types.ts";
import type { Route as RootRoute } from "../+types/root";
import type { Route as HomeRoute } from "./+types/home";
import type { Route as ProductRoute } from "./+types/product";
import type { Route as SearchRoute } from "./+types/search";
import { loader as rootLoader, shouldRevalidate } from "../root.tsx";
import { loader as homeLoader } from "./home.tsx";
import { loader as productLoader } from "./product.tsx";
import { loader as searchLoader } from "./search.tsx";

vi.mock("~/lib/queries.ts");
const req = (url: string, cookie = "sf_state=c%3D1") => new Request(`http://web.test${url}`, { headers: { cookie } });
const hit = (id: string, path: string[]): ProductHit => ({ catalogItemId: id, title: id, inStock: true, purchasable: true, categoryId: `cat-${id}`, categoryPath: path });
const tree: CategoryList = {
  version: 1,
  categories: [
    { categoryId: "cat-k", name: "Kitchen & Dining", path: "/k", purchasableCount: 9 },
    { categoryId: "cat-b", name: "Bed & Bath", path: "/b", purchasableCount: 2 },
    { categoryId: "cat-x", name: "Toys", path: "/x", purchasableCount: 0 },
  ],
};
const notFound = new ApiError(404, { type: "/problems/resource-not-found", title: "n", status: 404 });

beforeEach(() => vi.resetAllMocks());

describe("SSR loaders", () => {
  it("root reads the department tree and the typed ZIP, and survives a BFF without /categories", async () => {
    vi.mocked(q.listCategories).mockResolvedValue(tree);
    const out = await rootLoader({ request: req("/", "sf_dest=p%3D787%26z%3D78701") } as RootRoute.LoaderArgs);
    expect(out).toEqual({ categories: tree, destination: { zip: "78701", prefix: "787" } });
    vi.mocked(q.listCategories).mockRejectedValue(notFound);
    expect(await rootLoader({ request: req("/") } as RootRoute.LoaderArgs)).toEqual({ categories: null, destination: null });
    expect(shouldRevalidate()).toBe(false);
  });

  it("home shows department cards and one popular row per busiest department, with the forwarded cookie", async () => {
    vi.mocked(q.listCategories).mockResolvedValue(tree);
    vi.mocked(q.searchProducts).mockImplementation(async (p) => ({ items: [hit(`${p.categoryId}-1`, ["X"])], facets: [] }));
    const out = await homeLoader({ request: req("/") } as HomeRoute.LoaderArgs);
    expect(out.departments.map((d) => [d.name, d.count, d.image])).toEqual([["Kitchen & Dining", 9, "/media/departments/kitchen-dining.svg"], ["Bed & Bath", 2, "/media/departments/bed-bath.svg"]]);
    expect(out.rows.map((r) => r.title)).toEqual(["Kitchen & Dining", "Bed & Bath"]);
    const [params, opts] = vi.mocked(q.searchProducts).mock.calls[0] ?? [];
    expect(params).toMatchObject({ categoryId: "cat-k", limit: 6 });
    expect(opts?.cookie).toBe("sf_state=c%3D1");
    expect(opts?.base).toMatch(/\/api\/storefront$/);
  });

  it("home falls back to rows grouped by the hits' department when the tree is unavailable", async () => {
    vi.mocked(q.listCategories).mockRejectedValue(notFound);
    vi.mocked(q.searchProducts).mockResolvedValue({ items: [hit("a", ["Jewelry", "Rings"]), hit("b", ["Electronics"]), hit("c", ["Jewelry"]), hit("d", [])], facets: [] });
    const out = await homeLoader({ request: req("/") } as HomeRoute.LoaderArgs);
    expect(out.departments).toEqual([]);
    expect(out.rows.map((r) => [r.title, r.hits.length])).toEqual([["Jewelry", 2], ["Electronics", 1], ["Featured", 1]]);
  });

  it("search passes the validated filters, the category id included, and the display offset", async () => {
    vi.mocked(q.searchProducts).mockResolvedValue({ items: [], facets: [] });
    const out = await searchLoader({ request: req("/search?q=mug&sort=title&categoryId=cat-k&from=24") } as SearchRoute.LoaderArgs);
    expect(vi.mocked(q.searchProducts).mock.calls[0]?.[0]).toMatchObject({ q: "mug", sort: "title", categoryId: "cat-k", limit: 24 });
    expect(out.offset).toBe(24);
  });

  it("product turns an upstream 404 into a 404 response", async () => {
    vi.mocked(q.getProduct).mockRejectedValue(notFound);
    const err = await productLoader({ request: req("/products/x"), params: { id: "x" } } as ProductRoute.LoaderArgs).catch((e: unknown) => e);
    expect((err as { init?: { status?: number } }).init?.status).toBe(404);
  });

  it("product relays other failures to the error boundary", async () => {
    vi.mocked(q.getProduct).mockRejectedValue(new ApiError(503, null));
    await expect(productLoader({ request: req("/products/x"), params: { id: "x" } } as ProductRoute.LoaderArgs)).rejects.toBeInstanceOf(ApiError);
  });
});
