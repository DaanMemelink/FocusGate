// Background service worker (MV3).
//
// Core responsibilities:
//   1. Seed default settings on install.
//   2. Redirect blocked navigations to the gate before they load
//      (chrome.webNavigation.onBeforeNavigate).
//   3. Re-redirect open tabs when the in-page monitor asks (pass expired or
//      focus hours started). Doing the navigation here — not in the content
//      script — keeps it a privileged, web_accessible_resources-free redirect.
//   4. Widen chrome.storage.session so the monitor (a content script) can read
//      the temporary passes.
importScripts(
  "../common/defaults.js",
  "../common/schedule.js",
  "../common/sites.js"
);

const GATE_PAGE = chrome.runtime.getURL("src/interstitial/interstitial.html");

function gateUrlFor(targetUrl) {
  return GATE_PAGE + "?target=" + encodeURIComponent(targetUrl);
}

// By default chrome.storage.session is readable only from trusted contexts.
// The monitor content script needs to read passes, so widen access. This
// persists for the browser session; we (re)apply it whenever the worker wakes.
async function exposeSessionStorage() {
  try {
    await chrome.storage.session.setAccessLevel({
      accessLevel: "TRUSTED_AND_UNTRUSTED_CONTEXTS",
    });
  } catch (err) {
    console.error("[FocusGate] could not widen session storage access:", err);
  }
}

exposeSessionStorage();
chrome.runtime.onStartup.addListener(exposeSessionStorage);

chrome.runtime.onInstalled.addListener(async () => {
  await exposeSessionStorage();
  const current = await chrome.storage.sync.get(Focus.SETTINGS_KEY);
  if (!current[Focus.SETTINGS_KEY]) {
    await chrome.storage.sync.set({ [Focus.SETTINGS_KEY]: Focus.DEFAULT_SETTINGS });
  }
});

// --- Redirect-before-load for fresh navigations ---------------------------
async function handleNavigation({ url, tabId }) {
  try {
    const host = Focus.normalizeHost(new URL(url).hostname);

    const settings = await Focus.getSettings();
    if (!Focus.isBlockedHost(host, settings.blockedSites)) return;
    if (!Focus.isWithinSchedule(settings.schedule)) return;
    if (await Focus.hasPass(host)) return;

    await chrome.tabs.update(tabId, { url: gateUrlFor(url) });
  } catch (err) {
    console.error("[FocusGate] navigation handling failed:", err);
  }
}

// Only top-frame (frameId 0) http(s) navigations. The scheme filter keeps the
// listener from firing on chrome:// pages and on our own extension gate page.
chrome.webNavigation.onBeforeNavigate.addListener(
  (details) => {
    if (details.frameId === 0) handleNavigation(details);
  },
  { url: [{ schemes: ["http", "https"] }] }
);

// --- Re-block requests from the in-page monitor ---------------------------
chrome.runtime.onMessage.addListener((msg, sender) => {
  if (msg && msg.type === "reblock" && sender.tab && typeof sender.tab.id === "number") {
    chrome.tabs
      .update(sender.tab.id, { url: gateUrlFor(msg.target) })
      .catch((err) => console.error("[FocusGate] reblock redirect failed:", err));
  }
  // No async response needed.
});
