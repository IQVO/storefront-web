import type { Category, CategoryList, Facet, ProductHit } from "./types.ts";

// Department navigation and facet labels from product-discovery's category tree (BFF GET /categories).
// The web may deploy before a BFF that serves the tree: every helper accepts a null list and falls back
// to the category names the search hits carry (categoryPath).

/** Top-level departments with something to buy (all of them when no count is known yet). */
export function departments(list: CategoryList | null | undefined): Category[] {
  const roots = (list?.categories ?? []).filter((c) => !c.parentId);
  const buyable = roots.filter((c) => c.purchasableCount > 0);
  return buyable.length > 0 ? buyable : roots;
}

/** Category id -> name, from the tree and, as a fallback, from the hits' primary category. */
export function categoryNames(list: CategoryList | null | undefined, hits: ProductHit[] = []): Map<string, string> {
  const names = new Map<string, string>();
  for (const h of hits) {
    const last = h.categoryPath?.at(-1);
    if (h.categoryId && last) names.set(h.categoryId, last);
  }
  for (const c of list?.categories ?? []) names.set(c.categoryId, c.name);
  return names;
}

export function facetValues(facets: Facet[], name: string): Facet["values"] {
  return facets.find((f) => f.name === name)?.values ?? [];
}

/** Breadcrumb from a category up the tree (with ids for links), else the category names the item carries. */
export function breadcrumb(categoryId: string | undefined, names: string[] | undefined, list: CategoryList | null | undefined): { name: string; id?: string }[] {
  const byId = new Map((list?.categories ?? []).map((c) => [c.categoryId, c]));
  const out: { name: string; id: string }[] = [];
  for (let c = categoryId ? byId.get(categoryId) : undefined; c && out.length < 8; c = c.parentId ? byId.get(c.parentId) : undefined) {
    out.unshift({ name: c.name, id: c.categoryId });
  }
  return out.length > 0 ? out : (names ?? []).map((name) => ({ name }));
}

// The department illustrations shipped in public/media/departments (the same files live product
// content points at). A department maps to the illustration whose slug words all appear in its name.
export const ILLUSTRATED = [
  "kitchen-dining", "home-decor", "storage-organization", "bed-bath", "office-products", "electronics",
  "tools-home-improvement", "patio-garden", "sports-fitness", "pet-supplies", "jewelry", "clothing-shoes-bags", "luggage-travel",
] as const;

const words = (s: string) => s.toLowerCase().replace(/&/g, " ").split(/[^a-z0-9]+/).filter(Boolean);

export function departmentSlug(name: string): string | null {
  const have = new Set(words(name));
  return ILLUSTRATED.find((slug) => slug.split("-").every((w) => have.has(w))) ?? null;
}

export function illustrationFor(name: string | undefined): string | null {
  const slug = name ? departmentSlug(name) : null;
  return slug ? `/media/departments/${slug}.svg` : null;
}

const SAME_SITE_MEDIA = /\/media\/departments\/[a-z0-9-]+\.svg$/;

/**
 * Product content points department illustrations at the storefront host. They are files this app
 * serves itself, so they load from this origin whatever host the site runs on (CSP img-src 'self').
 */
export function mediaSrc(url: string): string {
  const m = SAME_SITE_MEDIA.exec(url);
  return m ? m[0] : url;
}

export interface PriceBand {
  value: string;
  label: string;
  priceMin?: number;
  priceMax?: number;
}

const dollars = (minor: number) => `$${Math.round(minor / 100)}`;

/** product-discovery's price-band facet values ("<2500", "2500-4999", "25000+", minor units) as filters. */
export function priceBand(value: string): PriceBand | null {
  let m = /^<(\d+)$/.exec(value);
  if (m) return { value, label: `Under ${dollars(Number(m[1]))}`, priceMax: Number(m[1]) - 1 };
  m = /^(\d+)-(\d+)$/.exec(value);
  if (m) return { value, label: `${dollars(Number(m[1]))} to ${dollars(Number(m[2]) + 1)}`, priceMin: Number(m[1]), priceMax: Number(m[2]) };
  m = /^(\d+)\+$/.exec(value);
  if (m) return { value, label: `${dollars(Number(m[1]))} & above`, priceMin: Number(m[1]) };
  return null;
}
