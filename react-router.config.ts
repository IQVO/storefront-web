import type { Config } from "@react-router/dev/config";

// SSR on the Node runtime (ADR 0001). The server in server/index.ts serves the build.
// The v8 future flags are on so the 7.x -> 8 upgrade is a version bump, not a migration.
export default {
  ssr: true,
  appDirectory: "app",
  future: {
    v8_middleware: true,
    v8_passThroughRequests: true,
    v8_splitRouteModules: true,
    v8_trailingSlashAwareDataRequests: true,
    v8_viteEnvironmentApi: true,
  },
} satisfies Config;
