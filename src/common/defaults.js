// Shared default settings + storage helpers.
//
// This file is loaded into every context that needs settings:
//   - the service worker  (via importScripts)
//   - the gate, options and popup pages (via <script> tags)
//
// To stay portable across all of those, it attaches everything to a single
// global namespace object `Focus` instead of relying on ES module imports.
(function (root) {
  const Focus = (root.Focus = root.Focus || {});

  // chrome.storage.sync key holding the user's settings (synced across devices).
  Focus.SETTINGS_KEY = "focusSettings";
  // chrome.storage.session key holding temporary per-host "passes".
  Focus.PASS_KEY = "focusPasses";

  Focus.DEFAULT_SETTINGS = {
    blockedSites: ["instagram.com", "youtube.com"],
    // Times are stored as "HH:MM" and interpreted in the user's LOCAL time,
    // which is how we account for their UTC offset (see src/common/schedule.js).
    schedule: { start: "07:00", end: "20:00" },
    // How long the site stays unlocked after the user clicks "Continue".
    graceMinutes: 5,
  };

  Focus.getSettings = async function () {
    const stored = await chrome.storage.sync.get(Focus.SETTINGS_KEY);
    return Object.assign({}, Focus.DEFAULT_SETTINGS, stored[Focus.SETTINGS_KEY] || {});
  };

  Focus.saveSettings = async function (settings) {
    await chrome.storage.sync.set({ [Focus.SETTINGS_KEY]: settings });
  };

  // --- Temporary passes -----------------------------------------------------
  // Once the user clicks "Continue", we unlock that host for `graceMinutes`.
  // Passes live in session storage so they clear automatically when the
  // browser closes. Shape: { "youtube.com": <expiry epoch ms>, ... }

  // Throws if session storage isn't reachable from this context (e.g. a content
  // script before the worker has widened access). Callers decide how to handle
  // it: the service worker always has access; the monitor fails open.
  Focus.hasPass = async function (host) {
    const data = await chrome.storage.session.get(Focus.PASS_KEY);
    const passes = data[Focus.PASS_KEY] || {};
    return typeof passes[host] === "number" && passes[host] > Date.now();
  };

  Focus.grantPass = async function (host, graceMinutes) {
    const data = await chrome.storage.session.get(Focus.PASS_KEY);
    const passes = data[Focus.PASS_KEY] || {};
    passes[host] = Date.now() + graceMinutes * 60 * 1000;
    await chrome.storage.session.set({ [Focus.PASS_KEY]: passes });
  };
})(globalThis);
