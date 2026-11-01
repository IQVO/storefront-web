import type { Config } from "@react-router/dev/config";

// SSR on the Node runtime (ADR 0001). The server in server/index.ts serves the build.
// The former v8 future flags are defaults in react-router 8 and are no longer configurable.
export default {
  ssr: true,
  appDirectory: "app",
} satisfies Config;
