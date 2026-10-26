import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: { alias: { "~": new URL("./app", import.meta.url).pathname } },
  test: {
    environment: "jsdom",
    setupFiles: ["./app/test/setup.ts"],
    include: ["app/**/*.test.{ts,tsx}", "server/**/*.test.ts", "scripts/**/*.test.ts"],
    coverage: {
      provider: "v8",
      include: ["app/lib/**", "app/components/**", "app/routes/**"],
      exclude: ["**/*.test.*"],
      thresholds: { lines: 90, functions: 85, statements: 88, branches: 70 },
    },
  },
});
