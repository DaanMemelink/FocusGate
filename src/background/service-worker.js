// Background service worker (MV3, ES module).
//
// This is the only place that decides whether a URL gets gated, and it needs no
// access to any site to do it. `webNavigation` reports every navigation and its
// URL on the strength of its own permission, and `tabs.update` can send a tab
// somewhere else without one either — the `tabs` permission only gates *reading*
// a tab's url, title and favicon, which nothing here does. So the manifest asks
// for no host permissions at all, and there is no content script.
import { matchRule, ruleKey, isAllowed } from "../core/rules.js";
import { isWithinHours } from "../core/schedule.js";
import { loadSettings, passExpiry, prunePasses } from "../core/storage.js";

const GATE_PAGE = chrome.runtime.getURL("src/gate/gate.html");

function gateUrlFor(targetUrl) {
  return `${GATE_PAGE}?target=${encodeURIComponent(targetUrl)}`;
}

// The gate's own page must never be gated, and neither must anything that
// isn't a normal web page.
const TOP_LEVEL_HTTP = { url: [{ schemes: ["http", "https"] }] };

// What should happen to `url` right now.
//   ignore — no rule of the user's covers it, or it is outside focus hours
//   pass   — a rule covers it but an unlock is live, which expires at `expiry`
//   gate   — stop it
async function verdictFor(url) {
  const settings = await loadSettings();
  const rule = matchRule(url, settings.rules);

  if (!rule || isAllowed(rule)) return { action: "ignore" };
  if (!isWithinHours(settings)) return { action: "ignore" };

  const expiry = await passExpiry(ruleKey(rule));
  if (expiry !== null) return { action: "pass", expiry };

  return { action: "gate", rule };
}

// --- Re-checking a tab when its unlock runs out ------------------------------
//
// Navigation events cover every case where the user moves. The one they cannot
// cover is the user who does not: open Instagram, clear the gate, and scroll for
// an hour, and nothing fires again — the unlock expires in silence and the whole
// point of the extension quietly stops applying.
//
// This used to be a content script polling every five seconds, which meant
// asking for access to every site the user visits in order to watch the handful
// they chose. An alarm set for the exact moment the unlock lapses does the same
// job from in here: no host permissions, no polling, and it fires on time rather
// than up to five seconds late.
//
// The pending URL per tab lives in `chrome.storage.session`, which survives the
// worker being shut down and is cleared when the browser closes — exactly the
// lifetime a tab has.
const RECHECK_KEY = "focusGateRechecks";
const RECHECK_PREFIX = "recheck:";

async function readRechecks() {
  return (await chrome.storage.session.get(RECHECK_KEY))[RECHECK_KEY] || {};
}

async function cancelRecheck(tabId) {
  await chrome.alarms.clear(RECHECK_PREFIX + tabId);
  const pending = await readRechecks();
  if (tabId in pending) {
    delete pending[tabId];
    await chrome.storage.session.set({ [RECHECK_KEY]: pending });
  }
}

// `when` is the expiry itself. Chrome may hold a very short alarm back a little,
// so this fires at or shortly after the moment the unlock lapses, never before —
// which is the right side to err on.
async function scheduleRecheck(tabId, url, when) {
  const pending = await readRechecks();
  pending[tabId] = url;
  await chrome.storage.session.set({ [RECHECK_KEY]: pending });
  chrome.alarms.create(RECHECK_PREFIX + tabId, { when });
}

// Fired when a tab's unlock should have run out. The URL is the one the tab was
// last seen on: every navigation clears the pending check first, so a stale one
// cannot survive the user going somewhere else.
async function onRecheckDue(tabId) {
  const pending = await readRechecks();
  const url = pending[tabId];
  if (!url) return;

  delete pending[tabId];
  await chrome.storage.session.set({ [RECHECK_KEY]: pending });

  const verdict = await verdictFor(url);
  if (verdict.action === "gate") {
    // The tab may have been closed in the meantime, which is not an error.
    try {
      await chrome.tabs.update(tabId, { url: gateUrlFor(url) });
    } catch {
      /* gone */
    }
  } else if (verdict.action === "pass") {
    // Cleared again from another tab while this one sat there. Wait it out.
    await scheduleRecheck(tabId, url, verdict.expiry);
  }
}

// --- Navigation interception ------------------------------------------------

async function onNavigated(url, tabId) {
  try {
    if (typeof tabId !== "number" || tabId < 0) return;

    // Drop any pending re-check first. Leaving a gated site for an unrelated one
    // would otherwise leave an alarm holding the old URL, and it would fire and
    // gate a page the user is no longer on.
    await cancelRecheck(tabId);

    const verdict = await verdictFor(url);
    if (verdict.action === "gate") {
      await chrome.tabs.update(tabId, { url: gateUrlFor(url) });
    } else if (verdict.action === "pass") {
      await scheduleRecheck(tabId, url, verdict.expiry);
    }
  } catch (err) {
    console.error("[FocusGate] could not handle", url, err);
  }
}

// Real page loads: typing a URL, following a link to a new document, reloading.
chrome.webNavigation.onBeforeNavigate.addListener((d) => {
  if (d.frameId === 0) onNavigated(d.url, d.tabId);
}, TOP_LEVEL_HTTP);

// In-page navigation. Blocked sites are single-page apps: opening a Short from
// the YouTube home page swaps the URL with history.pushState and never loads a
// document, so onBeforeNavigate does NOT fire. Without this listener, a
// path-scoped rule like youtube.com/shorts would simply never trigger.
//
// It fires after the URL has changed rather than before, so a Short can flash
// up for an instant before the gate replaces it. There is no earlier hook for
// in-page navigation; late beats never.
chrome.webNavigation.onHistoryStateUpdated.addListener((d) => {
  if (d.frameId === 0) onNavigated(d.url, d.tabId);
}, TOP_LEVEL_HTTP);

chrome.alarms.onAlarm.addListener((alarm) => {
  if (!alarm.name.startsWith(RECHECK_PREFIX)) return;
  const tabId = Number(alarm.name.slice(RECHECK_PREFIX.length));
  if (Number.isInteger(tabId)) onRecheckDue(tabId).catch(() => {});
});

// A closed tab's pending check is dead weight, and its id will be reused.
chrome.tabs.onRemoved.addListener((tabId) => {
  cancelRecheck(tabId).catch(() => {});
});

// --- Housekeeping -----------------------------------------------------------

chrome.runtime.onInstalled.addListener(() => {
  prunePasses().catch(() => {});
  // Settings seed themselves on first read (loadSettings merges defaults), so
  // there is nothing to write here — a missing key IS the default.
});

chrome.runtime.onStartup.addListener(() => {
  prunePasses().catch(() => {});
});
