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
| PWA install (Android/desktop) | **already works** | manifest + service worker + HTTPS are live. Installs to home screen, runs offline. Zero extra work. |
| Google Play (TWA) | **later — worth doing** | see below |
| F-Droid | **skip** | see below |
| Native Android/iOS app | not planned | no case for it |

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
  30 Jul 2026 it is not.
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

- Mobile layout for the editor — the blocker for everything above
- Decide the phone experience: read-only, or read + light editing
- Story library: still parked, revisit after we have written real stories
- `assetlinks.json` route on aqlamna.org — trivial, do it with the TWA
