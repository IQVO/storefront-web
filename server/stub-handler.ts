import type { IncomingMessage, ServerResponse } from "node:http";
import { cartRoutes, productRoutes, problem, readBody, readState, stateCookie, type Ctx } from "./stub.ts";
import { accountRoutes, checkoutRoutes, orderRoutes } from "./stub-commerce.ts";
import { newStore } from "./stub-state.ts";

const BASE = "/api/storefront";

/** The origin the browser used, so stub media URLs are absolute on this host like live product content. */
function originOf(req: IncomingMessage): string {
  const host = /^[A-Za-z0-9.:[\]-]+$/.test(req.headers.host ?? "") ? req.headers.host : "127.0.0.1";
  return `http://${host}`;
}

/** Returns a request handler; it answers true when the request was for the stub, false otherwise. */
export function createStubHandler(): (req: IncomingMessage, res: ServerResponse) => Promise<boolean> {
  const store = newStore();
  return async (req, res) => {
    const url = new URL(req.url ?? "/", "http://stub.local");
    if (url.pathname !== BASE && !url.pathname.startsWith(`${BASE}/`)) return false;
    const path = url.pathname.slice(BASE.length) || "/";
    const state = readState(req);
    const ctx: Ctx = { store, method: req.method ?? "GET", path, url, origin: originOf(req), body: await readBody(req), state, setState: {} };
    const key = req.headers["idempotency-key"];
    const keyed = ctx.method === "POST" || ctx.method === "PATCH";
    const keyProblem = !keyed ? null : typeof key !== "string" || key === "" ? problem(400, "idempotency-key-required", "Idempotency-Key header is required") : /^[\x20-\x7e]{1,128}$/.test(key) ? null : problem(400, "idempotency-key-invalid", "Idempotency-Key must be 1-128 printable ASCII characters");
    const reply = keyProblem ?? productRoutes(ctx) ?? cartRoutes(ctx) ?? checkoutRoutes(ctx) ?? orderRoutes(ctx) ?? accountRoutes(ctx) ?? problem(404, "resource-not-found", "Resource not found");
    const headers: Record<string, string | string[]> = { "Content-Type": reply.type ?? "application/json", "Cache-Control": "no-store" };
    if (Object.keys(ctx.setState).length > 0) headers["Set-Cookie"] = stateCookie({ ...state, ...ctx.setState });
    res.writeHead(reply.status, headers);
    res.end(JSON.stringify(reply.body ?? null));
    return true;
  };
}
