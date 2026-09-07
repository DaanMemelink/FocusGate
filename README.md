# Focus Gate

A Chromium **Manifest V3** extension that puts deliberate friction between you
and distracting sites instead of hard-blocking them. You can always get through
— it just has to cost something.

Vanilla HTML/CSS/JS, ES modules, **no build step and no dependencies**. Load the
folder as an unpacked extension and it runs.

## Install (development)

1. Open `brave://extensions` (or `chrome://extensions`).
2. Enable **Developer mode**.
3. **Load unpacked** → select this folder.
4. Click the toolbar icon to open settings.

After editing any file, hit the **reload** ↻ button on the extension's card.
Content scripts in tabs that were already open die on reload — close and reopen
those tabs, or just navigate.

## Layout

```
manifest.json
package.json              Only so Node treats src/ as ESM for the tests. No deps.
STORE.md                  Chrome Web Store listing copy, permissions, checklist
config/
  defaults.json           Everything that ships on first run — edit here, not in code
src/
  core/                   Pure logic — no DOM, no chrome.*, directly unit-testable
    rules.js              URL → rule matching, specificity, match-order badges
    levels.js             Level presets, wait escalation, pass length
    defaults.js           The config shape and first-run values
    schedule.js           Focus hours, local day keys
    puzzles.js            The three step-2 puzzles
    storage.js            The only file that touches chrome.storage
  background/
    service-worker.js     Navigation interception; the only place gating is decided
  content/
    monitor.js            Dumb poller — holds no logic, just asks the worker
  gate/                   The interstitial (gate.html/.css/.js)
  options/                The settings page
  popup/                  Toolbar popup: is the gate awake, and today's tally
  ui/tokens.css           Design tokens, bundled @font-face, resets — shared
  assets/fonts/           Instrument Serif + IBM Plex Mono, woff2 + OFL licences
  assets/clips/           Your own mp4s for the waiting room (gitignored)
  assets/icons/           The gate mark: toolbar/store PNGs and the SVG source
test/                     Zero-dependency runner: `npm test` or `node test/run.js`
tools/
  package.mjs             Builds the store ZIP
```

## Commands

```bash
npm test        # 99 assertions, no dependencies
npm run package # dist/focus-gate-<version>.zip, ready to upload
```

The icons are **not generated**. Each size is hand-tuned — the 16px is redrawn
on whole pixels rather than scaled from 32, because the mark's 4.5-unit posts
land on a half pixel at that size and go soft. Edit `src/assets/icons/mark.svg`
and re-export by hand if the mark ever changes.

`src/core/` is deliberately free of DOM and `chrome.*` so Node can import it
straight into the tests. Everything that touches storage lives in `storage.js`.

## How it works

### Configuration

Everything the extension ships with — rules, level presets, focus hours, step
toggles, quotes, bundled clips — lives in **`config/defaults.json`**. Edit it,
reload the extension, then hit **Reset everything to defaults** in settings to
adopt the change: a reload does not overwrite settings you have already saved.
`npm test` validates the file, so a typo fails there rather than at runtime.

**`config/local.json` overrides it**, and is gitignored. It exists mainly for
clips: the repo ships none, so `clipFiles` in `defaults.json` must stay empty or
a fresh clone points at a file it does not have — but the clips you drop into
`src/assets/clips/` still need listing somewhere, and editing a tracked file to
do it means carrying a change you must never commit. Put it here instead:

```json
{ "clipFiles": ["src/assets/clips/your-clip.mp4"] }
```

The merge is shallow, so an override replaces a whole top-level key rather than
being merged into it. The packager ships it as `{}` rather than dropping it: the
pages fetch it either way, and a bundled resource that 404s puts an error in
every user's console on every page load.

It is read with `fetch(chrome.runtime.getURL(...))` rather than imported as a
JSON module. Import attributes work in extension pages and in Node, but an MV3
service worker is a different module context and support could not be
confirmed — and a worker whose module graph fails to load dies silently, which
means nothing is ever gated. Fetching a bundled resource is the boring,
long-supported way, and `loadSettings()` was already async.

### The gate can be asleep

**Always on** ships enabled, so a fresh install gates around the clock. Turn it
off and focus hours apply (`days` Monday-first, plus `from`/`until`); outside
them nothing is gated at all — which is correct, and indistinguishable from a
broken install unless it says so. Both the toolbar popup and the top of the settings page therefore show
whether the gate is awake and, if not, when it next will be
(*"Saturday is not a focus day. Next awake Monday at 09:00."*). The settings
strip reflects the **staged** config, so flipping *Always on* answers "will this
gate anything?" before you save.

### Rules

A rule is `{ host, path, level, wait, unlock }`. `path` is optional, so parts of
one site can differ — `youtube.com` on Light while `youtube.com/shorts` is
Standard. Four levels:

| Level | The gate |
| ----- | -------- |
| **Allowed** | Never gated. For the one corner of a site you actually need. |
| **Light** | A short wait and a long pass. A speed bump, not a wall. |
| **Standard** | The full four steps at the lengths you set. |
| **Maximum** | Double wait, every step, and the shortest pass allowed. |

Rules that cover the same registrable domain are **grouped together** in
settings under a domain header and listed most specific first, so the `01`,
`02`, `03` badges read top to bottom. A rule with no siblings shows `·` and sits
outside any group — nothing could ever match the same address, so it competes
with no one. The numbering is derived from specificity, not stored, and it is
not a priority you set.

**Overlaps resolve by specificity, never by list order.** The score is
`hostLabels × 1000 + hostLength × 10 + pathLength`, so an exact subdomain
outranks anything written against the parent, and within one host the longer
path wins. `music.youtube.com` (Allowed) beats `youtube.com/shorts`, which beats
bare `youtube.com`. Path matching is segment-aware: `/shorts` covers
`/shorts/abc` but never `/shortstories`. The same score drives the match-order
badges in settings, so the list can't tell you one thing while the matcher does
another.

### Interception

Two listeners in the service worker, and both are needed:

- `onBeforeNavigate` — real page loads.
- `onHistoryStateUpdated` — in-page SPA navigation. Opening a Short from the
  YouTube home page is a `pushState`: no document loads, so `onBeforeNavigate`
  never fires and a path-scoped rule would silently never trigger. This one
  fires *after* the URL changes, so a Short can flash up for an instant before
  the gate replaces it. There is no earlier hook; late beats never.

The content script holds no rules, settings or pass logic and never navigates.
It polls the worker for the one case navigation events can't cover — a pass
expiring while you sit on a page without moving. One source of truth, and a
content script killed by an extension reload can't take the rules down with it.

### Passes

**Keyed by rule, not by host.** With `youtube.com` on Light and
`youtube.com/shorts` on Standard, a host key would let the cheap five-second
gate on `/watch` hand out an unlock that also covered `/shorts`.

Pass length is `preset.unlock` (or the per-rule override), **doubled for video
hosts** — a clip takes longer than a glance — minus two minutes per cave today,
and **never below five minutes**, however many times you have caved. Each cave
also doubles the next wait (30s → 60s → 120s…), capped at five minutes.

Bailing increments nothing and writes nothing. That is a design rule, not an
oversight: bailing is rewarded, never punished.

### The gate

Four steps, each a chance to give up; steps switched off in settings are
skipped, and the options page refuses to let you turn off the last one.

1. **Wait** — a countdown ring you have to watch. Looking away restarts it.
   A quote rotates every 11s, or a clip plays instead — bundled, or one you
   added in Settings, drawn from the same pool. Clips try to
   play **with sound**; browsers block autoplay-with-sound unless the page has
   user activation, and nobody clicks their way to a gate — so on refusal it
   falls back to muted and shows an unmute button, which is the gesture the
   policy is asking for. `clipSound` in the config turns the attempt off.
2. **Task** — one puzzle: mental arithmetic, a six-character code typed
   backwards, or a timestamped pledge. A wrong answer generates a **new**
   puzzle, never a retry, so guessing buys nothing.
3. **Intent** — write why (25 characters minimum), with your last excuse for
   that rule quoted back at you.
4. **Commit** — today's tally, then a button held down for three seconds.
   There is no ordinary button on this step.

Esc bails from anywhere, and the bail link is always visible.

**Steps are configurable per level.** The global toggles in section 02 say which
steps exist at all; each level can narrow that further from the Steps column in
section 03. Light ships running only **1 Wait** and **4 Commit** — a site you
have marked as one you genuinely need shouldn't also demand a puzzle. A level
can never be left with zero steps.

### Your own clips

Settings › Waiting room takes MP4 or WebM up to 40 MB and stores them in
**IndexedDB**, keyed by the extension's own origin, so a clip added in Settings
is immediately visible to the gate. Nothing leaves the machine.

IndexedDB rather than `chrome.storage.local` because the latter stores only
JSON: a video would have to be base64'd, a third larger and decoded on every
read. IndexedDB takes a `Blob` and hands one straight back to a `<video>` via an
object URL. Metadata and bytes live in separate object stores, so listing clips
in Settings does not read every video into memory to show its name.

**Shrink on upload** is optional and re-encodes to WebM at up to 720p. There is
no dependency-free way to transcode in a browser except to play the file and
record the output, so it runs in **real time**: a 40-second clip takes 40
seconds. ffmpeg.wasm would be faster and is ~30 MB of dependency this project
does not have and should not acquire for a convenience.

Two things make that safe to offer. The result is kept only if it is actually
smaller, since re-encoding an already-efficient file usually is not. And frames
drawn are counted against frames due: a tab that goes out of view stops
receiving frame callbacks, so the canvas feeds the recorder one still image for
the length of the clip — an encode that "succeeds" and comes out *smaller* than
the original, which a size check alone would wave through. Below half the frames
due, the original is kept and the user is told why.

## Design

Both surfaces are ported from the Claude Design handoff. Tokens, `@font-face`
and resets live in one shared `src/ui/tokens.css`, so the gate and settings
can't drift apart. **Fonts are bundled**, not fetched from Google — an extension
page should make no network requests, and the gate must render instantly even
offline.

Two deliberate departures from the prototype:

- **Focus rings are kept.** The prototype suppresses them because each input is
  the only interactive thing in its region; a real extension needs visible
  keyboard focus, so buttons, links and fields get a `:focus-visible` ring.
- **Quotes carry optional attribution.** The prototype's settings page stores
  plain lines while its gate shows `— Name`. Lines now accept an optional
  `— Name` suffix, split on the last separator, so one textarea serves both.

## Tests

```bash
npm test
```

99 assertions, no dependencies. They cover the matcher (including the YouTube
trio by name), specificity ordering, pass and wait arithmetic with the
five-minute floor and video doubling, focus hours including windows that wrap
past midnight and the plain-language status text, puzzle generation and answer
normalization, and the shape of `config/defaults.json` down to whether the
bundled clips it names exist on disk and that always-on really does gate at
21:00 on a Saturday.

## Decisions

Settled with the user; don't soften these without asking.

- Minimum pass is **5 minutes**, always.
- Standard 15 min · Light 30 · Maximum 5. Video hosts get double.
- Passes are keyed by rule. Clearing `/watch` must not unlock `/shorts`.
- Bailing is never logged and never counted.
- No build step. Adding a framework is a change to that decision, not an
  implementation detail.

## Publishing

`npm run package` builds the upload; **STORE.md** carries the listing copy,
per-permission justifications, privacy answers and a pre-flight checklist.

Two things to know before submitting:

- **No clips ship.** Video you did not create cannot be redistributed in a store
  listing, so `src/assets/clips/` is gitignored and the packager strips it. With
  no clips the gate shows quotes, which is the designed fallback. Published users
  add their own in Settings; locally you can also drop files in that folder and
  list them under `clipFiles` in `config/local.json`.
- **A privacy policy URL is required** to publish, even though the extension
  collects nothing and makes no network requests at runtime. `PRIVACY.md` is
  written to serve as that page once the repo is public.

## Not built yet

Ranked, from the handoff:

- [ ] Toolbar **popup** — the status readout and today's tally are built; pause
      gating and quick-add the current site are not, and it is undesigned.
- [ ] First-run **onboarding**.
- [ ] **Stats** view.
- [ ] **Rule tester** in settings: paste a URL, see which rule matches.
- [ ] "Loosening a rule takes effect tomorrow, tightening takes effect now" —
      the copy is in the settings footer, the asymmetry is not implemented.

