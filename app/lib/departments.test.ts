import { describe, expect, it } from "vitest";
import { breadcrumb, categoryNames, departmentSlug, departments, facetValues, illustrationFor, ILLUSTRATED, mediaSrc, priceBand } from "./departments.ts";
import type { CategoryList, ProductHit } from "./types.ts";

const tree: CategoryList = {
  version: 3,
  categories: [
    { categoryId: "cat-k", name: "Kitchen & Dining", path: "/kitchen", purchasableCount: 4 },
    { categoryId: "cat-k-c", parentId: "cat-k", name: "Cookware", path: "/kitchen/cookware", purchasableCount: 4 },
    { categoryId: "cat-j", parentId: null, name: "Jewelry", path: "/jewelry", purchasableCount: 0 },
  ],
};
const hit = (over: Partial<ProductHit>): ProductHit => ({ catalogItemId: "i", title: "T", inStock: true, purchasable: true, ...over });

describe("departments", () => {
  it("lists top-level departments with something to buy, all of them when no count is known", () => {
    expect(departments(tree).map((d) => d.name)).toEqual(["Kitchen & Dining"]);
    expect(departments({ version: 1, categories: [{ ...tree.categories[2]! }] }).map((d) => d.name)).toEqual(["Jewelry"]);
    expect(departments(null)).toEqual([]);
  });
  it("names categories from the tree and falls back to the hits' category path", () => {
    const names = categoryNames(null, [hit({ categoryId: "cat-80c58ef626f7", categoryPath: ["Jewelry", "Rings"] })]);
    expect(names.get("cat-80c58ef626f7")).toBe("Rings");
    expect(categoryNames(tree, [hit({ categoryId: "cat-k-c", categoryPath: ["Old"] })]).get("cat-k-c")).toBe("Cookware");
  });
  it("reads facets by name", () => {
    expect(facetValues([{ name: "category", values: [{ value: "a", count: 1 }] }], "category")).toHaveLength(1);
    expect(facetValues([], "price-band")).toEqual([]);
  });
  it("builds a linked breadcrumb from the tree, else plain names", () => {
    expect(breadcrumb("cat-k-c", ["x"], tree)).toEqual([{ name: "Kitchen & Dining", id: "cat-k" }, { name: "Cookware", id: "cat-k-c" }]);
    expect(breadcrumb("cat-zz", ["A", "B"], tree)).toEqual([{ name: "A" }, { name: "B" }]);
    expect(breadcrumb(undefined, undefined, null)).toEqual([]);
  });
});

describe("department illustrations", () => {
  it.each([
    ["Kitchen & Dining", "kitchen-dining"],
    ["Patio, Lawn & Garden", "patio-garden"],
    ["Tools & Home Improvement", "tools-home-improvement"],
    ["Home Decor", "home-decor"],
    ["Clothing, Shoes & Bags", "clothing-shoes-bags"],
    ["Toys", null],
  ])("%s -> %s", (name, slug) => expect(departmentSlug(name)).toBe(slug));
  it("points at the shipped files and has exactly the 13 departments", () => {
    expect(illustrationFor("Jewelry")).toBe("/media/departments/jewelry.svg");
    expect(illustrationFor(undefined)).toBeNull();
    expect(ILLUSTRATED).toHaveLength(13);
  });
  it("loads department media from this origin whatever host product content names", () => {
    expect(mediaSrc("http://storefront.localhost/media/departments/bed-bath.svg")).toBe("/media/departments/bed-bath.svg");
    expect(mediaSrc("/api/storefront/other.png")).toBe("/api/storefront/other.png");
  });
});

describe("price bands", () => {
  it("turns product-discovery's band labels into filters", () => {
    expect(priceBand("<2500")).toEqual({ value: "<2500", label: "Under $25", priceMax: 2499 });
    expect(priceBand("2500-4999")).toEqual({ value: "2500-4999", label: "$25 to $50", priceMin: 2500, priceMax: 4999 });
    expect(priceBand("25000+")).toEqual({ value: "25000+", label: "$250 & above", priceMin: 25000 });
    expect(priceBand("cheap")).toBeNull();
  });
});
