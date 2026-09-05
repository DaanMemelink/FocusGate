// Everything that touches chrome.storage.
//
// Three separate stores, on purpose:
//   settings — sync,  so rules follow the user between machines
//   passes   — local, device-specific and worthless to sync
//   stats    — local, noisy per-day counters, reset daily
import { DEFAULT_SETTINGS, cloneSettings } from "./defaults.js";
import { dayKey } from "./schedule.js";

const SETTINGS_KEY = "focusGateSettings";
const PASSES_KEY = "focusGatePasses";
const STATS_KEY = "focusGateStats";

// --- Settings ---------------------------------------------------------------

// `presets` and `steps` are nested, so a plain top-level merge would let a
// stored copy written by an older version replace the whole sub-object and
// silently drop any key added since.
const NESTED = ["steps", "presets"];

export async function loadSettings() {
  const stored = (await chrome.storage.sync.get(SETTINGS_KEY))[SETTINGS_KEY] || {};
  const settings = Object.assign(cloneSettings(DEFAULT_SETTINGS), stored);
  for (const key of NESTED) {
    settings[key] = Object.assign({}, DEFAULT_SETTINGS[key], stored[key] || {});
  }
  // A rules array is either present and authoritative, or absent entirely —
  // never merged, or deleting a seeded rule would be impossible.
  if (!Array.isArray(stored.rules)) settings.rules = cloneSettings(DEFAULT_SETTINGS.rules);
  return settings;
}

export async function saveSettings(settings) {
  await chrome.storage.sync.set({ [SETTINGS_KEY]: settings });
}

export function onSettingsChanged(handler) {
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "sync" && changes[SETTINGS_KEY]) handler();
  });
}

// --- Passes -----------------------------------------------------------------
// Keyed by RULE (see rules.js ruleKey), never by host. Shape:
//   { "youtube.com": 1736…, "youtube.com/shorts": 1736… }

export async function getPasses() {
  return (await chrome.storage.local.get(PASSES_KEY))[PASSES_KEY] || {};
}

export async function hasPass(key, now = Date.now()) {
  if (!key) return false;
  const passes = await getPasses();
  return typeof passes[key] === "number" && passes[key] > now;
}

export async function grantPass(key, minutes, now = Date.now()) {
  if (!key) return;
  const passes = await getPasses();
  passes[key] = now + minutes * 60 * 1000;
  await chrome.storage.local.set({ [PASSES_KEY]: passes });
}

// Drop expired entries so the object doesn't grow forever.
export async function prunePasses(now = Date.now()) {
  const passes = await getPasses();
  let changed = false;
  for (const [key, expiry] of Object.entries(passes)) {
    if (!(typeof expiry === "number" && expiry > now)) {
      delete passes[key];
      changed = true;
    }
  }
  if (changed) await chrome.storage.local.set({ [PASSES_KEY]: passes });
}

// --- Per-day counters -------------------------------------------------------
// { day: "2026-09-05", rules: { "<ruleKey>": { cleared, minutes } } }
//
// `cleared` drives both the step-4 tally and the escalation (each cave doubles
// the next wait). Bailing increments nothing — that is a design rule, not an
// oversight.

function emptyEntry() {
  return { cleared: 0, minutes: 0 };
}

export async function getStats(now = new Date()) {
  const stored = (await chrome.storage.local.get(STATS_KEY))[STATS_KEY];
  const today = dayKey(now);
  // A stale day is treated as absent rather than migrated: yesterday's caves
  // must not make this morning's first visit expensive.
  if (!stored || stored.day !== today) return { day: today, rules: {} };
  return stored;
}

export async function getRuleStats(key, now = new Date()) {
  const stats = await getStats(now);
  return Object.assign(emptyEntry(), stats.rules[key] || {});
}

// Records one cleared gate. Called only when the user actually gets through.
export async function recordCleared(key, minutes, now = new Date()) {
  if (!key) return;
  const stats = await getStats(now);
  const entry = Object.assign(emptyEntry(), stats.rules[key] || {});
  entry.cleared += 1;
  entry.minutes += minutes;
  stats.rules[key] = entry;
  await chrome.storage.local.set({ [STATS_KEY]: stats });
  return entry;
}

// --- Last excuse ------------------------------------------------------------
// Step 3 quotes the previous excuse back at the user. Kept per rule alongside
// the counters, but NOT reset daily — the point is that it lands cold.

const EXCUSE_KEY = "focusGateExcuses";

export async function getExcuse(key) {
  const all = (await chrome.storage.local.get(EXCUSE_KEY))[EXCUSE_KEY] || {};
  return all[key] || "";
}

export async function setExcuse(key, text) {
  if (!key || !text) return;
  const all = (await chrome.storage.local.get(EXCUSE_KEY))[EXCUSE_KEY] || {};
  all[key] = text;
  await chrome.storage.local.set({ [EXCUSE_KEY]: all });
}
