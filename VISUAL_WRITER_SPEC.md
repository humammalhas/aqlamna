# Phase 4 — Visual Story Writer (Inklewriter-style)

**Priority:** This replaces Phase 2.3 (visual canvas editing) entirely.
**Owner:** Humam Malhas
**Date:** 2026-08-01

---

## Why

The code editor (قصتك tab / `CodeEditorPane.tsx`) is unusable for non-programmers.
The author of the product tried to use it and could not write a working story.
The problems:

1. Mixing LTR symbols (`===`, `->`, `~`, `{ }`) into RTL Arabic text is visually
   confusing — the brain reads two directions at once.
2. Indentation matters silently — a missing 2-space indent under a `*` choice causes
   the story to skip all choices with no error.
3. The condition syntax (`{variable: - condition: text}`) is unintuitive and
   undiscoverable. Even AI assistants could not produce correct syntax without
   reading the source code.
4. Variable declarations (`متغير`) and updates (`~`) require learning a programming
   language. The target audience is creative writers, not developers.

The existing code editor MUST remain available as an advanced/developer mode, but
it MUST NOT be the default experience. A new "Visual Writer" pane replaces it as
the primary authoring surface.

---

## What to build

An **inklewriter-style** story writer pane. The author writes prose and makes choices
through a form-like interface — no syntax, no symbols, no code visible.

### The model: write as you play

The writer pane looks like a vertical document. The author sees their story
unfolding as they write it, structured into **cards** stacked vertically:

```
┌─────────────────────────────────────┐
│  مشهد: البداية              [⋯]   │  ← scene title (editable, plain text)
│                                     │
│  [prose textarea]                   │  ← author types story text here,
│  أنت واقف أمام باب خشبي قديم.      │    plain Arabic, no symbols
│  الريح تهزّ الأغصان خلفك.           │
│                                     │
│  ┌─ خيار ────────────────────────┐ │
│  │ اطرق الباب                    │ │  ← choice label (plain text input)
│  │ ينقلك إلى: [الداخل      ▾]   │ │  ← dropdown of existing scenes
│  │ عند الاختيار: [+ أضف أثرًا ▾] │ │  ← optional: tag/consequence
│  │ يختفي بعد اختياره: [✓]        │ │  ← checkbox: * (once) vs + (sticky)
│  └───────────────────────────────┘ │
│  ┌─ خيار ────────────────────────┐ │
│  │ ابتعد                         │ │
│  │ ينقلك إلى: [النهاية     ▾]   │ │
│  └───────────────────────────────┘ │
│                                     │
│  [+ أضف خيارًا]                    │  ← button to add another choice
│                                     │
└─────────────────────────────────────┘

┌─────────────────────────────────────┐
│  مشهد: الداخل               [⋯]   │
│                                     │
│  [prose textarea]                   │
│  غرفة مظلمة. رائحة بخور قديم.      │
│                                     │
│  ┌─ نص مشروط ────────────────────┐ │  ← conditional text block
│  │ اعرض هذا النص:                │ │
│  │ [أنت شجاع بما يكفي لتبقى.]   │ │
│  │ فقط إذا: [شجاع        ▾] ✓   │ │  ← tag must be present
│  └───────────────────────────────┘ │
│  ┌─ نص مشروط ────────────────────┐ │
│  │ [ندمت أنّك دخلت.]             │ │
│  │ فقط إذا: [شجاع        ▾] ✗   │ │  ← tag must be ABSENT
│  └───────────────────────────────┘ │
│                                     │
│  ينتقل تلقائيًا إلى: [النهاية ▾]  │  ← auto-divert (no choices here)
│                                     │
│  [+ أضف خيارًا] [+ أضف نصًا مشروطًا] │
└─────────────────────────────────────┘
```

### Key principles

1. **No syntax anywhere.** The author never types `===`, `->`, `~`, `*`, `+`,
   `{ }`, or any operator. Every structural element is a form field, a button,
   a dropdown, or a checkbox.

2. **Pure Arabic interface.** Every label, button, placeholder is Arabic.
   No English, no code, no LTR symbols in the authoring surface.

3. **Scene = card.** A scene is a visually distinct card. The scene title is a
   plain text input at the top. A button at the bottom of the page adds a new
   scene card. Scenes can be reordered by drag-and-drop.

4. **Choice = sub-card inside a scene.** Each choice has:
   - A label (what the reader clicks)
   - A destination (dropdown of scene names, or "+ مشهد جديد" to create one)
   - An optional tag to SET when chosen (dropdown of existing tags, or type new)
   - An optional tag REQUIRED to see this choice (dropdown + present/absent toggle)
   - A "one-time" checkbox (maps to `*` vs `+`)
   - Optional prose text shown after choosing (before the divert)

5. **Tags replace variables for simple stories.** A tag is just a named flag
   (boolean). No numbers, no math. The author creates a tag by typing a name
   the first time they use it (e.g. "شجاع"). Tags are either present or absent.
   Under the hood, each tag compiles to `متغير TAG = خطأ` and the choice that
   sets it compiles to `~ TAG = صح`.

6. **Counters for advanced stories.** A small "+ أضف عدّادًا" button in a sidebar
   panel lets the author create a named counter (e.g. المكوّنات, starts at 0).
   When a counter exists, choices gain an additional option: "أضف 1 إلى [counter]".
   Conditional text and conditional choices gain: "[counter] أكبر من أو يساوي [N]".
   This compiles to `متغير`, `~`, and `{>=}` as before.
   **Counters are in a collapsible "advanced" section — not shown by default.**

7. **Conditional text = a block with a condition.** An "أضف نصًا مشروطًا" button
   inside a scene card adds a text block with a condition dropdown. The author
   picks a tag (present/absent) or a counter comparison. The text only appears
   for readers who match. This compiles to `{tag: text.}` or the multi-branch
   `{counter: - counter >= N: text. - غير_ذلك: text.}` syntax.

8. **The writer pane generates `.qalam` source.** On every change, the writer
   pane serialises its state into valid `.qalam` source text and calls
   `store.loadSource(generated)`. The store compiles it, and the player pane
   and canvas pane update exactly as they do now. This means:
   - Export (⬇ تصدير) works unchanged
   - Play (▶ شغّل) works unchanged
   - Canvas (مخطط) works unchanged
   - AI co-writing (✨ اكتب معي) needs adaptation (see below)
   - The Arabic quality linter runs on the generated source as before

---

## Architecture

```
  ┌──────────────┐        ┌────────────┐
  │ Visual Writer│──────→ │  .qalam    │──→ store.loadSource()
  │ (new pane)   │ generate│  source    │    ↓
  └──────────────┘        └────────────┘    compile()
                                             ↓
                              ┌──────────────────────┐
                              │   StoryJSON           │
                              ├───────┬───────┬──────┤
                              │Player │Canvas │Export│
                              │ pane  │ pane  │      │
                              └───────┴───────┴──────┘
```

### State model

The writer pane holds its own state (React state or a Zustand slice):

```typescript
interface WriterState {
  title: string;          // عنوان
  author: string;         // مؤلف
  scenes: Scene[];
  tags: string[];         // all tag names used in the story
  counters: Counter[];    // { name: string, initial: number }
}

interface Scene {
  id: string;
  title: string;          // scene name (used as passage name)
  prose: string;          // plain text content
  choices: Choice[];
  conditionalTexts: ConditionalText[];
  autoDivert?: string;    // if no choices, where does the story go?
  isEnding: boolean;      // if true, compiles to `-> نهاية`
}

interface Choice {
  id: string;
  label: string;          // button text the reader sees
  destination: string;    // scene title to divert to
  proseAfter?: string;    // text shown after choosing, before divert
  setTag?: string;        // tag to set when chosen
  requireTag?: { tag: string; present: boolean };  // tag gate
  requireCounter?: { counter: string; op: string; value: number };
  consumable: boolean;    // true = *, false = +
  addToCounter?: { counter: string; amount: number };
}

interface ConditionalText {
  id: string;
  text: string;
  condition: TagCondition | CounterCondition;
}
```

### .qalam generation

A pure function `generateQalam(state: WriterState): string` converts the state
into valid .qalam source. This function must produce EXACTLY the syntax that
the existing parser accepts — specifically:

- `عنوان: "title"` and `مؤلف: "author"` at the top
- `متغير TAG = خطأ` for each tag
- `متغير COUNTER = N` for each counter
- Blank line before each `=== scene_title ===`
- Prose text as-is (no escaping needed — it's plain text)
- Conditional text as `{tag: text.}` or `{لا tag: text.}` or the multi-branch
  `{counter: - counter >= N: text. - غير_ذلك: text.}` form
- `* [label]` with 2-space-indented content for consumable choices
- `+ [label]` with 2-space-indented content for sticky choices
- `+ {tag} [label]` or `+ {لا tag} [label]` for gated choices
- `+ {counter >= N} [label]` for counter-gated choices
- `  ~ tag = صح` under a choice that sets a tag (2-space indent)
- `  ~ counter = counter + N` under a choice that increments (2-space indent)
- `  -> destination` under each choice (2-space indent)
- `-> نهاية` for ending scenes
- `-> scene_title` for auto-diverts

**Test the generator by round-tripping:** generate the .qalam, compile it with
`@aqlamna/core`, and verify it produces valid StoryJSON. Write a test that
takes a WriterState, generates .qalam, compiles it, and asserts no errors.

Write a second test that generates .qalam from the العطر_المفقود story's
structure and compiles successfully. This proves the generator handles every
feature the sample story uses.

---

## What stays the same

- **`@aqlamna/core`** (parser, compiler, errors) — untouched.
- **`@aqlamna/runtime`** — untouched.
- **`@aqlamna/linter`** — untouched. It runs on the generated .qalam source.
- **Player pane** (`PlayerPane.tsx`) — untouched.
- **Canvas pane** (`CanvasPane.tsx`) — untouched. It reads from compiled JSON.
- **Export** (`export-html.ts`) — untouched. It reads from compiled JSON.
- **Settings panel** (`SettingsPanel.tsx`) — untouched.
- **IndexedDB storage** (`db.ts`) — still saves .qalam source. The writer pane
  generates .qalam → store saves it → on reload, the writer pane parses it back
  into WriterState. (See "round-trip" below.)
- **Top bar** — keep all buttons. The three tabs become: **قصتك** (visual writer,
  default), **شغّل** (player), **مخطط** (canvas).
- **Error strip** — still shows compile errors. In the visual writer, compile
  errors should be rare (the UI prevents most syntax errors), but if a tag name
  collides with a keyword, or a scene has no destination, the error appears.

## What changes

- **`CodeEditorPane.tsx`** — renamed to `CodeEditorPane.tsx` (kept as-is) but no
  longer the default. Accessible via الإعدادات → "وضع المحرر: متقدم" toggle.
  When toggled on, the قصتك tab shows the CodeMirror editor instead of the
  visual writer. Changes in one sync to the other via the .qalam source:
  - Visual writer → generates .qalam → CodeMirror shows it
  - CodeMirror edit → parses back to WriterState → visual writer shows it
  This two-way sync is HARD. For Phase 4.0, make it one-way only: visual writer
  generates .qalam, and switching to code mode is a one-way door (warns that
  going back to visual mode may lose formatting). Phase 4.1 can add round-trip.

- **AI co-writing** (`ai.ts`, `AIActions.tsx`) — the three AI actions currently
  insert .qalam code into the CodeMirror editor. For the visual writer:
  - "أكمل المشهد" → AI generates prose → inserted into the current scene's
    prose textarea.
  - "اقترح خيارات" → AI generates choices → added as choice sub-cards.
  - "اكتب هذا المقطع" → AI generates a full scene → added as a new scene card.
  The AI system prompt still includes `ARABIC_MASTERY.md` via the build step.
  The AI still returns .qalam code; the writer pane parses it into its state.

- **Onboarding overlay** — should guide the user through the visual writer, not
  the code editor.

---

## Round-trip: loading saved .qalam back into the writer

When the editor loads, it reads saved .qalam source from IndexedDB. The visual
writer needs to reconstruct its `WriterState` from this source. Options:

**Option A (recommended for Phase 4.0):** Use `@aqlamna/core`'s compiled JSON
(which has passages, choices, variables, conditions already structured) and map
it back to WriterState. The compiled JSON is a faithful representation of the
source. This avoids writing a second parser.

**Option B:** Write a .qalam → WriterState parser. More work, more bugs. Defer.

**Edge case:** If someone edits the .qalam source directly (in code mode) and
uses features the visual writer doesn't support (e.g. inline interpolation
`{المكوّنات}`, nested choices, tunnels), the visual writer can't represent it.
Show a message: "هذه القصة تحتوي عناصر متقدمة. استخدم المحرر النصي." and fall
back to code mode. Don't silently lose features.

---

## UI specifications

### RTL and Arabic

- The entire writer pane is `direction: rtl`.
- All labels, placeholders, buttons, and dropdowns are in Arabic.
- No LTR symbols anywhere in the authoring surface.
- Scene titles and prose textareas use the same font as the player pane (not
  monospace — this is writing, not coding).
- Use CSS logical properties only (inline-start, block-end, etc.).

### Responsive

- **Desktop:** the writer pane is one of the 1-3 pane grid, same as CodeEditorPane.
- **Phone:** the writer pane is full-screen with the bottom tab bar (قصتك / شغّل / مخطط).
  Scene cards stack vertically and scroll. Choices are collapsible to save space.

### Colors and theming

- Scene cards: same cream/paper background as the editor.
- Choice sub-cards: slightly inset, lighter background.
- Conditional text blocks: faint colored border (blue) to distinguish from prose.
- Ending scenes: faint red border (matching canvas end-node color).
- Starting scene (first scene): faint green border (matching canvas start-node).
- Respect the existing light/dark theme toggle.

### Interactions

- **Add scene:** button at the bottom of the page → creates a new card with an
  auto-generated title ("مشهد ٢", "مشهد ٣", ...) that the author can rename.
- **Add choice:** button inside a scene card → adds a choice sub-card.
- **Add conditional text:** button inside a scene card → adds a conditional block.
- **Delete scene/choice:** ⓧ button with confirmation.
- **Reorder scenes:** drag handle on the scene card header.
- **Mark as ending:** checkbox on the scene card → adds `-> نهاية`.
- **Scene destination dropdown:** lists all scene titles + "مشهد جديد" option
  that creates a new scene and selects it in one click.
- **Tag dropdown:** lists all existing tags + "أثر جديد" to type a new one.
  Tags are displayed as colored chips/badges.

---

## Files to read before starting

1. `CLAUDE.md` — project status, architecture, every bug ever found.
2. `ARABIC_MASTERY.md` — Arabic quality corpus. Rule Zero applies: read it
   before writing any Arabic UI strings.
3. `PHASE1_SPEC.md` — the .qalam language spec. You MUST generate valid .qalam.
4. `ARABIC_IF_ENGINE_DESIGN.md` — overall architecture.
5. `packages/editor/src/store.ts` — Zustand store, how source flows through.
6. `packages/editor/src/components/CodeEditorPane.tsx` — what you're replacing.
7. `packages/editor/src/App.tsx` — pane layout system.
8. `packages/editor/src/lib/ai.ts` — AI integration.
9. `stories/العطر_المفقود.qalam` — the sample story. Your generator must be
   able to produce code that compiles identically to this story's structure.
10. `packages/core/src/parser/parser.ts` — if you need to understand what
    .qalam syntax the parser actually accepts (not what you assume).
11. `.codewhale/constitution` — every rule about how to verify work in this repo.

---

## What NOT to do

- Do not touch `@aqlamna/core`, `@aqlamna/runtime`, or `@aqlamna/linter`.
- Do not change the .qalam language or add new syntax.
- Do not remove the code editor — keep it as an advanced mode.
- Do not break export, play, or canvas.
- Do not skip the round-trip test: generate .qalam → compile → assert no errors.
- Do not invent Arabic UI labels without reading ARABIC_MASTERY.md first.
- Do not add any new npm dependencies to the runtime (it has zero dependencies).
  The editor may add dependencies if absolutely necessary (prefer React + Zustand
  which are already present, and @dnd-kit for drag-and-drop if needed).

---

## Definition of done

1. A new user opens aqlamna.org/editor/ and sees the visual writer (not code).
2. They can write the العطر_المفقود story structure using only the visual writer
   — no typing of symbols, no code.
3. They press شغّل and the story plays correctly.
4. They press تصدير and get a working standalone HTML file.
5. The مخطط tab shows the correct story map.
6. Switching to code mode (in settings) shows the generated .qalam source.
7. Loading a previously saved story (from IndexedDB) populates the visual writer.
8. All existing tests pass (`npm test`).
9. New tests verify the .qalam generator produces valid, compilable code.
