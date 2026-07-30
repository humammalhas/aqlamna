# أقلامنا / Aqlamna — Arabic Interactive Fiction Engine

Al-Maseer product. Open source **GPL-3.0**, public repo (Maskan model).
Domains **aqlamna.org** (primary) + **aqlamna.com** (redirect) — both registered.
npm scope **@aqlamna** reserved (org created, account `humammalhas`, 2FA on).
Started 2026-07-30.

**➜ Read `ARABIC_IF_ENGINE_DESIGN.md` for the full design. Read `PHASE1_SPEC.md` for
what "done" means and every spec decision. Those two are the authority — keep THIS file slim.**

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
- ⏳ Step 3 — parser → AST
- ⬜ Steps 4-7 — compiler · errors · runtime · standalone export

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
