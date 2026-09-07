// Re-check monitor (content script).
//
// Deliberately dumb: it holds no rules, no settings and no pass logic, and it
// never navigates. It asks the service worker "should this URL still be open?"
// and the worker does the rest. Two reasons:
//
//   1. One source of truth. The worker already decides for every navigation.
//   2. Content scripts can't be ES modules, so sharing core/ here would mean
//      duplicating it. Asking costs one message.
//
// The worker's navigation listeners already cover moving around, including
// SPA pushState. The only case left for this file is a pass expiring while the
// user sits on a page without navigating at all.
(function () {
  const CHECK_MS = 5000;
  let timer = null;

  // chrome.runtime.id goes undefined once the extension context is invalidated
  // — an extension reload kills content scripts in tabs that were already open.
  // Nothing can be done from here at that point; the worker still gates on the
  // next navigation.
  function contextValid() {
    try {
      return Boolean(chrome.runtime && chrome.runtime.id);
    } catch {
      return false;
    }
  }

  function check() {
    if (!contextValid()) {
      clearInterval(timer);
      timer = null;
      return;
    }
    try {
      chrome.runtime.sendMessage({ type: "recheck", url: location.href }).catch(() => {
        // Worker asleep or mid-restart. It will be asked again next tick.
      });
    } catch {
      /* context died between the check and the send */
    }
  }

  timer = setInterval(check, CHECK_MS);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") check();
  });
  check();
})();
