# Aqlamna Documentation

Arabic-first documentation for the Aqlamna interactive fiction engine.
All guides are written in Arabic, targeting teachers and authors who have
never programmed.

## Guides

| Document | Description |
|----------|------------|
| [البداية.md](./البداية.md) | Step-by-step tutorial. Builds a three-scene story in the **visual writer** — cards, fields and dropdowns, no syntax at all. The generated `.qalam` appears once, at the end, under "الوضع المتقدّم". |
| [المرجع.md](./المرجع.md) | Complete `.qalam` language reference — the advanced mode. Opens with a table mapping every field in the visual writer to what it generates, so the two can be read against each other. |
| [الأخطاء.md](./الأخطاء.md) | Error code reference — every E101–E203 with the exact Arabic message, what causes it, and how to fix it. Messages match the compiler output verbatim. Opens by saying these are rare in the visual writer, and what it shows instead. |

All three address the reader in the **masculine**, matching the landing page and
the editor. They were feminine until 1 Aug 2026, so a visitor read `اكتب قصتك`,
clicked البداية, and got `دليلكِ الأول` — one click, two voices.

## For Developers

These docs are in Arabic because the product's primary audience is
Arabic-speaking authors and educators. If you're a developer working on
Aqlamna itself, see:

- `CLAUDE.md` — project overview and working conventions
- `ARABIC_IF_ENGINE_DESIGN.md` — full engine design
- `PHASE1_SPEC.md` — phase 1 specification and acceptance criteria

The docs are linked from the editor's help menu (❓ button in the top bar).
