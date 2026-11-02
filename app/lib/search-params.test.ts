import { describe, expect, it } from "vitest";
import { offsetFromUrl, paramsFromUrl, searchHref } from "./search-params.ts";

describe("search params", () => {
  it("reads known filters and caps the page size", () => {
    const p = paramsFromUrl(new URL("http://x.test/search?q=pen&categoryId=cat-office&inStock=true&priceMin=100&priceMax=5000&sort=price-asc&cursor=abc"));
    expect(p).toEqual({ q: "pen", categoryId: "cat-office", inStock: true, priceMin: 100, priceMax: 5000, sort: "price-asc", cursor: "abc", limit: 24 });
  });
  it("drops unknown sorts and non-numeric prices instead of forwarding them", () => {
    const p = paramsFromUrl(new URL("http://x.test/search?sort=evil&priceMin=1e9x&inStock=maybe&categoryId="));
    expect(p.sort).toBeUndefined();
    expect(p.priceMin).toBeUndefined();
    expect(p.inStock).toBeUndefined();
    expect(p.categoryId).toBeUndefined();
  });
  it("reads the display offset", () => {
    expect(offsetFromUrl(new URL("http://x.test/search?from=24"))).toBe(24);
    expect(offsetFromUrl(new URL("http://x.test/search?from=-1"))).toBe(0);
  });
  it("builds links that keep the filters and apply overrides", () => {
    const p = paramsFromUrl(new URL("http://x.test/search?q=mug&inStock=true&cursor=c1"));
    expect(searchHref(p, { categoryId: "cat-k" })).toBe("/search?q=mug&categoryId=cat-k&inStock=true");
    expect(searchHref(p, { inStock: undefined, q: undefined })).toBe("/search");
    expect(searchHref(p, { cursor: "c2", from: 24 })).toBe("/search?q=mug&inStock=true&cursor=c2&from=24");
  });
});
