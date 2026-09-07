// Zero-dependency test runner. `node test/run.js`, or `npm test`.
//
// The extension has no build step and no package dependencies; this keeps it
// that way. src/core/ is deliberately free of DOM and chrome.* so it can be
// imported straight into Node.
import { readdirSync } from "node:fs";
import { pathToFileURL, fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { results } from "./harness.js";

const here = dirname(fileURLToPath(import.meta.url));
const files = readdirSync(here).filter((f) => f.endsWith(".test.js")).sort();

for (const file of files) {
  await import(pathToFileURL(join(here, file)).href);
}

if (results.failures.length) {
  console.log("");
  for (const f of results.failures) console.log(`  FAIL  ${f.label}\n        ${f.message}`);
  console.log(`\n${results.passed} passed, ${results.failures.length} failed\n`);
  process.exit(1);
}

console.log(`\n${results.passed} passed, 0 failed  (${files.length} files)\n`);
