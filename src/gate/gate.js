// The gate page.
//
// The worker redirects here with the original URL in `?target=`. The rule is
// re-matched from settings rather than passed in a param, so there is exactly
// one source of truth for which rule applies.
//
// Four steps, each a chance to give up. Steps switched off in settings are
// skipped; the last one always ends in hold-to-open, because that is the only
// way through. Nothing is written to storage until the hold completes — bailing
// leaves no trace, by design.
import { matchRule, ruleKey, isAllowed } from "../core/rules.js";
import { waitSeconds, passMinutes } from "../core/levels.js";
import { parseQuotes, BUNDLED_CLIPS } from "../core/defaults.js";
import { makePuzzle, isCorrect } from "../core/puzzles.js";
import {
  loadSettings,
  getRuleStats,
  recordCleared,
  grantPass,
  getExcuse,
  setExcuse,
} from "../core/storage.js";

const $ = (id) => document.getElementById(id);

const RING_CIRCUMFERENCE = 326.73; // 2πr, r = 52
const QUOTE_ROTATE_MS = 11000;
const STEP_NAMES = { wait: "Wait", task: "Task", intent: "Intent", commit: "Commit" };

const target = new URLSearchParams(location.search).get("target") || "";

let settings = null;
let rule = null;
let key = "";
let host = "";
let steps = []; // the enabled step ids, in order
let index = 0;
let leaving = false;

let totalWait = 0;
let left = 0;
let passLength = 0;
let puzzle = null;
let intentText = "";
let timers = [];

// --- Small helpers ----------------------------------------------------------

const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;

function clearTimers() {
  timers.forEach(clearInterval);
  timers = [];
}

function show(id) {
  for (const el of document.querySelectorAll(".step")) el.hidden = el.id !== id;
}

// --- Step rail --------------------------------------------------------------

function paintRail() {
  const labels = $("rail-labels");
  labels.innerHTML = "";
  steps.forEach((id, i) => {
    const li = document.createElement("li");
    li.textContent = `0${i + 1} ${STEP_NAMES[id].toUpperCase()}`;
    if (i < index) li.className = "done";
    if (i === index) li.className = "current";
    labels.appendChild(li);
  });
  paintRailFill(0);
}

// The bar creeps during the countdown rather than jumping per step, so the wait
// visibly costs progress.
function paintRailFill(withinStep) {
  const n = steps.length || 1;
  const pct = Math.min(100, ((index + withinStep) / n) * 100);
  $("rail-fill").style.width = pct.toFixed(2) + "%";
}

// --- Advance / bail ---------------------------------------------------------

function canAdvance() {
  const id = steps[index];
  if (id === "wait") return left === 0;
  if (id === "task") return $("answer").value.trim().length > 0;
  if (id === "intent") return intentText.trim().length >= settings.intentMin;
  return false; // commit advances only by holding
}

function syncFooter() {
  const id = steps[index];
  const advance = $("advance");
  // Step 4 has no primary button at all — hold-to-open is the only way on.
  advance.hidden = id === "commit";
  advance.disabled = !canAdvance();
  advance.textContent = id === "task" ? "Check answer" : "Continue";
}

function next() {
  index += 1;
  if (index >= steps.length) return;
  renderStep();
}

function onAdvance() {
  const id = steps[index];
  if (!canAdvance()) return;

  if (id === "task") {
    const typed = $("answer").value;
    if (!isCorrect(puzzle, typed)) {
      // A wrong answer never re-offers the same puzzle.
      puzzle = makePuzzle({ host });
      $("answer").value = "";
      $("puzzle-label").textContent = puzzle.label;
      $("puzzle-prompt").textContent = puzzle.prompt;
      $("answer-error").textContent = "Wrong. Here's a different one.";
      $("answer").focus();
      syncFooter();
      return;
    }
    $("answer-error").textContent = "";
  }

  if (id === "intent") intentText = $("intent").value;
  next();
}

function bail() {
  if (leaving) return;
  leaving = true;
  clearTimers();
  $("rail").hidden = true;
  $("foot").hidden = true;
  show("step-bailed");
  // Nothing is recorded. Bailing is rewarded, never punished.
  setTimeout(() => {
    if (history.length > 1) history.back();
    else location.replace("about:blank");
  }, 1600);
}

// --- Step 1: wait -----------------------------------------------------------

function renderWait() {
  show("step-wait");

  const quotes = parseQuotes(settings.quotes);
  const useClip = settings.clips && Math.random() * 100 < settings.clipRate && BUNDLED_CLIPS.length;

  if (useClip) {
    const clip = $("clip");
    const media = $("clip-media");
    media.src = chrome.runtime.getURL(BUNDLED_CLIPS[Math.floor(Math.random() * BUNDLED_CLIPS.length)]);
    media.loop = true;
    media.muted = true; // the only way autoplay is allowed to start
    // Shape isn't knowable from the path; the file's own metadata settles it.
    media.addEventListener("loadedmetadata", () => {
      clip.classList.toggle("portrait", media.videoHeight > media.videoWidth);
    });
    // A missing file should leave no trace, not a black box.
    media.addEventListener("error", () => {
      clip.hidden = true;
      if (quotes.length) startQuotes(quotes);
    });
    clip.hidden = false;
    media.play().catch(() => {});
  } else if (quotes.length) {
    startQuotes(quotes);
  }

  left = totalWait;
  paintClock();

  const tick = setInterval(() => {
    if (leaving || steps[index] !== "wait") return;
    left = Math.max(0, left - 1);
    paintClock();
    if (left === 0) {
      clearInterval(tick);
      syncFooter();
    }
  }, 1000);
  timers.push(tick);

  if (settings.steps.restart) watchForTabSwitch();
  syncFooter();
}

function startQuotes(quotes) {
  const box = $("quote");
  box.hidden = false;
  let i = Math.floor(Math.random() * quotes.length);
  const paint = () => {
    const q = quotes[i % quotes.length];
    $("quote-text").textContent = q.text;
    $("quote-by").textContent = q.author ? `— ${q.author}` : "";
  };
  paint();
  timers.push(
    setInterval(() => {
      i += 1;
      paint();
    }, QUOTE_ROTATE_MS)
  );
}

function paintClock() {
  const m = Math.floor(left / 60);
  const s = left % 60;
  $("clock").textContent = m > 0 ? `${m}:${String(s).padStart(2, "0")}` : `${String(s).padStart(2, "0")}s`;
  const fraction = totalWait ? left / totalWait : 0;
  $("ring").setAttribute("stroke-dashoffset", (RING_CIRCUMFERENCE * fraction).toFixed(2));
  paintRailFill(totalWait ? 1 - fraction : 1);
  document.title = left > 0 ? `${left}s — Focus Gate` : "Focus Gate";
}

// Looking away during the wait restarts it. That is the single most effective
// thing here: it turns waiting from a free background timer into attention.
function watchForTabSwitch() {
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden || leaving) return;
    if (steps[index] !== "wait" || left === 0) return;
    left = totalWait;
    paintClock();
    $("restarted").hidden = false;
    syncFooter();
  });
}

// --- Step 2: task -----------------------------------------------------------

function renderTask() {
  show("step-task");
  puzzle = makePuzzle({ host });
  $("puzzle-label").textContent = puzzle.label;
  $("puzzle-prompt").textContent = puzzle.prompt;
  $("answer").value = "";
  $("answer-error").textContent = "";
  $("answer").focus();
  syncFooter();
}

// --- Step 3: intent ---------------------------------------------------------

async function renderIntent() {
  show("step-intent");
  $("intent-question").textContent = `Why ${host}, right now?`;
  $("intent-min-label").textContent = `${settings.intentMin} characters minimum`;
  paintIntentCount();

  const previous = await getExcuse(key);
  if (previous) {
    $("excuse-text").textContent = `“${previous}”`;
    $("last-excuse").hidden = false;
  }
  $("intent").focus();
  syncFooter();
}

function paintIntentCount() {
  const n = $("intent").value.trim().length;
  $("intent-count").textContent = `${n} / ${settings.intentMin}`;
}

// --- Step 4: commit ---------------------------------------------------------

async function renderCommit() {
  show("step-commit");
  const stats = await getRuleStats(key);
  $("tally-cleared").textContent = plural(stats.cleared, "time");
  $("tally-time-label").textContent = `Time spent on ${host}`;
  $("tally-minutes").textContent = `${stats.minutes} min`;
  $("hold-label").textContent = `Hold to open ${host}`;
  $("fine-print").textContent = `Opens for ${plural(passLength, "minute")}, then the gate comes back.`;
  syncFooter();
  wireHold();
}

// A click is a reflex; holding a button for three seconds is a decision.
function wireHold() {
  const btn = $("hold");
  const fill = $("hold-fill");
  const label = $("hold-label");
  const ms = Math.max(1, Number(settings.holdSeconds) || 3) * 1000;

  let startedAt = 0;
  let raf = 0;
  let done = false;

  const reset = () => {
    cancelAnimationFrame(raf);
    raf = 0;
    startedAt = 0;
    if (!done) {
      fill.style.width = "0%";
      label.textContent = `Hold to open ${host}`;
    }
  };

  const frame = () => {
    const pct = Math.min(100, ((Date.now() - startedAt) / ms) * 100);
    fill.style.width = pct + "%";
    if (pct >= 100) {
      if (done) return;
      done = true;
      clear();
      return;
    }
    label.textContent = "Keep holding…";
    raf = requestAnimationFrame(frame);
  };

  const press = (e) => {
    if (done || startedAt) return;
    e.preventDefault();
    startedAt = Date.now();
    raf = requestAnimationFrame(frame);
  };

  btn.addEventListener("pointerdown", press);
  btn.addEventListener("pointerup", reset);
  btn.addEventListener("pointerleave", reset);
  btn.addEventListener("pointercancel", reset);
  // Keyboard equivalent: hold Space or Enter. keydown repeats while held, which
  // the `startedAt` guard absorbs.
  btn.addEventListener("keydown", (e) => {
    if (e.key === " " || e.key === "Enter") press(e);
  });
  btn.addEventListener("keyup", reset);
  btn.addEventListener("blur", reset);
}

// --- Getting through --------------------------------------------------------

async function clear() {
  if (leaving) return;
  leaving = true;
  clearTimers();

  try {
    await grantPass(key, passLength);
    await recordCleared(key, passLength);
    if (intentText.trim()) await setExcuse(key, intentText.trim());
  } catch (err) {
    console.error("[FocusGate] could not record the pass", err);
  }

  $("rail").hidden = true;
  $("foot").hidden = true;
  $("cleared-note").textContent =
    `${host} is open for ${plural(passLength, "minute")}. Spend it on the thing you wrote down.`;
  show("step-cleared");

  // A beat on the confirmation, then through. replace() so the gate doesn't sit
  // in history between the previous page and the target.
  setTimeout(() => {
    if (target) location.replace(target);
    else history.back();
  }, 1200);
}

// --- Boot -------------------------------------------------------------------

function renderStep() {
  paintRail();
  syncFooter();
  const id = steps[index];
  if (id === "wait") renderWait();
  else if (id === "task") renderTask();
  else if (id === "intent") renderIntent();
  else if (id === "commit") renderCommit();
}

async function start() {
  settings = await loadSettings();
  rule = matchRule(target, settings.rules);

  // Nothing matched, or the rule was relaxed to Allowed while this page sat
  // open. There is nothing to gate, so pass straight through without recording
  // a cave — the user never had a choice to make.
  if (!rule || isAllowed(rule)) {
    leaving = true;
    if (target) location.replace(target);
    else history.back();
    return;
  }

  key = ruleKey(rule);
  try {
    host = new URL(target).hostname.replace(/^www\./, "");
  } catch {
    host = rule.host;
  }

  $("host").textContent = key;
  $("level").textContent = rule.level;

  const stats = await getRuleStats(key);
  totalWait = waitSeconds(rule, settings, stats.cleared);
  passLength = passMinutes(rule, settings, stats.cleared);

  steps = ["wait", "task", "intent", "commit"].filter((id) => settings.steps[id]);
  // The options page guarantees at least one step, but a hand-edited config
  // shouldn't produce a gate with no way through.
  if (!steps.length) steps = ["commit"];
  if (totalWait === 0) steps = steps.filter((id) => id !== "wait");
  if (!steps.length) steps = ["commit"];

  renderStep();
}

// --- Wiring -----------------------------------------------------------------

$("advance").addEventListener("click", onAdvance);
$("bail").addEventListener("click", bail);

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") bail();
});

$("answer").addEventListener("input", syncFooter);
$("answer").addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    e.preventDefault();
    onAdvance();
  }
});

$("intent").addEventListener("input", () => {
  intentText = $("intent").value;
  paintIntentCount();
  syncFooter();
});

start().catch((err) => {
  console.error("[FocusGate] gate failed to start", err);
  // Never strand the user on a broken gate. Let them through rather than
  // trapping them on a page with no working way forward.
  if (target) location.replace(target);
});
