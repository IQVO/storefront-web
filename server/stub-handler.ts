import type { IncomingMessage, ServerResponse } from "node:http";
import { PRODUCTS, mediaSvg } from "./fixtures.ts";
import { cartRoutes, productRoutes, problem, readBody, readState, stateCookie, type Ctx } from "./stub.ts";
import { accountRoutes, checkoutRoutes, orderRoutes } from "./stub-commerce.ts";
import { newStore } from "./stub-state.ts";

const BASE = "/api/storefront";

/** Returns a request handler; it answers true when the request was for the stub, false otherwise. */
export function createStubHandler(): (req: IncomingMessage, res: ServerResponse) => Promise<boolean> {
  const store = newStore();
  return async (req, res) => {
    const url = new URL(req.url ?? "/", "http://stub.local");
    if (url.pathname !== BASE && !url.pathname.startsWith(`${BASE}/`)) return false;
    const path = url.pathname.slice(BASE.length) || "/";
    const media = /^\/stub-media\/([^/]+)\.svg$/.exec(path);
    if (media) {
      const p = PRODUCTS.find((x) => x.id === media[1]);
      res.writeHead(p ? 200 : 404, { "Content-Type": "image/svg+xml", "Cache-Control": "public, max-age=3600" });
      res.end(p ? mediaSvg(p) : "");
      return true;
    }
    const state = readState(req);
    const ctx: Ctx = { store, method: req.method ?? "GET", path, url, body: await readBody(req), state, setState: {} };
    const reply = productRoutes(ctx) ?? cartRoutes(ctx) ?? checkoutRoutes(ctx) ?? orderRoutes(ctx) ?? accountRoutes(ctx) ?? problem(404, "not-found", "No such route");
    const headers: Record<string, string | string[]> = { "Content-Type": reply.type ?? "application/json", "Cache-Control": "no-store" };
    if (Object.keys(ctx.setState).length > 0) headers["Set-Cookie"] = stateCookie({ ...state, ...ctx.setState });
    res.writeHead(reply.status, headers);
    res.end(JSON.stringify(reply.body ?? null));
    return true;
  };
}
