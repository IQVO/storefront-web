// @vitest-environment node
import { createServer, type Server } from "node:http";
import { connect } from "node:net";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { proxyToBff } from "./proxy.ts";

// A recorder BFF: captures what the proxy actually sent upstream and echoes a body back.
let bff: Server;
let proxy: Server;
let bffBase = "";
let proxyBase = "";
const seen: { method: string; url: string; host: string; body: string }[] = [];

beforeAll(async () => {
  bff = createServer((r, s) => {
    const chunks: Buffer[] = [];
    r.on("data", (c) => chunks.push(c as Buffer));
    r.on("end", () => {
      seen.push({ method: r.method ?? "", url: r.url ?? "", host: r.headers["host"] ?? "", body: Buffer.concat(chunks).toString() });
      s.writeHead(200, { "Content-Type": "application/json" });
      s.end('{"ok":true}');
    });
  });
  await new Promise<void>((resolve) => bff.listen(0, "127.0.0.1", resolve));
  bffBase = `http://127.0.0.1:${(bff.address() as AddressInfo).port}`;
  proxy = createServer((req, res) => proxyToBff(bffBase, req, res));
  await new Promise<void>((resolve) => proxy.listen(0, "127.0.0.1", resolve));
  proxyBase = `http://127.0.0.1:${(proxy.address() as AddressInfo).port}`;
});
afterAll(async () => {
  await new Promise<void>((resolve) => proxy.close(() => resolve()));
  await new Promise<void>((resolve) => bff.close(() => resolve()));
});

// Speaks raw HTTP so we can send request targets a browser would never produce.
function raw(target: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const sock = connect((proxy.address() as AddressInfo).port, "127.0.0.1");
    let data = "";
    sock.on("connect", () => sock.write(`GET ${target} HTTP/1.1\r\nHost: storefront.localhost\r\nConnection: close\r\n\r\n`));
    sock.on("data", (c) => (data += c.toString()));
    sock.on("error", reject);
    sock.on("close", () => resolve(data));
    sock.setTimeout(5_000, () => { sock.destroy(); resolve(data); });
  });
}

describe("proxyToBff", () => {
  it("forwards method, path and query to the BFF origin and pins the upstream Host", async () => {
    const r = await fetch(`${proxyBase}/api/storefront/carts?state=OPEN`, { headers: { "Content-Type": "application/json" } });
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ ok: true });
    expect(seen.at(-1)).toMatchObject({ method: "GET", url: "/api/storefront/carts?state=OPEN", host: new URL(bffBase).host });
  });

  it("pipes request bodies upstream", async () => {
    const r = await fetch(`${proxyBase}/api/storefront/carts`, { method: "POST", body: '{"sku":"sku-1"}' });
    expect(r.status).toBe(200);
    expect(seen.at(-1)).toMatchObject({ method: "POST", url: "/api/storefront/carts", body: '{"sku":"sku-1"}' });
  });

  it("rejects an absolute-form request target instead of following it", async () => {
    const before = seen.length;
    const res = await raw("http://attacker.example/api/storefront/carts");
    expect(res).toMatch(/HTTP\/1\.1 400/);
    expect(res).toContain("/problems/invalid-request-target");
    expect(seen.length).toBe(before);
  });

  it("rejects a protocol-relative request target instead of following it", async () => {
    const before = seen.length;
    const res = await raw("//attacker.example/api/storefront/carts");
    expect(res).toMatch(/HTTP\/1\.1 400/);
    expect(res).toContain("/problems/invalid-request-target");
    expect(seen.length).toBe(before);
  });

  it("reports an unreachable upstream as 503 problem+json", async () => {
    const dead = createServer((req, res) => proxyToBff("http://127.0.0.1:1", req, res));
    await new Promise<void>((resolve) => dead.listen(0, "127.0.0.1", resolve));
    const base = `http://127.0.0.1:${(dead.address() as AddressInfo).port}`;
    const r = await fetch(`${base}/api/storefront/cats`);
    expect(r.status).toBe(503);
    expect(r.headers.get("content-type")).toBe("application/problem+json");
    expect(await r.json()).toMatchObject({ type: "/problems/upstream-unavailable", status: 503 });
    await new Promise<void>((resolve) => dead.close(() => resolve()));
  });
});
