import type { SearchParams } from "./queries.ts";

export const SORTS = [
  { id: "relevance", label: "Featured" },
  { id: "price-asc", label: "Price: Low to High" },
  { id: "price-desc", label: "Price: High to Low" },
  { id: "title", label: "Name: A to Z" },
] as const;

export const PAGE_SIZE = 24;

/** Reads the search form's query string; unknown values are dropped, not forwarded. */
export function paramsFromUrl(url: URL): SearchParams {
  const g = (k: string) => url.searchParams.get(k) || undefined;
  const num = (k: string) => {
    const v = g(k);
    return v !== undefined && /^\d+$/.test(v) ? Number(v) : undefined;
  };
  const sort = g("sort");
  return {
    q: g("q"),
    categoryId: g("categoryId"),
    inStock: g("inStock") === "true" ? true : undefined,
    priceMin: num("priceMin"),
    priceMax: num("priceMax"),
    sort: SORTS.find((s) => s.id === sort)?.id,
    after: g("after"),
    limit: PAGE_SIZE,
  };
}

/** The 0-based position of the page's first hit, carried for the "1-24 of N" header only. */
export function offsetFromUrl(url: URL): number {
  const v = url.searchParams.get("from") ?? "";
  return /^\d{1,6}$/.test(v) ? Number(v) : 0;
}

type Overrides = Partial<Record<keyof SearchParams | "from", string | number | boolean | undefined>>;

/** A /search link that keeps the current filters, applies the overrides and starts a new page unless told otherwise. */
export function searchHref(p: SearchParams, overrides: Overrides = {}): string {
  const base: Overrides = { q: p.q, categoryId: p.categoryId, inStock: p.inStock, priceMin: p.priceMin, priceMax: p.priceMax, sort: p.sort };
  const merged = { ...base, ...overrides };
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(merged)) if (v !== undefined && v !== "" && v !== false) sp.set(k, String(v));
  const s = sp.toString();
  return s ? `/search?${s}` : "/search";
}
