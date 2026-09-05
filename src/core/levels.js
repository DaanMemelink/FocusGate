// Levels, and what a rule actually costs.
//
// A level is a preset pair (wait seconds, pass minutes) that a rule can
// override per-entry. All pure — see test/levels.test.js.

export const LEVELS = ["Allowed", "Light", "Standard", "Maximum"];

export const LEVEL_HINT = {
  Allowed: "Never gated. Use it for the one corner of a site you actually need.",
  Light: "A short wait and a long pass. A speed bump, not a wall.",
  Standard: "The full four steps at the lengths you set below.",
  Maximum: "Double wait, every step on, and the shortest pass allowed.",
};

// A pass is never shorter than this, however many times you have caved today.
// Settled with the user: below five minutes the gate stops being a pause and
// starts being a wall, and a wall just gets the extension disabled.
export const MIN_PASS_MINUTES = 5;

// Each cave shortens the next pass by this much, down to the floor.
const CAVE_PASS_PENALTY = 2;

// Video takes longer than a glance, so these hosts get double the pass.
const VIDEO_HOST = /(^|\.)(youtube|vimeo|twitch|netflix)\./i;

// Each cave doubles the next wait. Capped, because past a few minutes the
// escalation stops deterring and starts guaranteeing the tab just gets closed
// on the extension instead.
export const MAX_WAIT_SECONDS = 300;

export function isVideoHost(host) {
  // The regex wants a trailing dot to match "youtube.com" but not "notyoutube".
  return VIDEO_HOST.test(String(host || "") + ".");
}

export function presetFor(cfg, level) {
  const presets = (cfg && cfg.presets) || {};
  return presets[level] || presets.Standard || { wait: 30, unlock: 15 };
}

// Seconds the user must sit through, given how many times they've already
// cleared this rule today.
export function waitSeconds(rule, cfg, caves = 0) {
  const preset = presetFor(cfg, rule.level);
  const base = Math.max(0, num(rule.wait, preset.wait));
  if (base === 0) return 0;
  const escalated = base * Math.pow(2, Math.max(0, caves));
  return Math.min(MAX_WAIT_SECONDS, Math.round(escalated));
}

// Minutes the site stays open once they're through.
export function passMinutes(rule, cfg, caves = 0) {
  const preset = presetFor(cfg, rule.level);
  let minutes = Math.max(0, num(rule.unlock, preset.unlock));
  if (isVideoHost(rule.host)) minutes *= 2;
  minutes -= Math.max(0, caves) * CAVE_PASS_PENALTY;
  return Math.max(MIN_PASS_MINUTES, Math.round(minutes));
}

// The note under a rule's per-entry overrides in settings.
export function floorNote(rule) {
  return isVideoHost(rule.host)
    ? "Video site — the pass is doubled, and never under 5 minutes."
    : "A pass is never shorter than 5 minutes.";
}

function num(value, fallback) {
  if (value === null || value === undefined || value === "") return fallback;
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}
