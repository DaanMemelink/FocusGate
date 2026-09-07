# Chrome Web Store submission

Everything needed for the listing, in the order the dashboard asks for it.

```bash
npm test && npm run package
```

That writes `dist/focus-gate-<version>.zip` — upload that. It contains only what
the extension needs to run: no tests, no tooling, no bundled clips.

---

## Before you upload

- [ ] `npm test` passes (it checks the manifest, icons and shipped config).
- [ ] `manifest.json` version bumped — the store rejects a re-upload of an
      existing version number.
- [ ] The ZIP contains **no `.mp4`**. `tools/package.mjs` enforces this; see
      *Bundled clips* below for why it matters.
- [ ] Screenshots captured (see below) — at least one is required.

## Listing

**Name** — Focus Gate

**Short description** (132 max, currently 119)

> Puts deliberate friction between you and distracting sites. You can always get through - it just has to cost something.

**Category** — Workflow & Planning. Well-being also fits, but the comparable
tools — site blockers, focus timers — sit in Workflow & Planning, which is where
someone looking for this browses.

**Store icon** — `src/assets/icons/icon-128.png`, the one with the cream ground.
Not `mark-ink-transparent-128.png`: the store renders the icon on both light and
dark surfaces, and a transparent dark mark disappears against a dark one.

**Detailed description**

> Focus Gate does not block distracting sites. It makes reaching them cost
> something, so the decision is a decision instead of a reflex.
>
> When you open a site you have listed, a gate appears first:
>
> 1. A countdown you have to sit through. Look away and it starts over.
> 2. One puzzle — mental arithmetic, a code typed backwards, or a sentence you
>    have to retype. Get it wrong and you get a different one, never the same
>    one twice.
> 3. Write down why you are going there. Your last excuse is quoted back at you.
> 4. Today's tally, then a button you have to hold down.
>
> Backing out is always one click, and it is never counted against you.
>
> Four levels, per site. YouTube can be a five-second speed bump while Instagram
> gets the full treatment — and rules can name a path, so youtube.com is Light
> while youtube.com/shorts is Standard. Getting past one rule never unlocks
> another.
>
> While you wait you get a quote, or a video clip of your own. Add MP4 or WebM
> files in Settings; they are stored in your browser and never uploaded.
>
> Everything is configurable: which steps run, how long the wait is, how long a
> site stays open afterwards, focus hours, and the quotes you see while waiting.
>
> No accounts, no servers, no analytics, and no network requests of any kind
> while it runs. Your settings ride your browser's own sync if you have that
> switched on; everything else stays on the device.

## Privacy

The dashboard's Privacy tab has four free-text fields (1000 characters each),
a data-usage checklist, three attestations and a policy URL. Paste these.

**Single purpose**

```
Focus Gate has one purpose: to interrupt navigation to websites the user has chosen to gate, and require a short deliberate delay before the page opens.

The user lists sites and paths in the extension's settings. When a navigation matches one of those rules, the extension redirects that tab to its own gate page, which asks the user to sit through a countdown, answer one small puzzle, write why they are going there, and hold a button to confirm. Only then is the tab sent on to the original URL. Backing out is always one click away and records nothing.

Every permission requested exists to serve that single behaviour. The extension has no second mode, no account, no analytics, and no feature unrelated to gating the sites the user has listed.
```

**Data usage — tick "Web history". Tick nothing else.**

This is not the obvious answer and it is worth being clear about why. The
extension sends nothing anywhere, but Google's disclosure requirement is not
about transmission:

> Extensions are required to disclose how they handle user data, even when data
> is processed or stored locally on a user's device and is not transmitted to
> external servers or third parties.

and its definition of web browsing activity is

> any information about the websites or other web resources a user requests or
> interacts with, including the domains or URLs the browser interacts with.

`focusGateStats` holds a per-day count of cleared gates keyed by rule, and
`focusGatePasses` holds an unlock expiry keyed by rule. A rule key is a hostname
and optional path. Stored on the device or not, that is a record of domains the
browser interacted with, and it is covered.

The other boxes stay empty. Nothing reads page content. The reason the user
types at step three is their own note to themselves, kept locally against a rule
they created; it is not personally identifiable information the extension seeks,
nor a personal communication, and declaring it as either would misdescribe it on
the public listing. It is disclosed in PRIVACY.md, which is where it belongs.

**The three attestations** — all three can be ticked truthfully. No user data is
sold or transferred to third parties, because none is transferred at all; none is
used for anything but gating the user's own listed sites; and none touches
creditworthiness or lending.

**Remote code** — No. All JavaScript is in the package. There is no `eval`, no
`new Function`, no `importScripts`, and no script loaded from a CDN. The two
typefaces are bundled rather than fetched from a font service, specifically so
that opening the gate tells nobody anything.

One nuance worth understanding before answering: settings live in
`chrome.storage.sync`, which the *browser* replicates between the user's own
devices when they have browser sync switched on. That is a browser feature under
the vendor's policy, not a transfer the extension performs. PRIVACY.md states it
plainly rather than claiming nothing ever leaves the machine.

**Privacy policy URL**

```
https://github.com/DaanMemelink/FocusGate/blob/main/PRIVACY.md
```

A rendered GitHub page is an accepted policy URL and is what the listing uses
today; it needs the repo to be public, which it is. If you later move it to a
domain of your own — focusgate.daanmemelink.nl, say — update the field in the
dashboard and the contact line at the bottom of PRIVACY.md. The store lets you
change the URL after publishing, so the domain does not have to exist first.

## Permission justifications

One field each, and the host-permission answer is the one that decides how long
review takes. Say the least that is true.

**`storage`**

```
storage saves the user's own configuration and the small amount of state the gate needs.

In chrome.storage.sync: the rules the user created (which sites and paths to gate, and at which of four levels), which gate steps are enabled, wait and unlock durations, focus hours, and the user's list of quotes. Sync is used so a user's own settings follow them between their own devices through the browser's built-in mechanism, the same way bookmarks do.

In chrome.storage.local: an unlock expiry per rule, so a site the user has cleared stays open for the length they chose; a per-day count of gates cleared and minutes granted per rule, which drives the tally on the gate's final step and the escalating wait; and the last reason the user typed for each rule, which step three quotes back to them.

Nothing is transmitted anywhere. The extension makes no network requests at runtime.
```

**`webNavigation`**

```
webNavigation is what lets the gate appear before the distracting page renders, which is the whole point of the extension.

The service worker listens to webNavigation.onBeforeNavigate to inspect a destination URL as the navigation begins, and to webNavigation.onHistoryStateUpdated to catch single-page apps that change route via pushState without a full navigation. That second case is necessary: moving from youtube.com to youtube.com/shorts has to be able to match a different rule, and a pushState route change is not a network request, so a declarativeNetRequest redirect cannot see it.

The URL is compared in memory against the user's own rules. If nothing matches it is discarded immediately. If a rule matches and no unlock is active, the tab is redirected to the extension's own gate page. No other webNavigation event is used, no URL is written to storage, and nothing leaves the device.
```

**Host permissions** — the dashboard asks for this because `content_scripts`
declares a match pattern, even though the manifest has no `host_permissions`
key. A pattern this broad triggers a slower, more thorough review.

```
The extension declares one content script matching http://*/* and https://*/*. It is deliberately minimal: it holds no rules and no logic, reads nothing from the page, and never touches the DOM or page content.

Every five seconds, and when a tab becomes visible again, it passes the current page URL to this extension's own service worker and asks whether that page should now be gated again. The worker answers using the user's own rules.

This covers the one case the navigation listeners cannot: an unlock expiring while the user sits on a page without navigating at all. Someone who opens a gated site and stays there for an hour would otherwise never be re-gated once their unlock ran out.

The pattern has to be broad because the user decides which sites are gated, and that can be any site. The URL goes only to this extension, is matched in memory, and is never stored or transmitted.
```

If that delay ever becomes the thing standing between you and shipping, the
content script is the only reason the pattern is broad, and it exists for one
narrow case: an unlock expiring while the user sits still on a page. Dropping it
would cost that case and nothing else. It is a real feature, so it is worth
keeping — but it is a choice, not a requirement.

## Screenshots

At least one, 1280×800 or 640×400. The two worth showing:

1. **The gate, mid-countdown** — the ring, a quote, and the step rail.
2. **Settings** — the rule list, with the grouped YouTube rules visible.

Three are checked in under `store/`, captured at 1280×800:

| File | Shows |
| --- | --- |
| `01-gate-instagram.png` | The gate on instagram.com, mid-countdown, with a quote |
| `02-settings.png` | The rule list, with the grouped YouTube rules |
| `03-settings-clips.png` | The waiting room: clip list, size limit, shrink option |

To take more, load the extension unpacked, open each page, and screenshot at
1280×800. The gate is reachable directly at
`chrome-extension://<id>/src/gate/gate.html?target=https://example.com` — with a
rule for `example.com` in place, or the page passes straight through.

## Clips

The waiting screen can play a short video instead of a quote. **The repository
ships none, and `tools/package.mjs` strips any it finds**, because a video you
did not create cannot be redistributed in a store listing — which includes the
sample this project was developed against.

Published users add their own, in Settings › Waiting room. Files go into
IndexedDB under the extension's own origin, so they never leave the machine and
never reach a server — worth stating plainly in the store listing's data
disclosures, where the honest answer stays "collects nothing".

Locally you can also bundle clips: drop `.mp4` files into `src/assets/clips/` and
list them in `config/local.json` under `clipFiles`. Both are gitignored, and the
packager ships `config/local.json` as `{}`. With no clips at all the gate shows
quotes, which is the intended fallback, not a failure.

## Third-party licences

Both bundled typefaces are SIL Open Font License 1.1, which permits bundling and
redistribution provided the licence travels with the font. Both licence files
ship in `src/assets/fonts/` and are included in the package.

- IBM Plex Mono — © 2017 IBM Corp.
- Instrument Serif — © 2022 The Instrument Serif Project Authors

## After approval

Review usually takes a few days; a broad content-script match pattern can push
it longer. If it is rejected, the reply names the policy — the likely candidates
here are the permission justifications above and a missing privacy policy URL.
