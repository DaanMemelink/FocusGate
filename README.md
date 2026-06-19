# Focus Gate

A browser extension that makes you pause before opening distracting sites
during your chosen focus hours. When you navigate to a blocked site inside the
time window, the extension redirects the tab to a full-screen prompt:

> **Wait. Do you really want to continue?**

Only after you click **Continue anyway** does the site load. (A roadmap item is
to require solving a math problem or puzzle first — see below.)

## Stack

- **Manifest V3** browser extension (Chrome / Edge; Firefox-compatible).
- **Vanilla JavaScript** (ES2020+) — no build step, no dependencies.
- **HTML + CSS** for the settings page, popup, and the gate page.

No tooling is required to run it: load the folder as an unpacked extension.

## Install (development)

1. Open `chrome://extensions` (or `edge://extensions`).
2. Enable **Developer mode** (the toggle, top-right).
3. Click **Load unpacked** and select this project folder.
4. Click the extension's toolbar icon → **Settings** to configure sites and
   hours. The defaults block `instagram.com` and `youtube.com` from
   **07:00–20:00** local time.

After editing any file, hit the **reload** ↻ button on the extension's card.

## How it works

```
manifest.json                 Extension definition (MV3)
src/
  background/
    service-worker.js         Intercepts navigation; redirects blocked sites to the gate
  common/
    defaults.js               Settings schema, storage + pass helpers (global `Focus`)
    schedule.js               Time-window logic (local-time / UTC-offset aware)
    sites.js                  Host normalization + matching (incl. subdomains)
  content/
    monitor.js                Re-applies the gate on open SPA tabs when a pass expires
  interstitial/
    interstitial.html/.css/.js  The "Wait…" gate page
  options/                    Settings page (blocked sites, hours, grace period)
  popup/                      Toolbar popup: status + link to settings
```

### Blocking flow (redirect-before-load)

The service worker listens to `chrome.webNavigation.onBeforeNavigate` for
top-level http(s) navigations. When the destination is a blocked host, inside
the focus window, and has no active pass, it redirects the tab to
`interstitial.html?target=<original-url>` **before the page loads** — so the
target site's scripts, video, and audio never start. The gate page reads the
target, shows it, and only navigates there once you choose to continue.

### Re-blocking open tabs (the monitor)

`onBeforeNavigate` only fires on full page loads, but distracting sites are
single-page apps — once you're in, you rarely navigate again. So `monitor.js`
runs inside open tabs and re-checks every 10 seconds (and whenever the tab
regains focus) whether the page should now be gated. If the pass has expired or
focus hours have just started, it **messages the service worker**, which
performs the redirect via `chrome.tabs.update`. The content script never
navigates to the gate itself — a page-initiated navigation to an extension page
is blocked by MV3 unless the page is web-accessible, and it would break entirely
once the extension's context is invalidated (yielding `chrome-extension://invalid/`).
Reading the pass from a content script requires the worker to widen
`chrome.storage.session` access (`setAccessLevel`).

The shared `common/` files attach to a single global `Focus` object instead of
using ES module `import`. They're loaded into the service worker (via
`importScripts`) and into the gate/options/popup pages (via `<script>`).

### Time zones / UTC offset

The schedule is stored as wall-clock `HH:MM` and compared against the browser's
**local** time (`Date#getHours`/`getMinutes`). Because `new Date()` already
reflects the machine's UTC offset, `07:00–20:00` means 07:00–20:00 wherever you
are — no manual offset math needed. The settings page shows your detected time
zone and offset so the behaviour is explicit. Windows that wrap past midnight
(e.g. `22:00–06:00`) are supported.

### The "pass"

When you click **Continue anyway**, the site is unlocked for a configurable
grace period (default 5 minutes) — stored as a per-host expiry timestamp in
`chrome.storage.session`, so passes clear automatically when the browser closes.
When the pass expires, the monitor re-applies the gate even if you never left
the page.

## Roadmap

- [ ] Require a math problem / puzzle before "Continue" unlocks a site
      (slots into `src/interstitial/`).
- [ ] Per-site schedules instead of one global window.
- [ ] Optional TypeScript + bundler once the logic grows.
- [ ] Extension icons.
```
