import { expect, test } from "@playwright/test";

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
  for (const path of ["/", "/search?q=mug", "/products/item-kettle", "/cart", "/account", "/orders"]) {
    await page.goto(path);
    await page.waitForLoadState("networkidle");
  }
  expect(violations).toEqual([]);
});

test("an in-doubt payment settles on the confirmation page", async ({ page }) => {
  const email = `doubt-${Date.now()}@example.test`;
  await page.goto("/products/item-mug");
  await page.getByRole("button", { name: "Add to cart" }).click();
  await expect(page.getByText("Added to your cart")).toBeVisible();
  await page.goto("/cart");
  await page.getByLabel("Postal code").fill("10001");
  await page.getByRole("button", { name: "Set destination" }).click();
  await page.getByRole("button", { name: "Get delivery options" }).click();
  await page.getByRole("button", { name: "Choose" }).first().click();
  await page.goto("/account");
  const reg = page.locator("form", { has: page.getByRole("heading", { name: "Register" }) });
  await reg.getByLabel("E-mail").fill(email);
  await reg.getByLabel("Name").fill("Sample Shopper");
  await reg.getByLabel("Address", { exact: true }).fill("2 Example Street");
  await reg.getByLabel("City").fill("Exampleton");
  await reg.getByLabel("Region").fill("EX");
  await reg.getByLabel("Postal code").fill("10001");
  await reg.getByLabel("Country (2 letters)").fill("US");
  await reg.getByRole("button", { name: "Register" }).click();
  await expect(page.getByText(email)).toBeVisible();
  await page.goto("/checkout");
  await page.getByRole("button", { name: "Review order" }).click();
  await page.getByLabel(/Time out/).check();
  await page.getByRole("button", { name: "Place order" }).click();
  await expect(page.getByRole("heading", { name: /placing your order/ })).toBeVisible();
  await expect(page.getByRole("heading", { name: /your order is placed/ })).toBeVisible({ timeout: 15_000 });
});
