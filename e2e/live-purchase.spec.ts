import { expect, test } from "@playwright/test";
import { addToCart, checkout, chooseDelivery, register, seePromise } from "./steps.ts";

// A real purchase through the UI against a deployed storefront and the live network (no stub).
// Skipped unless E2E_LIVE=1, so CI never runs it. Run it with:
//   E2E_BASE_URL=http://storefront.localhost E2E_LIVE=1 npx playwright test e2e/live-purchase.spec.ts
// or `npm run e2e:live`. Synthetic shopper data only; the order it places is real in the cluster.
const live = process.env["E2E_LIVE"] === "1";
const query = process.env["E2E_LIVE_QUERY"] ?? "";
const austin = { name: "Live Journey Shopper", line1: "1100 Congress Ave", city: "Austin", region: "TX", zip: "78701", country: "US" };

test.skip(!live, "live purchase runs only with E2E_LIVE=1 against a real storefront");

test("buy a product on the live network and see the same delivery promise from product page to order", async ({ page }) => {
  test.setTimeout(240_000);
  const note = (type: string, description: string) => {
    test.info().annotations.push({ type, description });
    console.log(`[live] ${type}: ${description}`);
  };

  // 1. Search (or browse everything) and open the first purchasable product.
  await page.goto(`/search?${new URLSearchParams({ ...(query ? { q: query } : {}), inStock: "true" }).toString()}`);
  const tiles = page.locator("li.tile").filter({ hasText: "In stock" });
  const found = await tiles.first().isVisible({ timeout: 15_000 }).catch(() => false);
  expect(found, "no purchasable product in /api/storefront/products: is the storefront data provisioned?").toBe(true);
  const title = (await tiles.first().locator(".tile-title").innerText()).trim();
  note("product", title);
  await tiles.first().getByRole("link").click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(title);

  // 2. The network's promise for ZIP 78701 (destination prefix 787).
  const promise = await seePromise(page, austin.zip);
  note("product-promise", (await promise.innerText()).replace(/\s+/g, " "));
  const fastest = page.getByTestId("promise-fastest");
  if (await fastest.isVisible().catch(() => false)) note("product-fastest", (await fastest.innerText()).replace(/\s+/g, " "));

  // 3. Add to cart, register a synthetic shopper with an Austin address.
  await addToCart(page);
  const email = `live-${Date.now()}@example.test`;
  await register(page, email, austin);
  note("shopper", email);

  // 4. Choose a delivery option in the cart.
  await page.goto("/cart");
  const option = await chooseDelivery(page, austin.zip);
  note("cart-option", option);

  // 5. Check out with the Approve scenario; an in-doubt placement settles on the confirmation page.
  await checkout(page, /Approve/);
  await expect(page.getByRole("heading", { name: "Order placed, thank you!" })).toBeVisible({ timeout: 90_000 });
  const confirmed = page.getByTestId("promise-window").first();
  await expect(confirmed).toHaveText(/^Arriving /);
  const promised = (await confirmed.innerText()).trim();
  const orderId = (await page.getByTestId("order-id").innerText()).trim();
  const tier = (await page.locator(".confirm-promise .muted").first().innerText()).trim();
  note("order-id", orderId);
  note("tier", tier);
  note("promise-window", promised);

  // 6. The order detail shows the same promise.
  await page.getByRole("link", { name: "Review or track your order" }).click();
  await expect(page.getByTestId("order-number")).toHaveText(orderId, { timeout: 30_000 });
  await expect(page.getByTestId("promise-window").first()).toHaveText(promised);
  note("order-status", (await page.getByTestId("order-status").innerText()).trim());
});
