import { describe, expect, it } from "vitest";
// @ts-expect-error plain ESM script shared with the CI job
import { scanText } from "./bundle-scan.mjs";

const hits = (text: string): string[] => (scanText(text) as { rule: string }[]).map((v) => v.rule);

describe("no-network-url-in-bundle sensor", () => {
  it("passes the relative BFF base", () => {
    expect(hits('fetch("/api/storefront/products?q=a"); const b="/api/storefront"; x("/api/storefront:")')).toEqual([]);
    expect(hits('xmlns="http://www.w3.org/2000/svg" https://react.dev/errors/418')).toEqual([]);
  });

  // The twin: the sensor must be able to fail.
  it.each([
    ['fetch("/api/orders")', "other-api-route"],
    ['fetch("/api/storefront-admin/x")', "other-api-route"],
    ['const g="/graphql/query"', "other-api-route"],
    ['"http://customer-ordering.retail.svc.cluster.local:8080"', "in-cluster-host"],
    ['"http://127.0.0.1:8080/api/storefront"', "in-cluster-host"],
    ['"product-discovery:8080"', "service-endpoint"],
    ['const u="//shopping-cart.internal:9000"', "service-endpoint"],
    ["process.env.BFF_URL", "backend-env"],
    ['fetch("https://api.elsewhere.example/v1")', "absolute-url"],
  ])("flags %s", (text, rule) => {
    expect(hits(text)).toContain(rule);
  });
});
