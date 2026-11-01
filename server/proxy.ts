import { request as httpRequest, type IncomingMessage, type ServerResponse } from "node:http";
import { request as httpsRequest } from "node:https";

const HOP = new Set(["connection", "keep-alive", "transfer-encoding", "upgrade", "proxy-connection", "te", "trailer", "host"]);

// Requests are parsed against this throwaway origin: a request target that carries its own
// authority (absolute-form "http://host/x" or protocol-relative "//host/x") resolves to a
// different host than a plain root-relative path, which is how we detect it.
const PARSE_ORIGIN = "http://request.target.invalid";

function rejectTarget(res: ServerResponse): void {
  res.writeHead(400, { "Content-Type": "application/problem+json" });
  res.end(JSON.stringify({ type: "/problems/invalid-request-target", title: "Invalid request target", status: 400 }));
}

/**
 * Local/dev reverse proxy for /api/storefront to the BFF (BFF_URL). In the cluster the gateway
 * routes that prefix itself; this keeps `npm start` single-origin so the sf_state cookie flows.
 *
 * The upstream origin is pinned to `bffUrl`: scheme, host and port of the outgoing request come
 * from that trusted setting alone, and only the path and query of the incoming request are
 * forwarded. A request target with its own authority is rejected with 400 rather than followed,
 * so the proxy cannot be pointed at an arbitrary host (SSRF).
 */
export function proxyToBff(bffUrl: string, req: IncomingMessage, res: ServerResponse): void {
  let incoming: URL;
  try {
    incoming = new URL(req.url ?? "/", PARSE_ORIGIN);
  } catch {
    return rejectTarget(res);
  }
  if (incoming.host !== new URL(PARSE_ORIGIN).host) return rejectTarget(res);

  const base = new URL(bffUrl);
  const headers = Object.fromEntries(Object.entries(req.headers).filter(([k]) => !HOP.has(k)));
  const doRequest = base.protocol === "https:" ? httpsRequest : httpRequest;
  const up = doRequest(base, { method: req.method, path: `${incoming.pathname}${incoming.search}`, headers }, (r) => {
    const out = Object.fromEntries(Object.entries(r.headers).filter(([k]) => !HOP.has(k)));
    res.writeHead(r.statusCode ?? 502, out);
    r.pipe(res);
  });
  up.setTimeout(20_000, () => up.destroy(new Error("upstream timeout")));
  up.on("error", () => {
    if (!res.headersSent) {
      res.writeHead(503, { "Content-Type": "application/problem+json" });
      res.end(JSON.stringify({ type: "/problems/upstream-unavailable", title: "The store is temporarily unavailable", status: 503 }));
    } else res.destroy();
  });
  req.pipe(up);
}
