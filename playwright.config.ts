import { defineConfig, devices } from "@playwright/test";

// E2E_BASE_URL set  -> journeys run against a deployed/local app talking to a REAL BFF (locally gated).
// E2E_BASE_URL unset -> the app is built and served with the stub BFF (what CI runs).
const external = process.env["E2E_BASE_URL"];
const port = 3100;

export default defineConfig({
  testDir: "e2e",
  fullyParallel: false,
  workers: 1,
  retries: process.env["CI"] ? 1 : 0,
  reporter: process.env["CI"] ? [["list"], ["html", { open: "never" }]] : "list",
  use: { baseURL: external ?? `http://127.0.0.1:${port}`, trace: "retain-on-failure" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  ...(external
    ? {}
    : {
        webServer: {
          command: `npm run build && STOREFRONT_STUB=1 PORT=${port} node server/index.ts`,
          url: `http://127.0.0.1:${port}/healthz`,
          reuseExistingServer: !process.env["CI"],
          timeout: 120_000,
        },
      }),
});
