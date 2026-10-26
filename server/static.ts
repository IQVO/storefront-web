import { createReadStream, statSync } from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import { extname, join, normalize, sep } from "node:path";
import { constants, createBrotliCompress, createGzip } from "node:zlib";

const TYPES: Record<string, string> = {
  ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".svg": "image/svg+xml", ".png": "image/png",
  ".ico": "image/x-icon", ".json": "application/json", ".txt": "text/plain; charset=utf-8", ".woff2": "font/woff2", ".map": "application/json",
};
const COMPRESSIBLE = new Set([".js", ".css", ".svg", ".json", ".txt", ".map"]);

/** Serves files from build/client. Fingerprinted /assets are immutable; everything else revalidates. */
export function serveStatic(root: string, req: IncomingMessage, res: ServerResponse): boolean {
  if (req.method !== "GET" && req.method !== "HEAD") return false;
  const pathname = decodeURIComponent(new URL(req.url ?? "/", "http://static.local").pathname);
  const file = normalize(join(root, pathname));
  if (!file.startsWith(root + sep)) return false;
  let size: number;
  try {
    const st = statSync(file);
    if (!st.isFile()) return false;
    size = st.size;
  } catch {
    return false;
  }
  const ext = extname(file);
  const headers: Record<string, string | number> = {
    "Content-Type": TYPES[ext] ?? "application/octet-stream",
    "Cache-Control": pathname.startsWith("/assets/") ? "public, max-age=31536000, immutable" : "public, max-age=300",
    "X-Content-Type-Options": "nosniff",
    Vary: "Accept-Encoding",
  };
  const accept = String(req.headers["accept-encoding"] ?? "");
  const stream = createReadStream(file);
  if (COMPRESSIBLE.has(ext) && size > 1024 && /\bbr\b/.test(accept)) {
    res.writeHead(200, { ...headers, "Content-Encoding": "br" });
    if (req.method === "HEAD") {
      res.end();
      return true;
    }
    stream.pipe(createBrotliCompress({ params: { [constants.BROTLI_PARAM_QUALITY]: 5 } })).pipe(res);
  } else if (COMPRESSIBLE.has(ext) && size > 1024 && /\bgzip\b/.test(accept)) {
    res.writeHead(200, { ...headers, "Content-Encoding": "gzip" });
    if (req.method === "HEAD") {
      res.end();
      return true;
    }
    stream.pipe(createGzip()).pipe(res);
  } else {
    res.writeHead(200, { ...headers, "Content-Length": size });
    if (req.method === "HEAD") {
      res.end();
      return true;
    }
    stream.pipe(res);
  }
  return true;
}
