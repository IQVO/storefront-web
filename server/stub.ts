import type { IncomingMessage } from "node:http";
import { PRODUCTS, byId } from "./fixtures.ts";
import { cartView, nextId, type Store, type StubCart } from "./stub-state.ts";

// A stateful stand-in for the storefront BFF (/api/storefront): the same routes, status codes,
// problem+json shapes and sf_state cookie semantics as storefront-bff's openapi.yaml, backed by
// in-memory synthetic data. Used by CI (Lighthouse, Playwright) and `npm run start:stub`.
const BASE = "/api/storefront";
interface Ctx { store: Store; method: string; path: string; url: URL; body: Record<string, unknown>; state: State; setState: Partial<State> }
interface State { c?: string; s?: string; k?: string }
interface Reply { status: number; body?: unknown; type?: string }

const ok = (body: unknown, status = 200): Reply => ({ status, body });
const problem = (status: number, slug: string, title: string): Reply => ({ status, type: "application/problem+json", body: { type: `/problems/${slug}`, title, status } });

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

function cartOf(ctx: Ctx, id: string): StubCart | undefined {
  return ctx.store.carts.get(id);
}

function productRoutes(ctx: Ctx): Reply | null {
  const { method, path, url, body } = ctx;
  if (method === "GET" && path === "/products") {
    const q = (url.searchParams.get("q") ?? "").toLowerCase();
    const cat = url.searchParams.get("categoryId");
    const stock = url.searchParams.get("inStock") === "true";
    const sort = url.searchParams.get("sort");
    let hits = PRODUCTS.filter((p) => (!q || p.title.toLowerCase().includes(q)) && (!cat || p.category === cat) && (!stock || p.inStock));
    if (sort === "price-asc") hits = [...hits].sort((a, b) => a.priceMinor - b.priceMinor);
    if (sort === "price-desc") hits = [...hits].sort((a, b) => b.priceMinor - a.priceMinor);
    if (sort === "title") hits = [...hits].sort((a, b) => a.title.localeCompare(b.title));
    const counts = new Map<string, number>();
    for (const p of PRODUCTS) counts.set(p.category, (counts.get(p.category) ?? 0) + 1);
    return ok({
      hits: hits.map((p) => ({
        catalogItemId: p.id, title: p.title, effectivePrice: { amountMinor: p.priceMinor, currency: "USD" },
        primaryMedia: { mediaId: `m-${p.id}`, url: `${BASE}/stub-media/${p.id}.svg`, altText: p.title, role: "primary" },
        categoryPath: [p.category], inStock: p.inStock, purchasable: p.inStock,
      })),
      facets: [{ name: "category", values: [...counts].map(([value, count]) => ({ value, count })) }],
      next: null,
    });
  }
  const dd = /^\/products\/([^/:]+):delivery-dates$/.exec(path);
  if (method === "POST" && dd) {
    const postal = str(body["postalPrefix"]).trim();
    if (!postal) return problem(422, "validation-failed", "postalPrefix is required");
    return ok({ postalPrefix: postal, unavailable: [], tiers: [
      { tier: "NEXT_DAY", deliverByEarliest: "2030-01-05T00:00:00Z", deliverByLatest: "2030-01-05T23:59:00Z", charge: { amountMinor: 999, currency: "USD" } },
      { tier: "STANDARD", deliverByEarliest: "2030-01-10T00:00:00Z", deliverByLatest: "2030-01-12T23:59:00Z", charge: { amountMinor: 0, currency: "USD" } },
    ] });
  }
  const one = /^\/products\/([^/:]+)$/.exec(path);
  if (method === "GET" && one) {
    const p = byId(decodeURIComponent(one[1] ?? ""));
    if (!p) return problem(404, "not-found", "Product not found");
    return ok({
      catalogItemId: p.id, title: p.title, description: p.description, bullets: ["Synthetic product", "Illustrative data only"],
      attributes: [{ name: "Category", value: p.category }],
      media: [{ mediaId: `m-${p.id}`, url: `${BASE}/stub-media/${p.id}.svg`, altText: p.title, role: "primary" }],
      categoryPath: [p.category], listPrice: { amountMinor: Math.round(p.priceMinor * 1.1), currency: "USD" },
      effectivePrice: { amountMinor: p.priceMinor, currency: "USD" }, inStock: p.inStock, purchasable: p.inStock,
    });
  }
  return null;
}

function cartRoutes(ctx: Ctx): Reply | null {
  const { store, method, path, body, state } = ctx;
  const view = (c: StubCart) => cartView(store, c, byId);
  if (path === "/carts" && method === "POST") {
    const c: StubCart = { cartId: nextId(store, "cart"), shopperId: state.s ?? null, state: "OPEN", lines: [], destinationPostalPrefix: null, quoted: false, selections: [], version: 1 };
    store.carts.set(c.cartId, c);
    ctx.setState.c = c.cartId;
    return ok(view(c), 201);
  }
  if (path === "/carts" && method === "GET") {
    const mine = [...store.carts.values()].filter((c) => state.s && c.shopperId === state.s && c.state === (ctx.url.searchParams.get("state") ?? "OPEN"));
    if (!state.s) return problem(422, "session-required", "A shopper is required");
    return ok({ items: mine.map(view) });
  }
  const m = /^\/carts\/([^/:]+)(.*)$/.exec(path);
  if (!m) return null;
  const cart = cartOf(ctx, decodeURIComponent(m[1] ?? ""));
  if (!cart) return problem(404, "not-found", "Cart not found");
  const rest = m[2] ?? "";
  if (rest === "" && method === "GET") return ok(view(cart));
  const touch = () => { cart.version += 1; cart.quoted = false; cart.selections = []; return ok(view(cart)); };
  if (rest === "/lines" && method === "POST") {
    const id = str(body["catalogItemId"]);
    const qty = Number(body["quantity"]);
    if (!byId(id) || !(qty >= 1 && qty <= 99)) return problem(422, "validation-failed", "Invalid line");
    const line = cart.lines.find((l) => l.catalogItemId === id);
    if (line) line.quantity = Math.min(99, line.quantity + qty); else cart.lines.push({ catalogItemId: id, quantity: qty });
    return touch();
  }
  const li = /^\/lines\/([^/:]+)$/.exec(rest);
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
  if (rest === "/destination" && method === "POST") {
    const p = str(body["postalPrefix"]);
    if (!p) return problem(422, "validation-failed", "postalPrefix is required");
    cart.destinationPostalPrefix = p;
    return touch();
  }
  if (rest === "/delivery:quote" && method === "POST") {
    if (!cart.destinationPostalPrefix) return problem(409, "destination-required", "Set a destination first");
    cart.quoted = true; cart.version += 1;
    return ok(view(cart));
  }
  if (rest === "/delivery:select" && method === "POST") {
    cart.selections = [{ groupNo: Number(body["groupNo"]), offerId: str(body["offerId"]) }];
    cart.version += 1;
    return ok(view(cart));
  }
  return null;
}

export { readState, stateCookie, readBody, problem, ok, str, looksLikeCard, productRoutes, cartRoutes };
export type { Ctx, Reply, State };
