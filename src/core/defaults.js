// The config shape, seeded from config/defaults.json.
//
// Everything a user can change lives in that JSON file so it can be edited
// without touching code. It is imported as a JSON module rather than fetched:
// synchronous, works identically in the service worker, the pages and Node's
// test runner, and a syntax error fails loudly at load instead of silently
// falling back to something else.
import CONFIG from "../../config/defaults.json" with { type: "json" };

// Quotes are one per line in the settings textarea, but a JSON array is far
// nicer to edit by hand — so the config holds an array and it is joined here.
// `clipFiles` is bundled-asset wiring, not a user setting, so it never becomes
// part of the saved config.
// `_comment` is documentation for whoever opens the JSON; strip it too.
const { clipFiles, quotes, _comment, ...rest } = CONFIG;

export const DEFAULT_SETTINGS = { ...rest, quotes: quotes.join("\n") };

// Clips bundled with the extension. Paths are relative to the extension root.
export const BUNDLED_CLIPS = clipFiles;

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
