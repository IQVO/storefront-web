import { expect, test } from "@playwright/test";
import { addToCart, checkout, chooseDelivery, register, seePromise } from "./steps.ts";

test("strict CSP is sent and the pages run without a single violation", async ({ page }) => {
  const violations: string[] = [];
  page.on("console", (m) => {
    if (/content security policy/i.test(m.text())) violations.push(m.text());
  });
  const res = await page.goto("/");
  const csp = res?.headers()["content-security-policy"] ?? "";
  expect(csp).toContain("default-src 'none'");
  expect(csp).toMatch(/script-src 'self' 'nonce-[A-Za-z0-9+/=]+'/);
  expect(csp).not.toContain("unsafe-inline");
  expect(csp).not.toContain("unsafe-eval");
  expect(csp).toContain("frame-ancestors 'none'");
  for (const path of ["/", "/search?q=mug", "/search?categoryId=cat-kitchen-dining", "/products/item-kettle", "/cart", "/account", "/orders"]) {
    await page.goto(path);
    await page.waitForLoadState("networkidle");
  }
  expect(violations).toEqual([]);
});

test("department illustrations are served by this origin", async ({ request }) => {
  const res = await request.get("/media/departments/kitchen-dining.svg");
  expect(res.status()).toBe(200);
  expect(res.headers()["content-type"]).toContain("image/svg+xml");
});

test("an in-doubt payment settles on the confirmation page", async ({ page }) => {
  const email = `doubt-${Date.now()}@example.test`;
  await page.goto("/products/item-mug");
  await seePromise(page, "78701");
  await addToCart(page);
  await page.goto("/cart");
  await chooseDelivery(page, "78701");
  await register(page, email, { name: "Sample Shopper", line1: "2 Example Street", city: "Austin", region: "TX", zip: "78702", country: "US" });
  await checkout(page, /Time out/);
  await expect(page.getByRole("heading", { name: /placing your order/ })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Order placed, thank you!" })).toBeVisible({ timeout: 15_000 });
});
