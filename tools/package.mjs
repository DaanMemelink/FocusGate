// Builds the Chrome Web Store upload. `npm run package`
//
// Produces dist/focus-gate-<version>.zip containing only what the extension
// needs to run — no tests, no tooling, no design bundle.
//
// It also strips bundled clips. Media you did not create cannot be
// redistributed in a store listing, and the sample clip in this repo is a
// downloaded video. The gate already degrades cleanly when there are no clips:
// it shows quotes instead. See STORE.md.
import { readFileSync, writeFileSync, mkdirSync, readdirSync, statSync } from "node:fs";
import { join, relative, dirname, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { makeZip } from "./lib/zip.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

// Everything the extension needs at runtime, and nothing else.
const INCLUDE_DIRS = ["src", "config"];
const INCLUDE_FILES = ["manifest.json"];

// Matched against the archive-relative path.
const EXCLUDE = [
  /^src\/assets\/clips\//, // third-party media — see the note above
  // Only the four manifest icons are loaded at runtime; the lockup is inlined
  // SVG. The rest of src/assets/icons is source and press art.
  /^src\/assets\/icons\/(mark|icon-128-inverse)/,
  /(^|\/)\.DS_Store$/,
  /(^|\/)Thumbs\.db$/,
];

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

const files = [];

for (const name of INCLUDE_FILES) {
  files.push({ name, data: readFileSync(join(ROOT, name)) });
}

for (const dir of INCLUDE_DIRS) {
  for (const full of walk(join(ROOT, dir))) {
    const name = relative(ROOT, full).split(sep).join("/");
    if (EXCLUDE.some((re) => re.test(name))) continue;
    files.push({ name, data: readFileSync(full) });
  }
}

// The shipped config must not point at clips that are not in the archive.
// Rewriting it here keeps the working copy usable with your own clips while the
// upload stays clean.
const configEntry = files.find((f) => f.name === "config/defaults.json");
const config = JSON.parse(configEntry.data.toString("utf8"));
const droppedClips = (config.clipFiles || []).length;
config.clipFiles = [];
configEntry.data = Buffer.from(JSON.stringify(config, null, 2) + "\n", "utf8");

files.sort((a, b) => (a.name < b.name ? -1 : 1));

const { version } = JSON.parse(readFileSync(join(ROOT, "manifest.json"), "utf8"));
mkdirSync(join(ROOT, "dist"), { recursive: true });
const outPath = join(ROOT, "dist", `focus-gate-${version}.zip`);
const zip = makeZip(files);
writeFileSync(outPath, zip);

const kb = (n) => (n / 1024).toFixed(1) + " KB";
console.log(`\n${relative(ROOT, outPath)}  —  ${files.length} files, ${kb(zip.length)}\n`);
for (const f of files) console.log(`  ${f.name.padEnd(46)} ${kb(f.data.length).padStart(9)}`);
if (droppedClips) {
  console.log(`\n  clipFiles emptied (${droppedClips} clip(s) excluded from the upload).`);
}
console.log("");
