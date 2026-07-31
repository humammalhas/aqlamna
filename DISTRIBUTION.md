# أقلامنا — distribution strategy

Decided 30 July 2026. This file is the authority on how Aqlamna reaches users.
`CLAUDE.md` links here; keep the depth in this file, not in the index.

## The split that drives every decision

Aqlamna is two products wearing one name, and they want opposite platforms:

- **The editor is desktop-shaped.** Three panes — source, canvas, player — used with a
  keyboard for long sessions. Nobody authors branching fiction on a phone, for the same
  reason nobody wants a code editor on a phone.
- **The reader is phone-native.** An exported story is a single HTML file. It opens from a
  link instantly, works offline, needs no install, no account, no store review.

Every packaging question below resolves by asking which half it serves.

## Where things stand

| Channel | Status | Notes |
|---|---|---|
| Web — aqlamna.org | primary | Cloudflare Pages. The product. |
| PWA install (Android/desktop) | **works — since 31 Jul 2026** | one manifest at `/manifest.webmanifest` (`scope: "/"`, `start_url: "/editor/"`) and one worker at `/sw.js` (scope `/`). Installable from any page, launches into the editor. See "PWA install — what actually made it work" below. |
| Google Play (TWA) | **later — worth doing** | see below |
| F-Droid | **skip** | see below |
| Native Android/iOS app | not planned | no case for it |

## PWA install — what actually made it work

This row read **"already works — manifest + service worker + HTTPS are live"** from 30 Jul
until 31 Jul 2026. It was false the whole time, and a phone test is what exposed it. Three
separate faults, none of which any test that reads markup could have seen:

1. **`sw.js` was a `.js` file containing TypeScript.** It threw on every registration, so no
   worker was ever live — and Chrome will not fire `beforeinstallprompt` without one. This
   is why nothing was ever installable on Android, and it predates the other two.
2. **The scope was `/editor/`.** Opening `aqlamna.org` linked no manifest and registered no
   worker, so the front door offered nothing at all. Now one manifest and one worker at the
   root, `scope: "/"`.
3. **The install button was invisible.** It set `color: var(--aq-accent-text)` — the
   *editor's* variable name. `site/assets/aqlamna.css` calls that colour `--aq-on-accent`.
   An undefined custom property is not an error and does not warn; it silently falls back to
   the inherited value, which was the dark ink. Cream label became near-black on ink blue:
   **1.29:1**. Now `rgb(246, 241, 231)` on `rgb(31, 58, 95)` — measured **10.28:1** on the
   deployed button.

**Scope is wide, interception is narrow.** The worker's scope is `/`, but `isCacheable()`
returns true only for the app shell, `/editor/*` and `/assets/*`. Docs, legal pages and
exported stories always hit the network. That is deliberate: a cached exported story would
be a stale copy of someone's work.

Two files at `/editor/` are now dead but still deployed — `packages/editor/public/sw.js`
(which still contains the TypeScript that threw) and `packages/editor/public/manifest.webmanifest`.
Both are superseded by the root copies. Delete them.

## Google Play via TWA — the decision

A Trusted Web Activity is Google's sanctioned way to publish a website to Play. The app is a
thin Android shell that opens Chrome fullscreen with no browser UI. The user sees an app;
what runs is aqlamna.org.

**Why it is cheap for us:** the hard prerequisites — PWA manifest, service worker, HTTPS —
already exist. What remains is roughly a day:

1. `assetlinks.json` served from aqlamna.org, proving we own both the domain and the app
   signing key
2. Build and sign the bundle with Google's `bubblewrap` CLI
3. Play listing — icon, screenshots, Arabic description, privacy policy URL (we have one)
4. Play Console account — $25 once, and Al-Maseer already has one from Maskan

**The real payoff is not downloads, it is two other things:**

- **Updates skip review.** Push to Cloudflare and every installed user has the new version
  on next open. No release cycle, no version pinning, no second codebase. This is the whole
  reason to choose TWA over a native app.
- **Play is a search engine in this region.** In Jordan, the Gulf and Egypt, Android
  dominates and people search Play directly. Someone typing `قصص تفاعلية` or
  `أدوات كتابة عربية` is searching Play, not Google — and that shelf is close to empty in
  Arabic. There is also a credibility effect: an Arabic tool that exists only as a URL reads
  as a side project; the same tool with a Play listing, an icon and reviews reads as a
  product. That matters when approaching schools and publishers.

**Two hazards, both real:**

- **Play policy 4.2 — "minimum functionality."** Google rejects apps that are a website in a
  webview with nothing added. TWAs normally pass because they are the official path, but a
  reviewer who opens a cramped three-pane desktop editor on a phone can fairly call it a
  repackaged website. **The mobile layout must be genuinely good before submission.** As of
  31 Jul 2026 the phone layout ships — one pane, a three-tab bottom bar, a `⋯` menu, no
  horizontal scroll and no control under 44px at 390px. It is measured, but nobody has yet
  written a story on a phone with it. Measured is not the same as good; write one first.
- **A bad first impression is expensive and permanent.** One-star reviews from users who
  install, discover they cannot comfortably write on a phone, and leave — those stay on the
  listing, and Play rankings punish early ratings hard.

**Therefore the sequencing is: mobile UX first, packaging second.** The likely shape is a
phone experience centred on *reading and light editing* rather than the full three-pane
editor. A day of packaging on top of roughly a week of mobile work. The packaging is the
cheap part — be clear-eyed that it is not the expensive part.

## F-Droid — skip, for this product

F-Droid requires a reproducible build from source. GPL-3.0 satisfies the licence side, but
the build setup is the costly part and F-Droid traffic is negligible. Maskan already carries
Al-Maseer's open-source signal on F-Droid; Aqlamna does not need to repeat it.

Revisit only if a genuine reader app ships and privacy-minded distribution becomes a selling
point in its own right.

## The app people would actually install

Not a wrapper around the editor. A **reader with a library** — browse Arabic interactive
stories, download, read offline, resume where you stopped. That is a real product with real
appeal, and real cost: it needs stories worth reading, moderation, and a backend we
deliberately avoided in the MVP.

It is a product decision, not a packaging decision. It cannot be judged until we have
written and finished several stories in the tool ourselves.

## Open items

- Mobile layout for the editor — shipped 31 Jul 2026, not yet used to write a real story
- Delete `packages/editor/public/{sw.js,manifest.webmanifest}` — dead, still deployed
- Decide the phone experience: read-only, or read + light editing
- Story library: still parked, revisit after we have written real stories
- `assetlinks.json` route on aqlamna.org — trivial, do it with the TWA
