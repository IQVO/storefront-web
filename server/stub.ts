import type { IncomingMessage } from "node:http";
import { CATEGORIES, PRODUCTS, byId, categoryById, namePath, subtree, type StubProduct } from "./fixtures.ts";
import { isServed, notServed, productTiers } from "./stub-delivery.ts";
import { cartView, nextId, type Store, type StubCart } from "./stub-state.ts";

// A stateful stand-in for the storefront BFF (/api/storefront): the same routes, status codes,
// problem+json shapes and sf_state cookie semantics as storefront-bff's openapi.yaml, backed by
// in-memory synthetic data. It enforces the upstream contracts the BFF relays unchanged (strict
// request decoders, 3-character destination prefixes, session-required) so the web cannot drift
// from them unnoticed. Used by CI (Lighthouse, Playwright) and `npm run start:stub`.
const BASE = "/api/storefront";
interface Ctx { store: Store; method: string; path: string; url: URL; origin: string; body: Record<string, unknown>; state: State; setState: Partial<State> }
interface State { c?: string; s?: string; k?: string }
interface Reply { status: number; body?: unknown; type?: string }

const ok = (body: unknown, status = 200): Reply => ({ status, body });
const problem = (status: number, slug: string, title: string, detail?: string): Reply => ({
  status, type: "application/problem+json", body: { type: `/problems/${slug}`, title, status, ...(detail ? { detail } : {}) },
});

function readState(req: IncomingMessage): State {
  const m = /(?:^|;\s*)sf_state=([^;]*)/.exec(req.headers.cookie ?? "");
  const v = new URLSearchParams(decodeURIComponent(m?.[1] ?? ""));
  const pick = (k: string) => v.get(k) ?? undefined;
  const out: State = {};
  for (const k of ["c", "s", "k"] as const) { const x = pick(k); if (x) out[k] = x; }
  return out;
}

function stateCookie(state: State): string {
  const v = new URLSearchParams();
  for (const k of ["c", "s", "k"] as const) if (state[k]) v.set(k, state[k]);
  return `sf_state=${encodeURIComponent(v.toString())}; Path=${BASE}; HttpOnly; SameSite=Lax; Max-Age=2592000`;
}

async function readBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  for await (const c of req) chunks.push(c as Buffer);
  if (chunks.length === 0) return {};
  try { return JSON.parse(Buffer.concat(chunks).toString("utf8")) as Record<string, unknown>; } catch { return {}; }
}

const str = (v: unknown): string => (typeof v === "string" ? v : "");
const looksLikeCard = (s: string) => /\d{12,}/.test(s.replace(/[\s-]/g, ""));

/** A strict decoder like the upstream Go services (DisallowUnknownFields): 400 malformed-request on an unknown field. */
function unknownField(body: Record<string, unknown>, allowed: string[]): Reply | null {
  const extra = Object.keys(body).find((k) => !allowed.includes(k));
  return extra ? problem(400, "malformed-request", "Malformed request", `json: unknown field "${extra}"`) : null;
}

/** Department illustration URL as live product content carries it: absolute, on the storefront host. */
const mediaFor = (ctx: Ctx, p: StubProduct) => {
  const slug = categoryById(p.category)?.slug ?? "kitchen-dining";
  return { mediaId: `m-${p.id}`, url: `${ctx.origin}/media/departments/${slug}.svg`, altText: p.title, role: "PRIMARY" };
};

const BAND_EDGES = [2500, 5000, 10000, 25000];
function bandOf(price: number): string {
  let lower = 0;
  for (const e of BAND_EDGES) {
    if (price < e) return lower === 0 ? `<${e}` : `${lower}-${e - 1}`;
    lower = e;
  }
  return `${lower}+`;
}

function purchasableCount(id: string): number {
  const ids = subtree(id);
  return PRODUCTS.filter((p) => p.inStock && ids.has(p.category)).length;
}

function productRoutes(ctx: Ctx): Reply | null {
  const { method, path, url, body } = ctx;
  if (method === "GET" && path === "/categories") {
    return ok({ version: 1, categories: CATEGORIES.map((c) => ({ categoryId: c.categoryId, ...(c.parentId ? { parentId: c.parentId } : {}), name: c.name, path: c.path, purchasableCount: purchasableCount(c.categoryId) })) });
  }
  if (method === "GET" && path === "/products") {
    const q = (url.searchParams.get("q") ?? "").toLowerCase();
    const cat = url.searchParams.get("categoryId");
    const within = cat ? subtree(cat) : null;
    const stock = url.searchParams.get("inStock") === "true";
    const min = Number(url.searchParams.get("priceMin") ?? "0");
    const max = Number(url.searchParams.get("priceMax") ?? String(Number.MAX_SAFE_INTEGER));
    const limit = Math.min(100, Number(url.searchParams.get("limit") ?? "24") || 24);
    const sort = url.searchParams.get("sort");
    let hits = PRODUCTS.filter((p) => (!q || p.title.toLowerCase().includes(q)) && (!within || within.has(p.category)) && (!stock || p.inStock) && p.priceMinor >= min && p.priceMinor <= max);
    if (sort === "price-asc") hits = [...hits].sort((a, b) => a.priceMinor - b.priceMinor);
    if (sort === "price-desc") hits = [...hits].sort((a, b) => b.priceMinor - a.priceMinor);
    if (sort === "title") hits = [...hits].sort((a, b) => a.title.localeCompare(b.title));
    const tally = (key: (p: StubProduct) => string) => {
      const m = new Map<string, number>();
      for (const p of hits) m.set(key(p), (m.get(key(p)) ?? 0) + 1);
      return [...m].map(([value, count]) => ({ value, count }));
    };
    return ok({
      items: hits.slice(0, limit).map((p) => ({
        catalogItemId: p.id, title: p.title, effectivePrice: { amountMinor: p.priceMinor, currency: "USD" },
        primaryMedia: mediaFor(ctx, p), categoryId: p.category, categoryPath: namePath(p.category), inStock: p.inStock, purchasable: p.inStock,
      })),
      facets: [
        { name: "category", values: tally((p) => p.category).sort((a, b) => b.count - a.count || a.value.localeCompare(b.value)) },
        { name: "price-band", values: tally((p) => bandOf(p.priceMinor)).sort((a, b) => Number(a.value.replace(/\D.*/, "")) - Number(b.value.replace(/\D.*/, ""))) },
        { name: "in-stock", values: tally((p) => String(p.inStock)).sort((a, b) => Number(b.value === "true") - Number(a.value === "true")) },
      ],
    });
  }
  const dd = /^\/products\/([^/]+)\/delivery-date-quotes$/.exec(path);
  if (method === "POST" && dd) {
    const bad = unknownField(body, ["postalPrefix"]);
    if (bad) return bad;
    const postal = str(body["postalPrefix"]).trim();
    if (!postal || postal.length > 10) return problem(422, "validation-failed", "postalPrefix must be 1 to 10 characters");
    if (!byId(decodeURIComponent(dd[1] ?? ""))) return problem(404, "not-found", "Product not found");
    if (!isServed(postal)) return ok({ postalPrefix: postal, tiers: [], unavailable: notServed() });
    return ok({ postalPrefix: postal, tiers: productTiers(Date.now()), unavailable: [{ tier: "SAME_DAY", constraint: "PAST_ORDER_DEADLINE" }] });
  }
  const one = /^\/products\/([^/]+)$/.exec(path);
  if (method === "GET" && one) {
    const p = byId(decodeURIComponent(one[1] ?? ""));
    if (!p) return problem(404, "not-found", "Product not found");
    const names = namePath(p.category);
    return ok({
      catalogItemId: p.id, title: p.title, description: p.description,
      bullets: [`${p.title}: ${p.description}`, "Ships from and sold by the storefront", "Synthetic product with illustrative data"],
      attributes: [{ name: "Department", value: names[0] ?? "" }, { name: "Category", value: names.at(-1) ?? "" }, { name: "Item model number", value: p.id }],
      media: [mediaFor(ctx, p)],
      categoryId: p.category, categoryPath: names, listPrice: { amountMinor: Math.round(p.priceMinor * 1.1), currency: "USD" },
      effectivePrice: { amountMinor: p.priceMinor, currency: "USD" }, inStock: p.inStock, purchasable: p.inStock,
    });
  }
  return null;
}

function cartRoutes(ctx: Ctx): Reply | null {
  const { store, method, path, body, state } = ctx;
  const view = (c: StubCart) => cartView(c, byId);
  if (path === "/carts" && method === "POST") {
    const c: StubCart = { cartId: nextId(store, "cart"), shopperId: state.s ?? null, state: "OPEN", lines: [], destinationPostalPrefix: null, quotedAt: null, served: false, selections: [], version: 1 };
    store.carts.set(c.cartId, c);
    ctx.setState.c = c.cartId;
    return ok(view(c), 201);
  }
  if (path === "/carts" && method === "GET") {
    if (!state.s) return problem(422, "session-required", "A shopper is required");
    const mine = [...store.carts.values()].filter((c) => c.shopperId === state.s && c.state === (ctx.url.searchParams.get("state") ?? "OPEN"));
    return ok({ items: mine.map(view) });
  }
  const m = /^\/carts\/([^/]+)(.*)$/.exec(path);
  if (!m) return null;
  const cart = store.carts.get(decodeURIComponent(m[1] ?? ""));
  if (!cart) return problem(404, "not-found", "Cart not found");
  const rest = m[2] ?? "";
  if (rest === "" && method === "GET") return ok(view(cart));
  if (cart.state !== "OPEN" && method !== "GET") return problem(409, "cart-closed", "The cart is closed");
  const touch = () => { cart.version += 1; cart.quotedAt = null; cart.selections = []; return ok(view(cart)); };
  if (rest === "/lines" && method === "POST") {
    const id = str(body["catalogItemId"]);
    const qty = Number(body["quantity"]);
    if (!byId(id) || !(qty >= 1 && qty <= 99)) return problem(422, "validation-failed", "Invalid line");
    if (state.s && !cart.shopperId) cart.shopperId = state.s;
    const line = cart.lines.find((l) => l.catalogItemId === id);
    if (line) line.quantity = Math.min(99, line.quantity + qty); else cart.lines.push({ catalogItemId: id, quantity: qty });
    return touch();
  }
  const li = /^\/lines\/([^/]+)$/.exec(rest);
  if (li && method === "PATCH") {
    const line = cart.lines.find((l) => l.catalogItemId === decodeURIComponent(li[1] ?? ""));
    if (!line) return problem(404, "not-found", "Line not found");
    line.quantity = Math.max(1, Math.min(99, Number(body["quantity"]) || 1));
    return touch();
  }
  if (li && method === "DELETE") {
    cart.lines = cart.lines.filter((l) => l.catalogItemId !== decodeURIComponent(li[1] ?? ""));
    return touch();
  }
  if (rest === "/destination" && method === "PUT") {
    // shopping-cart :set-destination decodes strictly: {destinationPostalPrefix} only.
    const bad = unknownField(body, ["destinationPostalPrefix"]);
    if (bad) return bad;
    const p = str(body["destinationPostalPrefix"]);
    if (!p) return problem(422, "validation-failed", "destinationPostalPrefix is required");
    cart.destinationPostalPrefix = p;
    return touch();
  }
  if (rest === "/delivery-quotes" && method === "POST") {
    if (!cart.destinationPostalPrefix) return problem(422, "no-destination", "Set a destination first");
    cart.quotedAt = Date.now();
    cart.served = isServed(cart.destinationPostalPrefix);
    cart.selections = [];
    cart.version += 1;
    return ok(view(cart));
  }
  if (rest === "/delivery-selection" && method === "PUT") {
    const offerId = str(body["offerId"]);
    const groupNo = Number(body["groupNo"]);
    const offers = view(cart).deliveryQuote?.groups.find((g) => g.groupNo === groupNo)?.offers ?? [];
    if (!offers.some((o) => o.offerId === offerId)) return problem(409, "stale-delivery-selection", "The offer is not part of the current quote");
    cart.selections = [{ groupNo, offerId }];
    cart.version += 1;
    return ok(view(cart));
  }
  return null;
}

export { readState, stateCookie, readBody, problem, ok, str, looksLikeCard, productRoutes, cartRoutes };
export type { Ctx, Reply, State };
