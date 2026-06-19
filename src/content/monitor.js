// Re-block monitor (content script).
//
// The service worker gates *navigations* before they load. But modern sites are
// single-page apps: once you're past the gate you can browse for hours without
// a real navigation, so the pass would never be re-checked. This script runs
// inside open tabs and asks the worker to re-apply the gate when the pass
// expires or focus hours begin — without needing a reload.
//
// Why message the worker instead of navigating here? A content script doing
// location.replace() to an extension page is a *page-initiated* navigation,
// which MV3 blocks unless the page is web-accessible. The worker's
// chrome.tabs.update is privileged and has no such restriction.
(function () {
  const Focus = globalThis.Focus;
  if (!Focus) return;

  const CHECK_INTERVAL_MS = 10000;
  let redirecting = false;
  let timer = null;

  function stop() {
    if (timer) {
      clearInterval(timer);
      timer = null;
    }
  }

  // chrome.runtime.id is undefined once the extension context is invalidated
  // (e.g. the extension was reloaded/updated while this page stayed open).
  // Using chrome.* APIs then yields errors and "chrome-extension://invalid/".
  function contextValid() {
    try {
      return Boolean(chrome.runtime && chrome.runtime.id);
    } catch (_) {
      return false;
    }
  }

  async function check() {
    if (redirecting) return;
    if (!contextValid()) {
      stop(); // a fresh content script will take over on the next navigation
      return;
    }

    try {
      const host = Focus.normalizeHost(location.hostname);
      const settings = await Focus.getSettings();

      if (!Focus.isBlockedHost(host, settings.blockedSites)) return;
      if (!Focus.isWithinSchedule(settings.schedule)) return;
      if (await Focus.hasPass(host)) return; // throws -> fail open (see catch)

      // Time to re-gate. Let the worker perform the privileged redirect.
      redirecting = true;
      chrome.runtime
        .sendMessage({ type: "reblock", target: location.href })
        .catch((err) => {
          // Message failing (e.g. context died mid-flight) shouldn't wedge us.
          redirecting = false;
          console.debug("[FocusGate] reblock request failed:", err);
        });
    } catch (err) {
      // Reading the pass can throw if the worker hasn't widened session-storage
      // access yet, or if the context just died. Fail open (don't gate wrongly).
      console.debug("[FocusGate] monitor skipped a check:", err);
    }
  }

  timer = setInterval(check, CHECK_INTERVAL_MS);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") check();
  });
  window.addEventListener("focus", check);
  check();
})();
