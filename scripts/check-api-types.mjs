// Fails when app/lib/api-schema.ts is not exactly what openapi-typescript
// generates from the committed BFF spec snapshot (openapi/storefront-bff.yaml).
// Drift means the generated file or the snapshot was edited without
// regenerating: run `npm run gen:api` and commit the result.
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const generated = "app/lib/api-schema.ts";
const spec = "openapi/storefront-bff.yaml";
const fresh = join(mkdtempSync(join(tmpdir(), "api-schema-")), "api-schema.ts");
try {
  execFileSync("npx", ["openapi-typescript", spec, "-o", fresh], { stdio: "pipe" });
  if (readFileSync(generated, "utf8") !== readFileSync(fresh, "utf8")) {
    console.error(`${generated} does not match openapi-typescript output for ${spec}.`);
    console.error("Regenerate and commit: npm run gen:api");
    process.exitCode = 1;
  } else {
    console.log(`${generated} matches the BFF spec snapshot (${spec}).`);
  }
} finally {
  rmSync(fresh, { recursive: true, force: true });
}
