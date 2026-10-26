import { request as httpRequest, type IncomingMessage, type ServerResponse } from "node:http";
import { request as httpsRequest } from "node:https";

const HOP = new Set(["connection", "keep-alive", "transfer-encoding", "upgrade", "proxy-connection", "te", "trailer", "host"]);

/**
 * Local/dev reverse proxy for /api/storefront to the BFF (BFF_URL). In the cluster the gateway
 * routes that prefix itself; this keeps `npm start` single-origin so the sf_state cookie flows.
 */
export function proxyToBff(bffUrl: string, req: IncomingMessage, res: ServerResponse): void {
  const target = new URL(req.url ?? "/", bffUrl);
  const headers = Object.fromEntries(Object.entries(req.headers).filter(([k]) => !HOP.has(k)));
  const doRequest = target.protocol === "https:" ? httpsRequest : httpRequest;
  const up = doRequest(target, { method: req.method, headers }, (r) => {
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
