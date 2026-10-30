import { expect, type Page } from "@playwright/test";

// Shared steps of the storefront journeys (stub BFF in CI, the real cluster in the live spec).
// Synthetic shopper data only.

/** In the buy box: enter a ZIP (when none is known yet) and wait for the network's promise. */
export async function seePromise(page: Page, zip: string) {
  const box = page.getByRole("complementary", { name: "Buy box" });
  const field = box.getByLabel(/Enter your ZIP code/);
  // The ZIP field shows only while no destination is known (sf_dest cookie or a saved address).
  const asked = await field.waitFor({ state: "visible", timeout: 3_000 }).then(() => true, () => false);
  if (asked) {
    await field.fill(zip);
    await box.getByRole("button", { name: "Apply" }).click();
  }
  const main = box.getByTestId("promise-main");
  await expect(main).toBeVisible({ timeout: 20_000 });
  return main;
}

export async function addToCart(page: Page) {
  await page.getByRole("button", { name: "Add to Cart" }).click();
  await expect(page.getByText("Added to your cart")).toBeVisible({ timeout: 20_000 });
}

/** In the cart: make sure the destination is set, then choose a delivery option (Standard when offered). */
export async function chooseDelivery(page: Page, zip: string) {
  await expect(page.getByRole("heading", { name: "Shopping Cart" })).toBeVisible();
  const radios = page.getByRole("radio");
  const quoted = await radios.first().waitFor({ state: "visible", timeout: 10_000 }).then(() => true, () => false);
  if (!quoted) {
    await page.getByLabel("Deliver to ZIP code").fill(zip);
    await page.getByRole("button", { name: "Update" }).click();
  }
  await expect(radios.first()).toBeVisible({ timeout: 20_000 });
  const standard = page.getByRole("radio", { name: /Standard Delivery/ });
  const choice = (await standard.count()) > 0 ? standard.first() : radios.first();
  await choice.check();
  await expect(page.getByRole("link", { name: "Proceed to checkout" })).toBeVisible({ timeout: 20_000 });
  return (await choice.locator("xpath=..").innerText()).replace(/\s+/g, " ").trim();
}

export interface Address { name: string; line1: string; city: string; region: string; zip: string; country: string }

export async function register(page: Page, email: string, a: Address) {
  await page.goto("/account");
  const form = page.locator("form", { has: page.getByRole("heading", { name: "Create account" }) });
  await form.getByLabel("E-mail").fill(email);
  await form.getByLabel("Full name").fill(a.name);
  await form.getByLabel("Street address").fill(a.line1);
  await form.getByLabel("City").fill(a.city);
  await form.getByLabel("State").fill(a.region);
  await form.getByLabel("ZIP code").fill(a.zip);
  await form.getByLabel("Country code").fill(a.country);
  await form.getByRole("button", { name: "Create your account" }).click();
  await expect(page.getByText(email)).toBeVisible({ timeout: 20_000 });
}

export async function signIn(page: Page, email: string) {
  await page.goto("/account");
  await page.getByLabel("E-mail").first().fill(email);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByText(email)).toBeVisible();
}

/** Checkout: use the first saved address, pick the simulated scenario, place the order. */
export async function checkout(page: Page, scenario: RegExp = /Approve/) {
  await page.goto("/checkout");
  await expect(page.getByRole("heading", { name: /^Checkout \(/ })).toBeVisible({ timeout: 20_000 });
  await page.getByRole("button", { name: "Use this address" }).first().click();
  await expect(page.getByRole("button", { name: "Place your order" })).toBeVisible({ timeout: 20_000 });
  await expect(page.getByLabel(/card number/i)).toHaveCount(0);
  await page.getByLabel(scenario).check();
  await page.getByRole("button", { name: "Place your order" }).click();
}
