# Privacy Policy — Focus Gate

_Last updated: 7 September 2026_

Focus Gate has no servers, no accounts and no analytics. It makes no network
request of any kind while it runs. Nothing you do in it is sent to me, and there
is nothing for me to see.

## What it stores

Everything is stored using the browser's own extension storage.

**On your device only** (`chrome.storage.local`)

| What | Why |
| ---- | --- |
| Unlock timers — a rule identifier and an expiry time | So a site you have cleared stays open for the length you chose |
| A per-day counter of gates cleared and minutes granted, per rule | The tally on the gate's final step, and the escalating wait |
| The last reason you typed for each rule | Step 3 quotes your previous answer back at you |

The reason text is whatever you typed. It never leaves your device and is never
read by anything but the gate page.

**Synced by your browser, if you have browser sync enabled** (`chrome.storage.sync`)

Your settings: the sites and paths you chose to gate, their levels, the step
toggles, wait and unlock lengths, focus hours, and your list of quotes.

To be exact about this: `chrome.storage.sync` is the browser's own
settings-sync mechanism. If you are signed into Chrome or Brave with sync
switched on, your browser copies that data between your devices through your
browser vendor's infrastructure, under their privacy policy — the same way your
bookmarks travel. That is a browser feature, not something Focus Gate does, and
it is the only circumstance in which any of this data leaves your machine. Turn
browser sync off and it stays local. I never receive it either way.

## What it does not store

- **A log of the pages you visit.** The extension inspects the URL of a page you
  are navigating to, in memory, only to decide whether one of your own rules
  matches it. Full URLs are never written to storage, never logged, and never
  transmitted.

  What *is* kept is narrower, and listed in the table above: for a rule you set
  up yourself, an unlock expiry and a count of gates cleared today. That still
  amounts to a record that you went to a site you chose to gate, which is why
  the Chrome Web Store listing declares "web history" — Google's definition of
  that term covers any information about the domains your browser interacts
  with, whether or not it leaves the device. It is not a browsing log, and it
  never goes anywhere, but calling it nothing at all would be sleight of hand.
- **Page content.** Nothing reads the contents of any page you visit.
- **Anything about sites you have not listed.** A URL that matches no rule is
  discarded immediately.
- **Anything when you back out.** Choosing "take me back" at the gate records
  nothing at all — no counter, no timestamp, no text.

## Permissions, and why

- **`storage`** — to save the settings and timers above.
- **`webNavigation`** — to notice a navigation before the page renders, so the
  gate can appear first. Only the URL is examined, and only against your rules.
- **Access to page URLs (`http://*/*`, `https://*/*`)** — a small script asks
  the extension whether the current page should be gated again once its unlock
  timer expires. It sends only the current URL, to the extension itself. The
  pattern is broad because you decide which sites are gated, and that can be any
  site.

## Third parties

None. There are no analytics, no trackers, no advertising, no crash reporting
and no remote code. The two typefaces are bundled with the extension rather
than loaded from a font service, specifically so that opening the gate does not
tell anyone anything.

## Removing your data

Uninstalling the extension deletes everything it has stored. **Reset everything
to defaults** in Settings clears your settings without uninstalling.

## Changes

If this policy ever changes, the new version will be committed here and the date
above updated. The commit history of this file is the full record.

## Contact

Open an issue at
<https://github.com/DaanMemelink/FocusGate/issues>.
