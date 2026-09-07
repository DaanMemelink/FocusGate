// The settings page.
//
// Edits are staged against the last-saved snapshot: `cfg` is the working copy,
// `saved` the JSON of what is in storage. When they differ the save bar appears.
// Nothing reaches chrome.storage.sync until Save is pressed.
import { getDefaultSettings, cloneSettings, parseQuotes } from "../core/defaults.js";
import { LEVELS, LEVEL_HINT, presetFor, floorNote, stepsFor, STEP_KEYS } from "../core/levels.js";
import { parsePattern, groupRules } from "../core/rules.js";
import { loadSettings, saveSettings } from "../core/storage.js";
import {
  listClips,
  addClip,
  deleteClip,
  validateClipFile,
  probeVideo,
  storageEstimate,
  formatBytes,
  formatDuration,
  MAX_CLIP_BYTES,
} from "../core/clips.js";
import {
  canCompress,
  compressVideo,
  isStarved,
  keepSmaller,
  TARGET_MAX_EDGE,
} from "../core/compress.js";
import { describeSchedule } from "../core/schedule.js";

const $ = (id) => document.getElementById(id);
const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const STEP_DEFS = [
  ["wait", "Step 1 — Wait", "A countdown you have to sit through."],
  ["task", "Step 2 — Task", "One puzzle. A wrong answer gives you a different one."],
  ["intent", "Step 3 — Intent", "Write down why. Your last excuse gets quoted back."],
  ["commit", "Step 4 — Commit", "Today's tally, then hold the button down."],
  ["restart", "Restart on tab switch", "Look away during the wait and it starts over."],
];

let cfg = null;
let saved = "";
let openRule = -1;

// --- Staging ----------------------------------------------------------------

function patch(mutate) {
  const next = cloneSettings(cfg);
  mutate(next);
  cfg = next;
  render();
}

function isDirty() {
  return saved !== "" && JSON.stringify(cfg) !== saved;
}

// Parse a numeric field, falling back rather than letting an empty box become 0
// while the user is mid-edit.
function num(value, fallback) {
  const n = parseInt(String(value).replace(/[^0-9]/g, ""), 10);
  return Number.isNaN(n) ? fallback : n;
}

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

// --- 01 Rules ---------------------------------------------------------------

// Rules are rendered grouped by the domain they compete within, most specific
// first, so the 01/02/03 badges read top to bottom. A group of one gets no
// header — there is no competition to explain.
function renderRules() {
  const host = $("rules");
  host.innerHTML = "";

  for (const group of groupRules(cfg.rules)) {
    const competing = group.entries.length > 1;
    const box = el("div", competing ? "rule-group competing" : "rule-group");

    if (competing) {
      const head = el("div", "group-head");
      head.append(
        el("span", "group-domain", group.domain),
        el("span", "group-note", `${group.entries.length} rules — checked in this order`)
      );
      box.appendChild(head);
    }

    for (const { rule, index, badge } of group.entries) {
      box.appendChild(ruleRow(rule, index, badge, competing));
    }
    host.appendChild(box);
  }
}

function ruleRow(rule, i, badge, competing) {
  const wrap = el("div", "rule");
  const head = el("div", "rule-head");

  // The badge is a match ORDER, not a priority the user sets: it is derived
  // from how specific the rule is.
  const order = el("span", "rule-order", badge);
  order.title = competing
    ? `Checked ${badge} of ${"the rules on this domain"} — most specific first.`
    : "No other rule covers this domain, so nothing competes with it.";
  head.appendChild(order);

  const toggle = () => {
    openRule = openRule === i ? -1 : i;
    render();
  };

  const label = el("button", "rule-label", rule.host + (rule.path || ""));
  label.type = "button";
  label.setAttribute("aria-expanded", String(openRule === i));
  label.addEventListener("click", toggle);
  head.appendChild(label);

  head.appendChild(el("span", `chip level-${rule.level}`, rule.level));

  const caret = el("button", "rule-caret", openRule === i ? "–" : "+");
  caret.type = "button";
  caret.setAttribute("aria-label", openRule === i ? "Collapse rule" : "Expand rule");
  caret.addEventListener("click", toggle);
  head.appendChild(caret);

  wrap.appendChild(head);
  if (openRule === i) wrap.appendChild(rulePanel(rule, i));
  return wrap;
}

function rulePanel(rule, i) {
  const panel = el("div", "rule-panel");
  panel.appendChild(el("div", "kicker", "Level"));

  const picker = el("div", "level-picker");
  for (const level of LEVELS) {
    const btn = el("button", "level-btn", level);
    btn.type = "button";
    btn.setAttribute("aria-pressed", String(level === rule.level));
    btn.addEventListener("click", () => patch((c) => { c.rules[i].level = level; }));
    picker.appendChild(btn);
  }
  panel.appendChild(picker);
  panel.appendChild(el("p", "level-hint", LEVEL_HINT[rule.level]));

  // An Allowed rule is never gated, so wait and pass length are meaningless.
  if (rule.level !== "Allowed") {
    const preset = presetFor(cfg, rule.level);
    const overrides = el("div", "overrides");
    overrides.appendChild(
      numberField("Wait", "sec", rule.wait == null ? preset.wait : rule.wait, (v) =>
        patch((c) => { c.rules[i].wait = num(v, preset.wait); })
      )
    );
    overrides.appendChild(
      numberField("Pass length", "min", rule.unlock == null ? preset.unlock : rule.unlock, (v) =>
        patch((c) => { c.rules[i].unlock = num(v, preset.unlock); })
      )
    );
    panel.appendChild(overrides);
    panel.appendChild(el("p", "floor-note", floorNote(rule)));
  }

  const foot = el("div", "panel-foot");
  const reset = el("button", "link-quiet", "Use level defaults");
  reset.type = "button";
  reset.addEventListener("click", () =>
    patch((c) => { c.rules[i].wait = null; c.rules[i].unlock = null; })
  );
  const remove = el("button", "link-danger", "Delete rule");
  remove.type = "button";
  remove.addEventListener("click", () => {
    openRule = -1;
    patch((c) => c.rules.splice(i, 1));
  });
  foot.append(reset, remove);
  panel.appendChild(foot);
  return panel;
}

function numberField(labelText, unit, value, onChange) {
  const field = el("div", "field");
  field.appendChild(el("div", "kicker", labelText));
  const box = el("div", "field-input");
  const input = el("input", "num");
  input.inputMode = "numeric";
  input.value = value;
  input.setAttribute("aria-label", `${labelText}, ${unit}`);
  // `change` rather than `input`: re-rendering on every keystroke would steal
  // the caret mid-number.
  input.addEventListener("change", () => onChange(input.value));
  box.append(input, el("span", "unit", unit));
  field.appendChild(box);
  return field;
}

function addDraft() {
  const raw = $("draft").value.trim();
  if (!raw) {
    closeDraft();
    return;
  }
  const { host, path } = parsePattern(raw);
  if (!host) {
    closeDraft();
    return;
  }
  patch((c) => c.rules.push({ host, path, level: "Standard", wait: null, unlock: null }));
  closeDraft();
}

function closeDraft() {
  $("draft").value = "";
  $("draft-row").hidden = true;
}

// --- 02 Gate steps ----------------------------------------------------------

function renderSteps() {
  const host = $("steps");
  host.innerHTML = "";
  const onCount = STEP_KEYS.filter((k) => cfg.steps[k]).length;

  for (const [key, label, baseHint] of STEP_DEFS) {
    const on = Boolean(cfg.steps[key]);
    // The last enabled step becomes inert: switching it off would leave a gate
    // with nothing in it.
    const isLastOn = STEP_KEYS.includes(key) && on && onCount === 1;

    let hint = baseHint;
    if (isLastOn) hint = "Keep one step on, or the gate stops being a gate.";
    else if (key === "restart" && !cfg.steps.wait) hint = "Nothing to restart while the wait is off.";

    const row = el("div", "toggle-row");
    const text = el("div");
    text.appendChild(el("div", "toggle-label", label));
    text.appendChild(el("div", "toggle-hint", hint));

    const toggle = el("button", "toggle");
    toggle.type = "button";
    toggle.setAttribute("role", "switch");
    toggle.setAttribute("aria-checked", String(on));
    toggle.setAttribute("aria-label", label);
    if (isLastOn) toggle.setAttribute("aria-disabled", "true");
    toggle.appendChild(el("span", "knob"));
    if (!isLastOn) {
      toggle.addEventListener("click", () => patch((c) => { c.steps[key] = !c.steps[key]; }));
    }

    row.append(text, toggle);
    host.appendChild(row);
  }
}

// --- 03 Presets -------------------------------------------------------------

const STEP_SHORT = { wait: "1", task: "2", intent: "3", commit: "4" };

function renderPresets() {
  const host = $("presets");
  host.innerHTML = "";
  for (const level of ["Light", "Standard", "Maximum"]) {
    const row = el("div", "preset-row");
    row.appendChild(el("span", "preset-name", level));
    row.appendChild(stepChips(level));
    row.appendChild(
      presetField(cfg.presets[level].wait, "s", `${level} wait`, (v) =>
        patch((c) => { c.presets[level].wait = num(v, c.presets[level].wait); })
      )
    );
    row.appendChild(
      // Floored at the 5-minute minimum here as well as at read time, so the
      // number on screen can never claim something the gate won't honour.
      presetField(cfg.presets[level].unlock, "m", `${level} pass`, (v) =>
        patch((c) => { c.presets[level].unlock = Math.max(5, num(v, c.presets[level].unlock)); })
      )
    );
    host.appendChild(row);
  }
}

// Which of the four steps this level runs. A step switched off globally shows
// as unavailable here rather than as a level choice, because it is not one.
function stepChips(level) {
  const wrap = el("span", "step-chips");
  const effective = stepsFor({ level, host: "" }, cfg);
  const onCount = STEP_KEYS.filter((k) => effective[k]).length;

  for (const key of STEP_KEYS) {
    const globallyOn = Boolean(cfg.steps[key]);
    const on = effective[key];
    // Never let a level end up with no steps at all — the gate would have
    // nothing to show.
    const isLastOn = on && onCount === 1;

    const chip = el("button", "step-chip", STEP_SHORT[key]);
    chip.type = "button";
    chip.setAttribute("aria-pressed", String(on));
    chip.setAttribute(
      "aria-label",
      `${level}: step ${STEP_SHORT[key]} (${key})`
    );
    if (!globallyOn) {
      chip.disabled = true;
      chip.title = `Step ${STEP_SHORT[key]} is switched off for every level above.`;
    } else if (isLastOn) {
      chip.setAttribute("aria-disabled", "true");
      chip.title = "Keep one step on, or this level stops being a gate.";
    } else {
      chip.title = `${on ? "Skip" : "Run"} step ${STEP_SHORT[key]} on ${level}.`;
      chip.addEventListener("click", () =>
        patch((c) => {
          const preset = c.presets[level];
          // Materialise the override the first time it is touched.
          if (!preset.steps) {
            preset.steps = {};
            for (const k of STEP_KEYS) preset.steps[k] = true;
          }
          preset.steps[key] = !preset.steps[key];
        })
      );
    }
    wrap.appendChild(chip);
  }
  return wrap;
}

function presetField(value, unit, label, onChange) {
  const wrap = el("span", "preset-field");
  const input = el("input");
  input.inputMode = "numeric";
  input.value = value;
  input.setAttribute("aria-label", label);
  input.addEventListener("change", () => onChange(input.value));
  wrap.append(input, el("span", "unit", unit));
  return wrap;
}

// --- 04 Focus hours ---------------------------------------------------------

function renderHours() {
  $("always").setAttribute("aria-checked", String(cfg.always));
  $("schedule").hidden = cfg.always;

  const host = $("days");
  host.innerHTML = "";
  DAYS.forEach((name, i) => {
    const btn = el("button", "day", name.slice(0, 1));
    btn.type = "button";
    btn.setAttribute("aria-pressed", String(Boolean(cfg.days[i])));
    btn.setAttribute("aria-label", name);
    btn.addEventListener("click", () => patch((c) => { c.days[i] = !c.days[i]; }));
    host.appendChild(btn);
  });

  $("from").value = cfg.from;
  $("until").value = cfg.until;
}

// --- 05 Waiting room --------------------------------------------------------

// --- Clip library -----------------------------------------------------------
//
// Clips live in IndexedDB, not in the settings object, so they are NOT part of
// the staged save model: adding or deleting one takes effect immediately and
// does not make the save bar appear. Blobs are far too big to shuttle through a
// dirty-check on every keystroke, and "unsaved video" is not a state anyone
// wants to reason about.

async function renderClips() {
  const list = $("clip-list");
  list.innerHTML = "";

  let clips = [];
  try {
    clips = await listClips();
  } catch (err) {
    showClipNote("Could not open the clip store. " + err.message, true);
    return;
  }

  $("clip-empty").hidden = clips.length > 0;

  for (const clip of clips) {
    const li = el("li", "clip-item");
    const main = el("div", "clip-item-main");
    main.appendChild(el("span", "clip-name", clip.name));
    const dims = clip.width && clip.height ? `${clip.width}×${clip.height}` : "";
    main.appendChild(
      el("span", "clip-meta", [formatDuration(clip.durationSec), dims, formatBytes(clip.size)]
        .filter(Boolean)
        .join("  ·  "))
    );

    const remove = el("button", "link-danger", "Remove");
    remove.type = "button";
    remove.setAttribute("aria-label", `Remove ${clip.name}`);
    remove.addEventListener("click", async () => {
      await deleteClip(clip.id);
      await renderClips();
    });

    li.append(main, remove);
    list.appendChild(li);
  }

  const estimate = await storageEstimate();
  const used = clips.reduce((n, c) => n + c.size, 0);
  $("clip-usage").textContent = estimate && estimate.quota
    ? `${formatBytes(used)} of about ${formatBytes(estimate.quota)} available`
    : formatBytes(used);
}

// One line under the clip list for anything the user needs told. `isError`
// only changes the colour: a refusal should look different from "shrunk from
// 12 MB to 3 MB", which is good news.
function showClipNote(message, isError = false) {
  const el = $("clip-error");
  el.textContent = message || "";
  el.classList.toggle("is-error", Boolean(message) && isError);
}

function setProgress(fraction, label) {
  const box = $("clip-progress");
  box.hidden = fraction === null;
  if (fraction === null) return;
  $("clip-progress-fill").style.width = `${Math.round(fraction * 100)}%`;
  $("clip-progress-label").textContent = label;
}

async function onClipChosen(file) {
  showClipNote("");
  if (!file) return;

  const check = validateClipFile(file);
  if (!check.ok) {
    showClipNote(check.reason, true);
    return;
  }

  const shrink = $("clip-compress").checked && canCompress();
  try {
    // Read the original first. It doubles as a decode check, so a file the
    // browser cannot open fails now rather than after a minute of re-encoding.
    setProgress(0, "Reading the file…");
    const source = await probeVideo(file);

    let blob = file;
    let usedCompressed = false;
    let starved = false;
    let { width, height } = source;

    if (shrink) {
      setProgress(0, "Re-encoding — this runs in real time, so leave this tab open.");
      const result = await compressVideo(file, {
        onProgress: (p) => setProgress(p, `Re-encoding — ${Math.round(p * 100)}%`),
      });
      starved = isStarved(result);
      // A starved encode is a still image held for the length of the clip. It
      // is smaller than the original, so size alone would wave it through.
      if (!starved) {
        // Only worth keeping if it actually came out smaller.
        const chosen = keepSmaller(file, result.blob);
        blob = chosen.blob;
        usedCompressed = chosen.usedCompressed;
        if (usedCompressed) ({ width, height } = result);
      }
    }

    // Duration comes from the original either way: MediaRecorder writes WebM
    // without a duration in the header, so re-probing the re-encode reports 0.
    await addClip(blob, {
      name: file.name,
      type: blob.type,
      durationSec: source.durationSec,
      width,
      height,
    });
    setProgress(null);

    if (starved) {
      showClipNote(
        "Kept the original — re-encoding stalled because this tab was not on " +
          "screen the whole time. Browsers stop handing out video frames to a " +
          "hidden tab. Try again and leave this tab in view.",
        true
      );
    } else if (shrink && !usedCompressed) {
      showClipNote(
        "Kept the original — re-encoding made it larger, which happens with " +
          "files that are already well compressed."
      );
    } else if (usedCompressed) {
      showClipNote(`Shrunk from ${formatBytes(file.size)} to ${formatBytes(blob.size)}.`);
    } else if (check.large) {
      showClipNote(
        `${formatBytes(file.size)} is on the large side for a short loop. ` +
          "Ticking “Shrink on upload” would cut it down."
      );
    }
    await renderClips();
  } catch (err) {
    setProgress(null);
    showClipNote(err.message || "Could not add that clip.", true);
  }
}

function renderWaitingRoom() {
  $("clips").setAttribute("aria-checked", String(cfg.clips));
  $("clip-hint").textContent = cfg.clips
    ? "Instead of a quote, one of your clips plays. No controls, no seeking."
    : "Quotes only.";
  $("clip-block").hidden = !cfg.clips;
  $("clip-sound").setAttribute("aria-checked", String(cfg.clipSound !== false));
  // Honest about the limit rather than promising sound the browser may refuse.
  $("clip-sound-hint").textContent =
    cfg.clipSound !== false
      ? "Tried first. Browsers often refuse autoplay with sound — the gate then shows an unmute button."
      : "Clips start silent. An unmute button is still there if you want it.";
  $("clip-pct").textContent = `${cfg.clipRate}% of waits`;
  $("clip-rate").value = cfg.clipRate;

  const count = parseQuotes(cfg.quotes).length;
  $("quote-count").textContent = `${count} ${count === 1 ? "line" : "lines"}`;
  if ($("quotes").value !== cfg.quotes) $("quotes").value = cfg.quotes;
}

// --- Render / persist -------------------------------------------------------

// Reflects the STAGED config, so toggling "Always on" answers "will this gate
// anything?" before you commit to saving it.
function renderStatus() {
  const { awake, detail } = describeSchedule(cfg);
  $("status-dot").classList.toggle("awake", awake);
  $("status-state").textContent = awake ? "Gate awake" : "Gate asleep";
  $("status-detail").textContent = detail;
}

function render() {
  renderStatus();
  renderRules();
  renderSteps();
  renderPresets();
  renderHours();
  renderWaitingRoom();

  if ($("hold-seconds").value !== String(cfg.holdSeconds)) {
    $("hold-seconds").value = cfg.holdSeconds;
  }
  if ($("intent-min").value !== String(cfg.intentMin)) {
    $("intent-min").value = cfg.intentMin;
  }

  $("savebar").hidden = !isDirty();
}

async function save() {
  await saveSettings(cfg);
  saved = JSON.stringify(cfg);
  openRule = -1;
  closeDraft();
  render();
}

function discard() {
  cfg = JSON.parse(saved);
  openRule = -1;
  closeDraft();
  render();
}

// --- Wiring -----------------------------------------------------------------

$("add-rule").addEventListener("click", () => {
  $("draft-row").hidden = false;
  $("draft").focus();
});
$("draft-add").addEventListener("click", addDraft);
$("draft-cancel").addEventListener("click", closeDraft);
$("draft").addEventListener("keydown", (e) => {
  if (e.key === "Enter") addDraft();
  if (e.key === "Escape") closeDraft();
});

$("hold-seconds").addEventListener("change", (e) =>
  patch((c) => { c.holdSeconds = Math.max(1, num(e.target.value, c.holdSeconds)); })
);
$("intent-min").addEventListener("change", (e) =>
  patch((c) => { c.intentMin = Math.max(1, num(e.target.value, c.intentMin)); })
);

$("always").addEventListener("click", () => patch((c) => { c.always = !c.always; }));
$("from").addEventListener("change", (e) => patch((c) => { c.from = e.target.value; }));
$("until").addEventListener("change", (e) => patch((c) => { c.until = e.target.value; }));

$("clips").addEventListener("click", () => patch((c) => { c.clips = !c.clips; }));
$("clip-sound").addEventListener("click", () =>
  patch((c) => { c.clipSound = c.clipSound === false; })
);
$("clip-rate").addEventListener("input", (e) => patch((c) => { c.clipRate = num(e.target.value, c.clipRate); }));

$("clip-file").addEventListener("change", async (e) => {
  const file = e.target.files && e.target.files[0];
  e.target.value = ""; // so choosing the same file twice still fires
  await onClipChosen(file);
});
$("quotes").addEventListener("input", (e) => patch((c) => { c.quotes = e.target.value; }));

$("reset-all").addEventListener("click", async () => {
  openRule = -1;
  cfg = await getDefaultSettings();
  render();
});
$("save").addEventListener("click", save);
$("discard").addEventListener("click", discard);

// Warn before losing staged edits — the save model is explicit, so a stray
// close shouldn't silently discard them.
window.addEventListener("beforeunload", (e) => {
  if (!isDirty()) return;
  e.preventDefault();
  e.returnValue = "";
});

loadSettings().then((loaded) => {
  cfg = loaded;
  saved = JSON.stringify(loaded);
  render();
});

// Say the ceiling before a file is picked, rather than only in the refusal.
$("clip-limit").textContent =
  `MP4 or WebM, up to ${formatBytes(MAX_CLIP_BYTES)} each. They stay on this ` +
  "computer — nothing is uploaded anywhere.";

// The compress option is only offered where it can actually work, and says
// what it will do rather than just "compress".
const compressible = canCompress();
$("clip-compress").disabled = !compressible;
$("compress-hint").textContent = compressible
  ? `Re-encodes to WebM at up to ${TARGET_MAX_EDGE}p. Runs in real time, so a 40-second clip takes 40 seconds. The original is kept if the result is not smaller.`
  : "This browser cannot re-encode video, so clips are stored as they are.";

renderClips().catch(() => showClipNote("Could not read stored clips.", true));
