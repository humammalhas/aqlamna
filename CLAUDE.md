# أقلامنا / Aqlamna — Arabic Interactive Fiction Engine

> ## 🔴 RULE ZERO — NEVER WRITE ARABIC WITHOUT READING `ARABIC_MASTERY.md` FIRST
>
> Applies to every agent, every session, every time, with no exception. Docs, UI strings,
> commit messages, story examples, error messages, a single sentence in a table cell —
> if it is Arabic, read the corpus **before** you write it, not after.
> This is not advice and it is not a style preference. It is the reason the corpus exists.
> Anyone handing work to another agent must name this file in the prompt; omitting it is
> the prompt's bug, not the writer's.

Al-Maseer product. Open source **GPL-3.0**, public repo (Maskan model).
Domains **aqlamna.org** (primary) + **aqlamna.com** (redirect) — both registered.
npm scope **@aqlamna** reserved (org created, account `humammalhas`, 2FA on).
Started 2026-07-30.

**➜ Read `ARABIC_IF_ENGINE_DESIGN.md` for the full design. Read `PHASE1_SPEC.md` for
what "done" means and every spec decision. Those two are the authority — keep THIS file slim.**
**➜ `IMAGES_SPEC.md` owns image generation (Phase 3.3)** — decisions are made, not open:
reference in source + bytes in IndexedDB, 768px WebP, warn 1MB / stop 2MB, one exported file
always, and an Arabic→English prompt bridge before the image model. **Groq cannot generate
images** (vision input only) and `gemini-2.5-flash-image` **shuts down 2 Oct 2026**.
**➜ `DISTRIBUTION.md` owns how this reaches users** (web / PWA / Play TWA / F-Droid).
Short version: the editor is desktop-shaped, the reader is phone-native. PWA install already
works. Play via TWA is worth ~1 day **but only after the mobile layout is good** — Play policy
4.2 rejects webview wrappers, and early one-star reviews are permanent. F-Droid: skip.

## What it is

A scripting language (`.qalam`) + parser + compiler + browser runtime + visual node editor.
RTL-first, Arabic keywords with English aliases. Exports one standalone HTML file that
plays offline with zero dependencies. Nobody else builds IF tooling for Arabic.

`ARABIC_MASTERY.md` (in this folder) is the Arabic writing-quality corpus — 25 stories of real
corrections from a Jordanian teacher. It is a **source-of-truth document, never rewritten**.
The linter reads rules FROM it via a build step; rules are never hardcoded in TypeScript.
Humam edits the markdown → build regenerates `rules.json` → site updates. That indirection is
the whole point.

## Status

**Phase 1** (parser → compiler → runtime → HTML export). Editor comes AFTER Phase 1 is green.

- ✅ Step 1 — monorepo scaffold, Vitest, fixture harness (`c6efa8c`)
- ✅ Step 2 — tokenizer, 43 unit tests (`c16651d`)
- ✅ Step 3 — parser → AST, 55 unit tests (`555f111`)
- ✅ Step 4 — **compiler. All 4 fixtures green — the language works end to end.**
  Verified independently: byte-identical output, 3-branch nesting, depth-3 choice IDs,
  list-value assignment, dash-leading prose.
- ✅ Step 5 — 8 coded errors E101-E105 / E201-E203, Arabic + English, real line:column
  (`8a1655e`, `500aa96`, `24db95b`). Message strings are FIXED in `PHASE1_SPEC.md` §1.15 —
  nobody paraphrases them. Verified: all 8 reachable, both languages non-empty,
  positions non-zero, type names localised per language.
- ✅ Step 6 — runtime player: engine, RTL renderer, save/restore, dark theme (`0259d5e`).
  Zero runtime dependencies — `packages/runtime/package.json` has no `dependencies` block.
- ✅ Step 7 — **standalone HTML export** (`905d900`, `1d2c25e`).
  `packages/runtime/examples/الرحيق.html` — 24,482 bytes, plays from `file://`, zero
  network requests. Verified independently: `node --check` passes, `class Engine` present,
  and the exported script drives a DOM stub through the story (0 → 4 قطرة, conditional
  choice appears).

**🎉 PHASE 1 COMPLETE — 135 tests (111 core + 24 runtime).**

## Phase 2 — the editor (in progress)

- ✅ 2.1 app shell — Vite + React + Zustand, RTL, IndexedDB, play + export (`58de886`)
- ✅ 2.2 CodeMirror with `.qalam` highlighting, live Arabic errors, **bidi operator
  isolation** so `>=` no longer renders as `=<` (`4c2c98a`, `b816d15`)
- ✅ **Playwright visual tests** (`3344039`) — 5 browser tests measuring computed styles
  and glyph x-positions. Added because appearance cannot be verified by reading code;
  CodeWhale twice reported visual fixes it had never rendered. Run:
  `npm run test:visual -w @aqlamna/editor`
- ✅ 2.4 AI co-writing (`140a59d`) — **bring-your-own-key** (DeepSeek, localStorage only,
  Maskan model). Three actions: اقترح خيارات · أكمل المشهد · اكتب هذا المقطع.
  Every response is compiled by `@aqlamna/core` before the author sees it; on failure it
  retries once with the error fed back, then shows the raw text — **never inserts
  anything that does not compile.** Human accepts with [أضف] or discards with [تجاهل].
- ⬜ 2.3 visual canvas (React Flow) — deferred, the editor works without it

**ARABIC_MASTERY → the AI, the loop that matters:**
`packages/editor/scripts/build-mastery-prompt.mjs` reads `ARABIC_MASTERY.md` and emits
`src/generated/mastery-prompt.ts` — as of the 31 Jul 13:20 corpus (md5 `1d5c20ad…`):
**30 rules verbatim, 94 ❌→✅ pairs, 23 checklist items, 10,295 chars.** These numbers grow
with the corpus; the build prints them on every run and the pair-count test asserts they
match the markdown — read them from the build output, never from this line.
Sent as the system prompt on every AI call. **Edit the markdown → rebuild →
every AI request carries the new rule.** Rules are never hardcoded in TypeScript.
Phase 3's linter reads the same file: prompt prevents on the way in, linter detects on the
way out.

## Phase 3 — polish (in progress)

- ✅ **3.1 the Arabic quality linter** (`1d67edc`, `9d1cd45`) — `packages/linter`, zero deps.
  `scripts/build-rules.mjs` reads `ARABIC_MASTERY.md` → `src/generated/rules.ts` (NOT
  `rules.json` — that format was retired and its fossil sat in `dist/` for a day answering
  questions with stale data). As of the 31 Jul 13:20 corpus: **88 pair rules from the ❌/✅
  tables, 5 hand-written pattern rules (`rules-extra.json`), 8 advisory rules never linted —
  101 total, 0 with an empty message.** Tests are GENERATED from the tables — add a
  before/after row and you get a rule plus two tests for free. That is the whole design.
  Counts move with the corpus; `npm run check:artifacts` prints them, so read them there.
  **The 5 struck-through §9.5 rows (`اعتبر`, `ساهم`, `بسيط`, `أثّر على`, `توهّم بأنّ`) are
  correctly excluded** — verified 0 leak into rules. The corpus's subtlest instruction, "do
  not over-correct", survives extraction.
  Lints **prose only** — reads TEXT tokens from the tokenizer, so it can never flag
  `===`, variable names or diverts. Verified: a syntax-only source yields 0 diagnostics.
  Pair rules can over-match (a table row is an example, not a regex) so §1b.5 verb-precision
  rules are `info`, not `warning`. The linter suggests; it never blocks.
  Known gap: `وقام بزيارة` is missed — the §2.4 lookbehind rejects the `و` prefix.
- ⬜ 3.2 themes, mobile, Arabic tutorial and docs
- ⬜ `CANVAS_TODO.md` — canvas interactions deferred from 2.3

**Two consumers, one file:** the prompt prevents mistakes on the way in, the linter catches
them on the way out. Both regenerate from `ARABIC_MASTERY.md`; neither hardcodes a rule.

## Two critical bugs found by writing a real story (`1b15389`)

Both were invisible to 4 fixtures and 350+ tests. Both produced valid JSON and no error.

1. **Per-passage consumed choices.** Choice IDs restart at `choice_1` in every passage,
   but the engine keyed its consumed set by ID alone — so taking a `*` choice in one
   scene silently consumed `choice_1` in EVERY scene. Any multi-scene story dead-ended.
   **This was a spec bug** — §1.4 defined the IDs but never said the consumed set must be
   keyed by (passage, id). Spec now says so explicitly.
2. **`لا` negation was dropped by the compiler.** `{س}` and `{لا س}` compiled to the
   identical condition, so every "if not" in every story was silently inverted.
   Now compiles to `{"not":{"var":"س"}}`.

Lesson, again: fixtures test the syntax; only a hand-written story tests the experience.
`stories/العطر_المفقود.qalam` is the demo AND the regression case — 11 passages, two
reachable endings, verified by driving the engine down both paths.

## Deployment day — 30 Jul 2026

Live at **aqlamna.pages.dev** (Cloudflare Pages, direct wrangler upload — pushing to main
does NOT redeploy). Public repo `github.com/humammalhas/aqlamna`, GPL-3.0, Issues +
Discussions live.

Shipped today: onboarding overlay, seed story from `stories/العطر_المفقود.qalam` via a build
step, AI instruction textarea, canvas pan/scroll/fit-view, three-pane layout fixed, docs
pages (`scripts/build-docs.mjs` renders `docs/*.md` → `site/docs/*.html`), cream + ink-blue
palette as default with dark as the alternate, `lint:colors` gate wired into `npm test`.

**Legal name is `المصير لبرامج وأنظمة الحاسوب`** — from the Companies Control Department
license in `C:\AlMaseer\license\`. The repo previously carried `المسير` and two different
word orders. Do not retype it from memory.

**Three bugs today, all the same shape: source right, shipped artifact wrong.** The
paragraph fix wasn't re-exported; the cream palette was defined but unused by every
component; save/load feedback lives in a file the exported story never loads. See
`.codewhale/constitution` → "Lessons from deployment day". The rule that came out of it:
**grep the artifact that ships and report the count — source only proves it exists.**

Also: a CodeWhale commit silently reverted six files edited in parallel by the reviewer.
**Do not run CodeWhale and a Cowork session against `C:\aqlamna` at the same time.**

## Updating ARABIC_MASTERY.md — the runbook

**Canonical copy: `C:\Users\asus\Documents\Claude\Projects\teachaiarabic\ARABIC_MASTERY.md`.**
That is where Elham's corrections land. The copy in this repo is a SYNCED MIRROR — it exists
here because the file ships publicly under GPL. Never edit the Aqlamna copy directly; it will
be overwritten and the edit lost.

When new corrections arrive:

1. Work on the canonical file in the `teachaiarabic` project.
2. Copy it over `C:\aqlamna\ARABIC_MASTERY.md`.
3. `cd C:\aqlamna && npm run build:all` — regenerates the AI prompt, the linter rules, the
   generated linter tests, and all three exported story files.
4. `npm test` — the integrity tests fail if the markdown changed without a rebuild, and if the
   pair count in the prompt does not equal the pair count in the markdown.
5. `npm run deploy`.

**What each edit buys you, automatically:** a new `❌/✅` table row becomes a linter rule plus
two generated tests plus a line in the AI system prompt. A new `### 1b.N` rule becomes a rule
in the prompt. Nothing is hardcoded in TypeScript; that indirection is the whole design.

**History, so it is not repeated:** `build-mastery-prompt.mjs` used to keep only the first 25
of 88 pairs, so every correction after roughly story 8 reached the linter and never reached the
AI — for weeks, silently, while CLAUDE.md claimed the opposite. Fixed 31 Jul 2026 (`ebbb89a`)
along with md5 sidecars and a pair-count equality test. **Never truncate a source-of-truth
document to fit a budget.** Raise the budget or fail loudly.

## Phase 3.3 — images: COMPLETE (31 Jul 2026)

Four sessions, all shipped. `IMAGES_SPEC.md` is the authority; it was written before any code
and every decision in it was made by Humam, not inferred.

- **Session 1** — language: `صورة الاسم = "وصف"` declaration, `صورة: الاسم` body node,
  errors E106/E107/E108 in both languages, fixture 06.
- **Session 2** — runtime: `<img src=dataURI alt=arabicDescription>`, bordered placeholder
  carrying the Arabic description when an image was never generated, export still zero-network.
- **Session 3** — generation: `supportsImages`/`imageModel` per provider; **text provider and
  image provider are configured independently** (write with DeepSeek, draw with Together);
  the **two-call bridge** — Arabic description → text model → English prompt → image model;
  768px WebP into IndexedDB keyed by project+name.
- **Session 4** — `أسلوب_الصور` story-level style, two-step progress, budget UI
  (warn 1MB / block 2MB), privacy + terms updated in the same commit, custom
  OpenAI-compatible provider removed (12 → 11), price badges stripped from cloud providers.

**The bridge is not optional, and here is the evidence.** Asked in Arabic for
`دكان عطّار قديم في عمّان`, FLUX returned **a mosque with gibberish script**. The same scene
in English returned the shop, correctly. Arabic straight to an image model does not produce a
worse picture — it produces **the wrong subject**.

**Never let the text model invent style.** Given one gate description, DeepSeek volunteered
"cinematic composition, rich amber and deep violet sky, soft rim lighting". Ten images would
get ten invented styles and the book would look like five illustrators worked on it. Hence
`أسلوب_الصور`: the bridge translates the subject only and appends the author's style verbatim.

**Measured:** 5.5s per image (two sequential calls), 1,202,085 raw bytes → 10,440 bytes after
768px WebP. Image models cannot render Arabic script — tell authors to describe scenes, never
signs or writing.

**Not free.** No provider on the list has a free image tier. Text co-writing still works on
free text tiers, so **images must stay strictly optional and never appear in onboarding.**

⚠️ **Ollama and LM Studio do not work on the deployed site** — `http://localhost` is blocked
from an `https://` page (mixed content). They work only when running the editor locally. The
settings panel still offers them as if they work; that needs a note.

## 31 Jul 2026 — the bug sweep, mobile, and PWA install

An independent sweep found **15 measured bugs**; all 15 are fixed and verified on the live
site. The four that mattered:

- **Welded prose.** The renderer pushed every text node into one run and only flushed on an
  image or at the end, so N paragraphs always became one `<p>`. The JSON was always right —
  a paragraph boundary is two adjacent prose text nodes with nothing between them, and
  `{"value":null}` is a line break *inside* a paragraph. **Fixture 05_paragraphs is now the
  contract.** Deployed: `p.aq-text` = 2, no `<p>` contains `عليها."وصفة`.
- **`->` rendered as `<-`** on the landing page and all three docs pages. CSS cannot fix
  this — the isolate must wrap the whole run, so generators emit `<span dir="ltr">`. The
  CodeMirror plugin had the mirror-image bug: it isolated one character at a time, and two
  adjacent isolates get reordered by the RTL paragraph. Verified: 39 arrows, 0 wrong (was 32
  wrong of 39).
- **No line wrapping in the editor.** Now `white-space: break-spaces`; `cm-scroller`
  `clientWidth === scrollWidth` at every width. At 390px, wrapped lines measure 42px tall
  against 21px for unwrapped — that, not the equality, is the proof.
- **Two landing-page media queries were `@media(max-inline-size:…)`** — not a media feature,
  so they had never matched in any browser. That is why the `تكتب هذا` / `يصير هذا` pair never
  stacked on a phone.

**The Cloudflare beacon was on the zone, not the Pages project.** `web_analytics_tag` and
`web_analytics_token` were both null while `aqlamna.org` still served 2 beacon requests and
`aqlamna.pages.dev` served 0. It was `zones/…/settings/rum`. Now off — the privacy page's
"no tracking" wording is true, and it did not have to change.

**Phone editor** — one pane, three-tab bottom bar, `⋯` menu holding تصدير · قصة جديدة ·
افتح مثالًا · the three doc links. Top bar `scrollWidth` 390 / `clientWidth` 390 (was 592/390,
with ⬇ تصدير and ▶ شغّل sitting at negative x, i.e. off-screen).

**PWA install now works — and never had.** `sw.js` was a `.js` file full of TypeScript, so it
threw on every registration, and Chrome will not fire `beforeinstallprompt` without a live
worker. Scope was also `/editor/`, so the home page offered nothing. And the install button
set `color: var(--aq-accent-text)` — the editor's variable name, which does not exist in
`site/assets/aqlamna.css` — so the label inherited the dark ink and rendered at **1.29:1**.
An undefined custom property is not an error and does not warn. `DISTRIBUTION.md` has the
full account; `.codewhale/constitution` has the rules that came out of it.

⚠️ **`packages/editor/public/{sw.js,manifest.webmanifest}` are dead but still deployed at
`/editor/`** — the `sw.js` there still contains the TypeScript that threw. Delete them.

⚠️ **`scripts/lint-html.mjs` is untracked and `npm test` depends on it** (`package.json`
line 16 runs `lint:html` as the second step). A clean clone of the public repo fails
immediately. Commit it or drop it from the chain.

**486 tests green**, Playwright now runs as part of `npm test`. The harness was pointed at the
deployed site *before* the fixes and reproduced all four measurable bugs — it can fail.

## Brand

`brand/` — `logo-transparent.png` (823², background flood-filled and feathered),
`icon-{512,192,180,32,16}.png`, multi-res `favicon.ico`. Rim reads **aqlamna.org**.
⚠️ The medallion is illegible below ~192px — a simplified crossed-quills mark is still
needed for the favicon.

Open items:
- **Fonts:** the standalone export falls back to system Arabic fonts. Embedding
  IBM Plex Sans Arabic as base64 would blow the <100KB budget. Decide in Phase 3
  whether the export offers an optional font-embedding flag.
- Website: aqlamna.org, with `الرحيق.html` embedded as the live demo.
  **aqlamna.com must redirect to .org, and `www` must work on both.**

**4 fixtures** (01_minimal, 02_choices, 03_variables, 04_nesting). Fixture 04 was added
during review after a fourth hand-written story exposed three silent-corruption bugs:
multi-branch conditionals collapsing to raw prose, nested `**` choices flattening to
siblings, and only the first `= subsection` being emitted. Lesson: fixtures 01-03 were
too small to cover the language — write a new story by hand after every engine change.

Not yet pushed to GitHub. No npm package published.

## How we work — spec + verify

Humam owns the spec. CodeWhale (DeepSeek) writes the code. Claude verifies against the spec
and never builds the implementation.

**The fixture contract:** `packages/core/tests/fixtures/*.qalam` + `*.expected.json` are the
acceptance tests. **NOBODY edits them to make a test pass** — if a fixture fails, the code is
wrong. Checkpoint per step is a number, not an opinion: currently 3 fixtures failing; they turn
green at step 4 and that is when the language works.

Treat "I added tests" from any agent as a claim to check — assertions must exist and be able to
fail. A file that only `console.log`s is not a test.

## Golden rules

- Be thorough, not fast. One step per session. Don't jump ahead to the editor.
- **Don't hallucinate** IDs, numbers, or behaviour — verify by running it.
- RTL is the default, not a feature. CSS logical properties only.
- The runtime has **zero dependencies** — it must inline into one HTML file, no CDN.
- Parser errors carry a stable code + BOTH Arabic and English messages.
- Secrets never committed. `.gitignore` covers `*recovery_codes*`, `*.key`, `*.pem`, `.env`.
- `.codewhale/constitution` holds the same rules for CodeWhale — keep the two in sync.

## Gotchas (learned the hard way)

- **Always `cd C:\aqlamna` before `npx vitest run` / `npm test`.** Run from `C:\Users\asus`
  and vitest sweeps the whole home folder — 237 unrelated test files, and the turnstile-spin
  skill's `deploy.test.ts` fires real `wrangler deploy`/`delete` against the live Cloudflare
  account.
- `npm error code 1` at the end of `npm test` is EXPECTED until step 4 (fixtures failing).
- A stale `C:\aqlamna\.git\HEAD.lock` blocks all commits →
  `Remove-Item C:\aqlamna\.git\HEAD.lock`.
- `npm_recovery_codes.txt` was once committed here and scrubbed from history. Keep secrets
  out of this folder entirely.
- Mount can truncate large files mid-write — after big edits check byte count and that the
  file ends properly.

## Registrations

Nothing new needed for Phases 1-3. Existing env vars cover everything: `DEEPSEEK_API_KEY`
(Phase 4 AI drafting), `GITHUB_TOKEN`, `CLOUDFLARE_ACCOUNT_ID` + `CLOUDFLARE_API_TOKEN`
(deploy). Fonts (IBM Plex Sans Arabic, Noto Sans Arabic) are **self-hosted, not CDN**.
Supabase deliberately skipped — MVP stores projects in IndexedDB.
