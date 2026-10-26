import { createServer } from "node:http";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { createRequestListener } from "@react-router/node";
import { proxyToBff } from "./proxy.ts";
import { serveStatic } from "./static.ts";
import { createStubHandler } from "./stub-handler.ts";

const root = resolve(import.meta.dirname, "..", "build");
const port = Number(process.env["PORT"] ?? 3000);
const bff = process.env["BFF_URL"] ?? "http://127.0.0.1:8080";
const useStub = process.env["STOREFRONT_STUB"] === "1";

const build = (await import(pathToFileURL(resolve(root, "server", "index.js")).href)) as Parameters<typeof createRequestListener>[0]["build"];
const ssr = createRequestListener({ build, mode: "production" });
const stub = useStub ? createStubHandler() : null;

if (useStub) {
  // The SSR loaders reach the BFF over loopback; with the stub that is this very process.
  process.env["BFF_URL"] = `http://127.0.0.1:${port}`;
}

const server = createServer((req, res) => {
  void (async () => {
    const path = new URL(req.url ?? "/", "http://local").pathname;
    if (path === "/healthz" || path === "/readyz") {
      res.writeHead(200, { "Content-Type": "text/plain" });
      return void res.end("ok");
    }
    if (path === "/api/storefront" || path.startsWith("/api/storefront/")) {
      if (stub && (await stub(req, res))) return;
      return proxyToBff(bff, req, res);
    }
    if (serveStatic(resolve(root, "client"), req, res)) return;
    ssr(req, res);
  })().catch(() => {
    if (!res.headersSent) res.writeHead(500);
    res.end();
  });
});

server.listen(port, () => {
  console.log(`storefront-web listening on :${port} (${useStub ? "stub BFF" : `BFF ${bff}`})`);
});

for (const sig of ["SIGTERM", "SIGINT"] as const) process.on(sig, () => server.close(() => process.exit(0)));
