// The config shape, seeded from config/defaults.json.
//
// Everything a user can change lives in that JSON file so it can be edited
// without touching code.
//
// It is FETCHED, not imported as a JSON module. Import attributes work in
// extension pages and in Node, but MV3 service workers are a different module
// context and support could not be confirmed — and if the worker's module graph
// fails to load, the worker dies silently and nothing is ever gated. Reading a
// bundled resource with fetch(chrome.runtime.getURL(...)) is the long-standing,
// boring way to do this, and loadSettings() was already async.
const CONFIG_PATH = "config/defaults.json";

// An optional, gitignored override sitting next to it. This exists for one
// reason: clips. The repo ships none, so `clipFiles` in defaults.json has to be
// empty or a fresh clone points at a file it does not have — but the clips you
// drop into src/assets/clips/ still need listing somewhere, and editing a
// tracked file to do it means carrying a change you must never commit.
// config/local.json is that somewhere. Absent, which is the normal case,
// nothing changes.
const LOCAL_PATH = "config/local.json";

let pending = null;

// Shallow merge: an override replaces a whole top-level key rather than being
// deep-merged into it. Half-overriding `presets` or `steps` would be a subtler
// thing to reason about than simply restating the one you mean.
export function mergeConfig(base, override) {
  return Object.assign({}, base, override || {});
}

async function readJson(path, { optional = false } = {}) {
  // Extension: worker, gate, options and popup all resolve bundled resources
  // the same way.
  if (typeof chrome !== "undefined" && chrome.runtime && chrome.runtime.getURL) {
    const res = await fetch(chrome.runtime.getURL(path));
    if (!res.ok) {
      if (optional) return null;
      throw new Error(`${path}: HTTP ${res.status}`);
    }
    return res.json();
  }
  // Node (the test runner). Dynamic so a browser never tries to resolve it.
  const [{ readFile }, { fileURLToPath }] = await Promise.all([
    import("node:fs/promises"),
    import("node:url"),
  ]);
  const file = fileURLToPath(new URL(`../../${path}`, import.meta.url));
  try {
    return JSON.parse(await readFile(file, "utf8"));
  } catch (err) {
    if (optional && err.code === "ENOENT") return null;
    throw err;
  }
}

async function readConfig() {
  const base = await readJson(CONFIG_PATH);
  // A malformed local override is worth failing on — it was written on purpose
  // and silently ignoring it would be baffling. A missing one is not.
  const local = await readJson(LOCAL_PATH, { optional: true });
  return mergeConfig(base, local);
}

// Cached as a promise so concurrent callers share one read. A malformed config
// rejects loudly rather than falling back to something else — silently gating
// on values the user never wrote would be worse than failing.
export function getConfig() {
  if (!pending) {
    pending = readConfig().catch((err) => {
      pending = null; // let a later call retry
      throw err;
    });
  }
  return pending;
}

// The settings object, as saved. Quotes are one per line in the textarea, but a
// JSON array is far nicer to hand-edit, so the config holds an array and it is
// joined here. `clipFiles` is bundled-asset wiring rather than a user setting,
// and `_comment` is documentation for whoever opens the JSON — neither belongs
// in saved settings.
export async function getDefaultSettings() {
  const { clipFiles, quotes, _comment, ...rest } = await getConfig();
  return { ...rest, quotes: (quotes || []).join("\n") };
}

// Clips bundled with the extension. Paths are relative to the extension root.
export async function getBundledClips() {
  const { clipFiles } = await getConfig();
  return clipFiles || [];
}

// An optional " — Author" suffix on a quote line. Only the LAST separator
// counts, so a quote containing a dash keeps it.
export const QUOTE_SEPARATOR = " — ";

export function parseQuote(line) {
  const text = String(line || "").trim();
  const at = text.lastIndexOf(QUOTE_SEPARATOR);
  if (at === -1) return { text, author: "" };
  return { text: text.slice(0, at).trim(), author: text.slice(at + QUOTE_SEPARATOR.length).trim() };
}

export function parseQuotes(blob) {
  return String(blob || "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map(parseQuote);
}

// Used wherever the config is staged before saving.
export function cloneSettings(settings) {
  return JSON.parse(JSON.stringify(settings));
}
