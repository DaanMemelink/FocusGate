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

let pending = null;

async function readConfig() {
  // Extension: worker, gate, options and popup all resolve bundled resources
  // the same way.
  if (typeof chrome !== "undefined" && chrome.runtime && chrome.runtime.getURL) {
    const res = await fetch(chrome.runtime.getURL(CONFIG_PATH));
    if (!res.ok) throw new Error(`${CONFIG_PATH}: HTTP ${res.status}`);
    return res.json();
  }
  // Node (the test runner). Dynamic so a browser never tries to resolve it.
  const [{ readFile }, { fileURLToPath }] = await Promise.all([
    import("node:fs/promises"),
    import("node:url"),
  ]);
  const url = new URL(`../../${CONFIG_PATH}`, import.meta.url);
  return JSON.parse(await readFile(fileURLToPath(url), "utf8"));
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
