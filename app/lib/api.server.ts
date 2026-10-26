import type { CallOptions } from "./api.ts";

/**
 * Server-side BFF access for the SSR loaders. BFF_URL is read at runtime on the Node
 * server only and never reaches the client bundle (*.server.ts modules are excluded
 * from it by React Router; the no-network-url-in-bundle job proves it).
 */
export function serverBase(): string {
  const origin = process.env["BFF_URL"] ?? "http://127.0.0.1:8080";
  return `${origin.replace(/\/$/, "")}/api/storefront`;
}

/** Options that point a lib/queries.ts call at the BFF from the server, forwarding the cookie. */
export function serverOpts(request: Request): CallOptions {
  const cookie = request.headers.get("cookie");
  return { base: serverBase(), ...(cookie ? { cookie } : {}), signal: request.signal };
}
