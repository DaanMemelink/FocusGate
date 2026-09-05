// The config shape, and what ships on first run.
//
// One object holds everything the user can change; it lives in
// chrome.storage.sync (see settings.js). Keep this the single source of truth —
// the options page renders from it and the gate reads from it.

// Quotes are stored one per line. An optional " — Author" suffix is split off
// when the gate renders it, which keeps the settings textarea a plain list
// while still allowing attribution.
export const QUOTE_SEPARATOR = " — ";

export const DEFAULT_SETTINGS = {
  // Seeded with the rules the user asked to ship: YouTube is a speed bump,
  // Shorts is not, and YouTube Music is exempt entirely.
  rules: [
    { host: "music.youtube.com", path: "", level: "Allowed", wait: null, unlock: null },
    { host: "youtube.com", path: "", level: "Light", wait: null, unlock: null },
    { host: "youtube.com", path: "/shorts", level: "Standard", wait: null, unlock: null },
    { host: "instagram.com", path: "", level: "Standard", wait: null, unlock: null },
    { host: "facebook.com", path: "", level: "Maximum", wait: null, unlock: null },
    { host: "news.ycombinator.com", path: "", level: "Light", wait: null, unlock: null },
  ],

  // At least one of wait/task/intent/commit must stay on, or the gate stops
  // being a gate. The options page enforces that.
  steps: { wait: true, task: true, intent: true, commit: true, restart: true },

  holdSeconds: 3,
  intentMin: 25,

  presets: {
    Light: { wait: 5, unlock: 30 },
    Standard: { wait: 30, unlock: 15 },
    Maximum: { wait: 60, unlock: 5 },
  },

  // Focus hours. `days` is Monday-first.
  always: false,
  days: [true, true, true, true, true, false, false],
  from: "09:00",
  until: "18:00",

  clips: true,
  clipRate: 35,

  quotes: [
    "The days are long but the decades are short. — Sam Altman",
    "Make something people want. — Y Combinator",
    "You will never own your time until you start defending it.",
    "Attention is the one currency you cannot borrow back.",
    "Every scroll is a small vote for who you're becoming.",
    "Nobody is coming to build it for you.",
    "Boredom is the toll on the road to good work.",
  ].join("\n"),
};

// Clips bundled with the extension. Paths are relative to the extension root.
export const BUNDLED_CLIPS = ["src/assets/clips/discipline.mp4"];

// Split "text — Author" into its parts. Only the LAST separator counts, so a
// quote containing a dash keeps it.
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

// A deep-ish clone that survives structuredClone being unavailable in odd
// contexts, used wherever the config is staged before saving.
export function cloneSettings(settings) {
  return JSON.parse(JSON.stringify(settings));
}
