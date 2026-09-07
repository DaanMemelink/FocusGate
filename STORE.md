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

**Category** — Productivity / Workflow & Planning

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
> Everything is configurable: which steps run, how long the wait is, how long a
> site stays open afterwards, focus hours, and the quotes you see while waiting.
>
> No accounts, no servers, no analytics, and no network requests of any kind
> while it runs. Your settings ride your browser's own sync if you have that
> switched on; everything else stays on the device.

## Privacy

**Single purpose**

> Adding a configurable delay and confirmation step before the user opens
> websites they have chosen to limit.

**Data usage** — tick nothing. The extension collects no user data. Settings,
per-rule unlock timers, a per-day counter and the last reason you typed are
stored with `chrome.storage` and are never sent anywhere by the extension. There
is no network request of any kind at runtime: fonts are bundled, and there is no
analytics or remote configuration.

Be aware of one nuance when answering: settings live in `chrome.storage.sync`,
which the *browser* replicates between the user's own devices when they have
browser sync enabled. That is a browser feature operating under the vendor's
policy, not a transfer the extension performs, and it does not make this a
data-collecting extension — but PRIVACY.md states it plainly rather than
claiming nothing ever leaves the machine.

**Remote code** — No. All JavaScript is in the package.

**Privacy policy URL** — required whenever a listing is published. Use
`PRIVACY.md` in this repo, which needs the repo to be public:

```
https://github.com/DaanMemelink/FocusGate/blob/main/PRIVACY.md
```

A rendered GitHub page is an accepted policy URL, and it is what the listing
uses today. If you later move it to a domain of your own — focusgate.daanmemelink.nl,
say — update the field in the dashboard and the contact line at the bottom of
PRIVACY.md. The store lets you change the URL after publishing, so there is no
need to have the domain ready first.

## Permission justifications

Reviewers ask for these individually. Say the least that is true.

**`storage`**

> Stores the user's own settings (which sites are gated and how), the timer that
> keeps a site open after they get through, and a per-day counter shown on the
> final step. Local to the browser; nothing is transmitted.

**`webNavigation`**

> The extension must show its gate before a listed site renders. It listens to
> `onBeforeNavigate` for ordinary page loads and `onHistoryStateUpdated` for
> in-page navigation, which is how sites like YouTube open a Short without
> loading a document. Only the URL is inspected, only to decide whether the
> user's own rules match it.

**Content script on `http://*/*` and `https://*/*`**

> A small script re-checks the current page when its unlock timer expires,
> because that moment produces no navigation event. It contains no logic of its
> own, reads no page content, and only sends the current URL to the extension's
> service worker to ask whether the gate should reappear. The match pattern is
> broad because the user chooses which sites are gated, and that list can be any
> site.

## Screenshots

At least one, 1280×800 or 640×400. The two worth showing:

1. **The gate, mid-countdown** — the ring, a quote, and the step rail.
2. **Settings** — the rule list, with the grouped YouTube rules visible.

To capture them, load the extension unpacked, open each page, and screenshot at
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
