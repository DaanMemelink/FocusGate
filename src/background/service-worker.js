// Background service worker (MV3, ES module).
//
// This is the only place that decides whether a URL gets gated. The content
// script deliberately holds no logic at all — it just asks. That keeps one
// source of truth, and means a content script killed by an extension reload
// can't take the rules down with it.
import { matchRule, ruleKey, isAllowed } from "../core/rules.js";
import { isWithinHours } from "../core/schedule.js";
import { loadSettings, hasPass, prunePasses } from "../core/storage.js";

const GATE_PAGE = chrome.runtime.getURL("src/gate/gate.html");

function gateUrlFor(targetUrl) {
  return `${GATE_PAGE}?target=${encodeURIComponent(targetUrl)}`;
}

// The gate's own page must never be gated, and neither must anything that
// isn't a normal web page.
const TOP_LEVEL_HTTP = { url: [{ schemes: ["http", "https"] }] };

// Returns the matched rule when `url` should be stopped right now, else null.
async function verdictFor(url) {
  const settings = await loadSettings();
  const rule = matchRule(url, settings.rules);

  if (!rule || isAllowed(rule)) return null;
  if (!isWithinHours(settings)) return null;
  if (await hasPass(ruleKey(rule))) return null;

  return rule;
}

async function gateIfNeeded(url, tabId) {
  try {
    if (typeof tabId !== "number" || tabId < 0) return;
    const rule = await verdictFor(url);
    if (!rule) return;
    await chrome.tabs.update(tabId, { url: gateUrlFor(url) });
  } catch (err) {
    console.error("[FocusGate] could not gate", url, err);
  }
}

// --- Navigation interception ------------------------------------------------

// Real page loads: typing a URL, following a link to a new document, reloading.
chrome.webNavigation.onBeforeNavigate.addListener((d) => {
  if (d.frameId === 0) gateIfNeeded(d.url, d.tabId);
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
  if (d.frameId === 0) gateIfNeeded(d.url, d.tabId);
}, TOP_LEVEL_HTTP);

// --- Requests from the content script ---------------------------------------
// The monitor polls for one case the navigation events cannot cover: a pass
// expiring while the user sits on a page without navigating at all.
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || msg.type !== "recheck") return;
  const tabId = sender.tab && sender.tab.id;
  gateIfNeeded(msg.url, tabId);
  sendResponse({ ok: true });
  return false; // handled synchronously; the gating continues in the background
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

// Clicking the toolbar icon opens settings. The popup is a later milestone.
chrome.action.onClicked.addListener(() => {
  chrome.runtime.openOptionsPage();
});
