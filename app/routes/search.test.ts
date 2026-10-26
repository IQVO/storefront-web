import { describe, expect, it } from "vitest";
import { paramsFromUrl } from "./search.tsx";

describe("paramsFromUrl", () => {
  it("reads known filters and caps the page size", () => {
    const p = paramsFromUrl(new URL("http://x.test/search?q=pen&categoryId=stationery&inStock=true&priceMin=100&priceMax=5000&sort=price-asc&after=abc"));
    expect(p).toEqual({ q: "pen", categoryId: "stationery", inStock: true, priceMin: 100, priceMax: 5000, sort: "price-asc", after: "abc", limit: 24 });
  });
  it("drops unknown sorts and non-numeric prices instead of forwarding them", () => {
    const p = paramsFromUrl(new URL("http://x.test/search?sort=evil&priceMin=1e9x&inStock=maybe"));
    expect(p.sort).toBeUndefined();
    expect(p.priceMin).toBeUndefined();
    expect(p.inStock).toBeUndefined();
  });
});
