import { expect, test } from "@playwright/test";
import { addToCart, checkout, chooseDelivery, register, seePromise, signIn } from "./steps.ts";

// Synthetic shopper data only. These journeys run against the stub BFF, which enforces the upstream
// contracts (3-character destination prefix, strict decoders, session-required) the real network has.
const email = `shopper-${Date.now()}@example.test`;
const austin = { name: "Sample Shopper", line1: "1100 Congress Ave", city: "Austin", region: "TX", zip: "78701", country: "US" };

test("browse -> product promise -> cart -> checkout -> confirmation", async ({ page }) => {
  const destinations: unknown[] = [];
  const failures: string[] = [];
  page.on("request", (r) => {
    if (r.url().endsWith("/destination")) destinations.push(r.postDataJSON());
  });
  page.on("response", (r) => {
    const u = new URL(r.url());
    if (u.pathname.startsWith("/api/storefront/") && r.status() >= 400) failures.push(`${r.request().method()} ${u.pathname} ${r.status()}`);
  });

  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Shop by department" })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Departments" }).getByRole("link", { name: "Kitchen & Dining" })).toBeVisible();
  await page.getByRole("link", { name: /Glass Kettle/ }).first().click();
  await expect(page.getByRole("heading", { level: 1, name: "Glass Kettle 1.7 L" })).toBeVisible();

  // The promise comes from the network for the ZIP's 3-character prefix; the shopper only types the ZIP.
  const promise = await seePromise(page, "78701");
  await expect(promise).toContainText("FREE delivery");
  await expect(page.getByTestId("promise-fastest")).toContainText("Or fastest delivery");
  // A one-day window is read on the destination's calendar (the stub sends America/Chicago) and shows its hours.
  await expect(page.getByTestId("promise-fastest")).toContainText(/Arriving \w+day, \w{3} \d{1,2}, [89] AM – [89] PM/);
  await expect(page.getByRole("complementary", { name: "Buy box" }).getByText("Deliver to 78701")).toBeVisible();

  await addToCart(page);
  await page.getByRole("link", { name: /^Cart, 1 items$/ }).click();
  await expect(page.getByRole("link", { name: "Glass Kettle 1.7 L" })).toBeVisible();
  const option = await chooseDelivery(page, "78701");
  expect(option).toMatch(/Arriving .* Standard Delivery · FREE/);
  expect(destinations).toEqual([{ destinationPostalPrefix: "787" }]);

  await register(page, email, austin);
  await expect(page.locator("header summary")).toContainText("Deliver to Austin");
  await checkout(page);

  await expect(page.getByRole("heading", { name: "Order placed, thank you!" })).toBeVisible();
  await expect(page.getByTestId("promise-window").first()).toHaveText(/^Arriving /);
  await expect(page.getByTestId("order-id")).toBeVisible();
  // No call without a session (GET /carts 422) and no rejected request anywhere on the way.
  expect(failures).toEqual([]);
});

test("a ZIP outside the service areas is told it is not served", async ({ page }) => {
  await page.goto("/products/item-mug");
  await page.getByLabel(/Enter your ZIP code/).fill("10001");
  await page.getByRole("button", { name: "Apply" }).first().click();
  await expect(page.getByText("This item cannot be delivered to ZIP 10001 yet.")).toBeVisible();
});

test("a declined payment keeps the shopper on checkout", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("searchbox", { name: "Search products" }).fill("Notebook");
  await page.getByRole("button", { name: "Search" }).click();
  await expect(page.getByRole("status")).toContainText("results for “Notebook”");
  await page.getByRole("link", { name: /Dotted Notebook/ }).click();
  await addToCart(page);
  await page.goto("/cart");
  await chooseDelivery(page, "78701");
  await signIn(page, email);
  await checkout(page, /Decline/);
  await expect(page.getByRole("alert")).toContainText("declined");
  await expect(page.getByRole("button", { name: "Place your order" })).toBeVisible();
});

test("orders -> detail with promise and tracker -> cancel", async ({ page }) => {
  await signIn(page, email);
  await page.getByRole("link", { name: /Returns/ }).click();
  await expect(page.getByRole("heading", { name: "Your Orders" })).toBeVisible();
  await expect(page.getByText(/^Arriving /).first()).toBeVisible();
  await page.getByRole("link", { name: /^ord-/ }).first().click();
  await expect(page.getByTestId("order-status")).toHaveText("Placed");
  await expect(page.getByTestId("promise-window").first()).toHaveText(/^Arriving /);
  await expect(page.getByRole("list", { name: "Shipment progress" })).toBeVisible();

  await page.getByLabel("Reason").fill("Ordered by mistake");
  await page.getByRole("button", { name: "Cancel order" }).click();
  await expect(page.getByTestId("order-status")).toHaveText("Cancelled");
});

test("department navigation filters by category id, facets show names, and the bundle only talks to /api/storefront", async ({ page }) => {
  const calls: string[] = [];
  page.on("request", (r) => {
    const u = new URL(r.url());
    if (u.pathname.startsWith("/api/") || u.pathname.startsWith("/graphql")) calls.push(u.pathname);
  });
  await page.goto("/");
  await page.getByRole("navigation", { name: "Departments" }).getByRole("link", { name: "Office Products" }).click();
  await expect(page).toHaveURL(/\/search\?categoryId=cat-office-products$/);
  await expect(page.getByRole("link", { name: /Dotted Notebook/ })).toBeVisible();
  await expect(page.getByRole("link", { name: /Glass Kettle/ })).toHaveCount(0);
  const facets = page.getByRole("complementary", { name: "Filters" });
  await expect(facets.getByRole("link", { name: "Paper (1)" })).toBeVisible();
  await expect(facets).not.toContainText("cat-");
  await page.getByRole("link", { name: /Dotted Notebook/ }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Dotted Notebook A5");
  expect(calls.every((p) => p.startsWith("/api/storefront/"))).toBe(true);
});
