// Synthetic catalogue for the stub BFF (CI, Lighthouse and Playwright). Names and figures are illustrative.
export interface StubProduct {
  id: string;
  title: string;
  priceMinor: number;
  category: string;
  inStock: boolean;
  description: string;
}

export const PRODUCTS: StubProduct[] = [
  { id: "item-kettle", title: "Glass Kettle 1.7 L", priceMinor: 3499, category: "kitchen", inStock: true, description: "A borosilicate glass kettle with an auto shut-off." },
  { id: "item-pan", title: "Cast Iron Pan 26 cm", priceMinor: 4999, category: "kitchen", inStock: true, description: "Pre-seasoned and oven safe." },
  { id: "item-lamp", title: "Desk Lamp, Warm White", priceMinor: 2599, category: "home", inStock: true, description: "Dimmable LED lamp with a weighted base." },
  { id: "item-mug", title: "Stoneware Mug Set (4)", priceMinor: 2199, category: "kitchen", inStock: true, description: "Four stackable 350 ml mugs." },
  { id: "item-throw", title: "Wool Throw Blanket", priceMinor: 6499, category: "home", inStock: true, description: "A woven throw in a neutral check." },
  { id: "item-notebook", title: "Dotted Notebook A5", priceMinor: 899, category: "stationery", inStock: true, description: "160 pages of 100 gsm paper." },
  { id: "item-pen", title: "Fountain Pen, Matte Black", priceMinor: 1899, category: "stationery", inStock: false, description: "Currently out of stock." },
  { id: "item-bottle", title: "Insulated Bottle 750 ml", priceMinor: 2799, category: "outdoor", inStock: true, description: "Keeps drinks cold for 24 hours." },
];

export const byId = (id: string): StubProduct | undefined => PRODUCTS.find((p) => p.id === id);

export function mediaSvg(p: StubProduct): string {
  const hue = [...p.id].reduce((n, c) => n + c.charCodeAt(0), 0) % 360;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600" viewBox="0 0 800 600"><rect width="800" height="600" fill="hsl(${hue} 35% 85%)"/><text x="400" y="310" font-family="sans-serif" font-size="44" text-anchor="middle" fill="hsl(${hue} 40% 25%)">${p.title.replace(/&/g, "&amp;")}</text></svg>`;
}
