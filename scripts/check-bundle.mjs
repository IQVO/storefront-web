// CI sensor `no-network-url-in-bundle`. Usage: node scripts/check-bundle.mjs [dir]
// WHAT: the built client bundle references a backend other than /api/storefront.
// WHY: the storefront talks ONLY to the BFF (ADR 0002); anything else leaks topology or bypasses it.
// FIX: call lib/queries.ts (relative base) and keep server-only config in *.server.ts.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { extname, join } from "node:path";
import { scanText } from "./bundle-scan.mjs";

const root = process.argv[2] ?? "build/client";
const SCANNED = new Set([".js", ".mjs", ".css", ".html", ".json", ".map"]);

function* walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) yield* walk(p);
    else if (SCANNED.has(extname(p))) yield p;
  }
}

let files = 0;
const bad = [];
for (const f of walk(root)) {
  files += 1;
  for (const v of scanText(readFileSync(f, "utf8"))) bad.push({ f, ...v });
}
if (files === 0) {
  console.error(`no-network-url-in-bundle: no files under ${root}; run "npm run build" first.`);
  process.exit(2);
}
if (bad.length > 0) {
  for (const b of bad) console.error(`${b.f}: [${b.rule}] ${b.why}: ${b.match}`);
  console.error(`no-network-url-in-bundle: ${bad.length} violation(s) in ${files} files.`);
  process.exit(1);
}
console.log(`no-network-url-in-bundle: ok (${files} files scanned, only /api/storefront is reachable)`);
