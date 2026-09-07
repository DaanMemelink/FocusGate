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

// The one thing a pass length must not be is zero. Clearing the gate grants the
// pass and then redirects to the site, and that redirect is itself a navigation
// the worker inspects — so a pass that has already expired re-gates the tab on
// arrival, and the user is caught in a loop with no way out. A minute is the
// smallest value that survives the round trip.
//
// This is a mechanical floor, not an opinion about how long is long enough. If
// you want two-minute passes, set two.
export const MIN_PASS_MINUTES = 1;

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

// The four gate steps, in the order they run. `restart` is not one of them —
// it is a modifier on the wait.
export const STEP_KEYS = ["wait", "task", "intent", "commit"];

// Which steps a rule actually runs.
//
// Two layers, on purpose: the global toggles say which steps exist at all, and
// a level preset may narrow that further. Light is meant to be a speed bump, so
// it ships running only the wait and the commit — asking someone to solve a
// puzzle to reach a site they have marked as one they genuinely need would be
// friction with nothing behind it.
export function stepsFor(rule, cfg) {
  const global = (cfg && cfg.steps) || {};
  const override = presetFor(cfg, rule.level).steps;
  const out = {};
  for (const key of STEP_KEYS) {
    out[key] = Boolean(global[key]) && (override ? Boolean(override[key]) : true);
  }
  return out;
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

// The note under a rule's per-entry overrides in settings. Only video hosts have
// anything worth saying; everywhere else the numbers speak for themselves.
export function floorNote(rule) {
  return isVideoHost(rule.host)
    ? "Video site — the pass is doubled, because a clip takes longer than a glance."
    : "";
}

function num(value, fallback) {
  if (value === null || value === undefined || value === "") return fallback;
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}
