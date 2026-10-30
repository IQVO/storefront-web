// Synthetic catalogue for the stub BFF (CI, Lighthouse and Playwright). Names and figures are illustrative.
// The tree mirrors the live storefront: department (top level) > subcategory, products in a subcategory.

export interface StubCategory {
  categoryId: string;
  parentId: string | null;
  name: string;
  path: string;
  /** The department illustration in public/media/departments. */
  slug: string;
}

export interface StubProduct {
  id: string;
  title: string;
  priceMinor: number;
  /** The product's primary category: a subcategory id. */
  category: string;
  inStock: boolean;
  description: string;
}

const DEPARTMENTS: [slug: string, name: string, subs: string[]][] = [
  ["kitchen-dining", "Kitchen & Dining", ["Small Appliances", "Cookware", "Dinnerware"]],
  ["home-decor", "Home Decor", ["Lighting"]],
  ["bed-bath", "Bed & Bath", ["Blankets & Throws", "Towels"]],
  ["office-products", "Office Products", ["Paper", "Writing"]],
  ["sports-fitness", "Sports & Fitness", ["Hydration", "Yoga"]],
  ["storage-organization", "Storage & Organization", ["Bins"]],
  ["tools-home-improvement", "Tools & Home Improvement", ["Power Tools"]],
  ["patio-garden", "Patio, Lawn & Garden", ["Planters"]],
  ["pet-supplies", "Pet Supplies", ["Beds"]],
  ["electronics", "Electronics", ["Audio"]],
  ["luggage-travel", "Luggage & Travel", ["Backpacks"]],
  ["jewelry", "Jewelry", ["Necklaces"]],
  ["clothing-shoes-bags", "Clothing, Shoes & Bags", ["Bags"]],
];

const kebab = (s: string) => s.toLowerCase().replace(/&/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

export const CATEGORIES: StubCategory[] = DEPARTMENTS.flatMap(([slug, name, subs]) => [
  { categoryId: `cat-${slug}`, parentId: null, name, path: `/${slug}`, slug },
  ...subs.map((s) => ({ categoryId: `cat-${slug}--${kebab(s)}`, parentId: `cat-${slug}`, name: s, path: `/${slug}/${kebab(s)}`, slug })),
]);

const sub = (slug: string, name: string) => `cat-${slug}--${kebab(name)}`;

export const PRODUCTS: StubProduct[] = [
  { id: "item-kettle", title: "Glass Kettle 1.7 L", priceMinor: 3499, category: sub("kitchen-dining", "Small Appliances"), inStock: true, description: "A borosilicate glass kettle with an auto shut-off." },
  { id: "item-pan", title: "Cast Iron Pan 26 cm", priceMinor: 4999, category: sub("kitchen-dining", "Cookware"), inStock: true, description: "Pre-seasoned and oven safe." },
  { id: "item-mug", title: "Stoneware Mug Set (4)", priceMinor: 2199, category: sub("kitchen-dining", "Dinnerware"), inStock: true, description: "Four stackable 350 ml mugs." },
  { id: "item-lamp", title: "Desk Lamp, Warm White", priceMinor: 2599, category: sub("home-decor", "Lighting"), inStock: true, description: "Dimmable LED lamp with a weighted base." },
  { id: "item-throw", title: "Wool Throw Blanket", priceMinor: 6499, category: sub("bed-bath", "Blankets & Throws"), inStock: true, description: "A woven throw in a neutral check." },
  { id: "item-towels", title: "Cotton Bath Towel Set (6)", priceMinor: 3999, category: sub("bed-bath", "Towels"), inStock: true, description: "Six absorbent towels in two sizes." },
  { id: "item-notebook", title: "Dotted Notebook A5", priceMinor: 899, category: sub("office-products", "Paper"), inStock: true, description: "160 pages of 100 gsm paper." },
  { id: "item-pen", title: "Fountain Pen, Matte Black", priceMinor: 1899, category: sub("office-products", "Writing"), inStock: false, description: "Currently out of stock." },
  { id: "item-bottle", title: "Insulated Bottle 750 ml", priceMinor: 2799, category: sub("sports-fitness", "Hydration"), inStock: true, description: "Keeps drinks cold for 24 hours." },
  { id: "item-mat", title: "Exercise Mat 6 mm", priceMinor: 2999, category: sub("sports-fitness", "Yoga"), inStock: true, description: "A cushioned, non-slip mat." },
  { id: "item-bins", title: "Stackable Storage Bins (3)", priceMinor: 3299, category: sub("storage-organization", "Bins"), inStock: true, description: "Three lidded bins that nest when empty." },
  { id: "item-drill", title: "Cordless Drill 18 V", priceMinor: 8999, category: sub("tools-home-improvement", "Power Tools"), inStock: true, description: "Two-speed drill with a spare battery." },
  { id: "item-planter", title: "Ceramic Planter 30 cm", priceMinor: 2499, category: sub("patio-garden", "Planters"), inStock: true, description: "Glazed planter with a drainage hole." },
  { id: "item-petbed", title: "Orthopedic Pet Bed, Medium", priceMinor: 4599, category: sub("pet-supplies", "Beds"), inStock: true, description: "Foam bed with a washable cover." },
  { id: "item-earbuds", title: "Wireless Earbuds", priceMinor: 5999, category: sub("electronics", "Audio"), inStock: true, description: "Six hours of playback per charge." },
  { id: "item-backpack", title: "Travel Backpack 35 L", priceMinor: 7999, category: sub("luggage-travel", "Backpacks"), inStock: true, description: "Carry-on sized with a laptop sleeve." },
  { id: "item-pendant", title: "Silver Pendant Necklace", priceMinor: 12999, category: sub("jewelry", "Necklaces"), inStock: true, description: "Sterling silver on a 45 cm chain." },
  { id: "item-tote", title: "Canvas Tote Bag", priceMinor: 1999, category: sub("clothing-shoes-bags", "Bags"), inStock: true, description: "Heavy canvas with an inner pocket." },
];

export const byId = (id: string): StubProduct | undefined => PRODUCTS.find((p) => p.id === id);
export const categoryById = (id: string): StubCategory | undefined => CATEGORIES.find((c) => c.categoryId === id);

/** The category ids under (and including) a category: product-discovery filters by subtree. */
export function subtree(id: string): Set<string> {
  const out = new Set<string>([id]);
  for (const c of CATEGORIES) if (c.parentId && out.has(c.parentId)) out.add(c.categoryId);
  return out;
}

/** Category names from the root to a category, as product-discovery's categoryPath. */
export function namePath(id: string): string[] {
  const out: string[] = [];
  for (let c = categoryById(id); c; c = c.parentId ? categoryById(c.parentId) : undefined) out.unshift(c.name);
  return out;
}
