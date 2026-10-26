import { expect, test } from "@playwright/test";

// Synthetic shopper data only.
const email = `shopper-${Date.now()}@example.test`;

test("browse -> product -> cart -> checkout -> confirmation", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Featured products" })).toBeVisible();

  await page.getByRole("link", { name: /Glass Kettle/ }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Glass Kettle 1.7 L" })).toBeVisible();

  // Delivery dates arrive after render, from the BFF, on request.
  await page.getByLabel("Postal code").fill("10001");
  await page.getByRole("button", { name: "See delivery dates" }).click();
  await expect(page.getByText("Next day")).toBeVisible();

  await page.getByRole("button", { name: "Add to cart" }).click();
  await expect(page.getByText("Added to your cart")).toBeVisible();

  await page.getByRole("link", { name: /^Cart/ }).click();
  await expect(page.getByRole("heading", { name: "Your cart" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Glass Kettle 1.7 L" })).toBeVisible();

  await page.getByLabel("Postal code").fill("10001");
  await page.getByRole("button", { name: "Set destination" }).click();
  await page.getByRole("button", { name: "Get delivery options" }).click();
  await page.getByRole("button", { name: "Choose" }).first().click();
  await expect(page.getByRole("link", { name: "Proceed to checkout" })).toBeVisible();

  // Checkout needs a shopper: register one (synthetic data).
  await page.goto("/account");
  const register = page.locator("form", { has: page.getByRole("heading", { name: "Register" }) });
  await register.getByLabel("E-mail").fill(email);
  await register.getByLabel("Name").fill("Sample Shopper");
  await register.getByLabel("Address", { exact: true }).fill("1 Example Street");
  await register.getByLabel("City").fill("Exampleton");
  await register.getByLabel("Region").fill("EX");
  await register.getByLabel("Postal code").fill("10001");
  await register.getByLabel("Country (2 letters)").fill("US");
  await register.getByRole("button", { name: "Register" }).click();
  await expect(page.getByText(email)).toBeVisible();

  await page.goto("/checkout");
  await page.getByRole("button", { name: "Review order" }).click();
  await expect(page.getByRole("heading", { name: "Review your order" })).toBeVisible();
  await expect(page.getByLabel(/card number/i)).toHaveCount(0);
  await page.getByRole("button", { name: "Place order" }).click();

  await expect(page.getByRole("heading", { name: /your order is placed/ })).toBeVisible();
  await expect(page.getByTestId("order-id")).toBeVisible();
});

test("a declined payment keeps the shopper on checkout", async ({ page }) => {
  await page.goto("/search?q=Notebook");
  await page.getByRole("link", { name: /Dotted Notebook/ }).click();
  await page.getByRole("button", { name: "Add to cart" }).click();
  await expect(page.getByText("Added to your cart")).toBeVisible();
  await page.goto("/cart");
  await page.getByLabel("Postal code").fill("10001");
  await page.getByRole("button", { name: "Set destination" }).click();
  await page.getByRole("button", { name: "Get delivery options" }).click();
  await page.getByRole("button", { name: "Choose" }).first().click();
  await page.goto("/account");
  await page.getByLabel("E-mail").first().fill(email);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByText(email)).toBeVisible();
  await page.goto("/checkout");
  await page.getByRole("button", { name: "Review order" }).click();
  await page.getByLabel(/Decline/).check();
  await page.getByRole("button", { name: "Place order" }).click();
  await expect(page.getByRole("alert")).toContainText("declined");
  await expect(page.getByRole("heading", { name: "Review your order" })).toBeVisible();
});

test("orders -> detail -> cancel", async ({ page }) => {
  await page.goto("/account");
  await page.getByLabel("E-mail").first().fill(email);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByText(email)).toBeVisible();

  await page.goto("/orders");
  await expect(page.getByRole("heading", { name: "Your orders" })).toBeVisible();
  await page.getByRole("link", { name: /^ord-/ }).first().click();
  await expect(page.getByTestId("order-status")).toHaveText("Placed");
  await expect(page.getByRole("heading", { name: "Tracking" })).toBeVisible();

  await page.getByLabel("Reason").fill("Ordered by mistake");
  await page.getByRole("button", { name: "Cancel order" }).click();
  await expect(page.getByTestId("order-status")).toHaveText("Cancelled");
});

test("search filters by category and the bundle only talks to /api/storefront", async ({ page }) => {
  const calls: string[] = [];
  page.on("request", (r) => {
    const u = new URL(r.url());
    if (u.pathname.startsWith("/api/") || u.pathname.startsWith("/graphql")) calls.push(u.pathname);
  });
  await page.goto("/search?categoryId=stationery");
  await expect(page.getByRole("link", { name: /Dotted Notebook/ })).toBeVisible();
  await expect(page.getByRole("link", { name: /Glass Kettle/ })).toHaveCount(0);
  await page.getByRole("link", { name: /Dotted Notebook/ }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Dotted Notebook A5");
  expect(calls.every((p) => p.startsWith("/api/storefront/"))).toBe(true);
});
