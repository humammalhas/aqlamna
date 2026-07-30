# Arabic Interactive Fiction Engine — Design Document

**Project name:** Aqlamna (أقلامنا) — "Our Pens"
**Domains:** aqlamna.org (primary) · aqlamna.com (redirects to .org) — both registered
**License:** GPL-3.0 (matching Maskan)
**Version:** 0.1 (MVP Design)
**Date:** 2026-07-30
**Author:** Humam Malhas

---

## 1. Vision

The first interactive fiction engine built for Arabic from the ground up — not a translation layer on top of an English tool. Think "Twine + Ink, but Arabic-native." A visual node editor that generates a readable scripting language, compiling to playable stories in the browser.

**Why this matters:** 400M+ Arabic speakers, <1% of internet content is Arabic, and exactly ONE Arabic text-based game exists on itch.io. Every existing IF tool (Twine, Ink, Inform7, Ren'Py) is English-only in both authoring and runtime. No IF tool handles RTL natively — authors must hack around it.

**What makes Aqlamna different:**
- RTL-first architecture (not RTL-patched)
- Arabic scripting language keywords (with English aliases)
- ARABIC_MASTERY.md integrated as a linting/quality system for AI-assisted story generation
- Visual node editor AND a text scripting language — same story, two views
- Export as standalone HTML — no server needed to play
- Designed for three audiences: creative writers, educators, and game developers

---

## 2. Architecture Overview

```
┌─────────────────────────────────────────────────┐
│                  Aqlamna Platform                  │
├──────────────┬──────────────┬───────────────────┤
│  Visual      │  Script      │  Story            │
│  Editor      │  Editor      │  Player           │
│  (node graph)│  (.qalam)    │  (runtime)        │
├──────────────┴──────────────┴───────────────────┤
│              Aqlamna Core Engine                   │
│  ┌──────────┬───────────┬──────────┬──────────┐ │
│  │ Parser   │ Compiler  │ Runtime  │ Exporter │ │
│  │(.qalam → │(AST →     │(plays    │(→ HTML,  │ │
│  │ AST)     │ JSON)     │ JSON)    │  JSON)   │ │
│  └──────────┴───────────┴──────────┴──────────┘ │
├─────────────────────────────────────────────────┤
│              Data Layer                          │
│  ┌──────────┬───────────┬──────────────────────┐│
│  │ Project  │ Story     │ Arabic Quality       ││
│  │ Store    │ Format    │ Linter               ││
│  │ (JSON)   │ (JSON)    │ (ARABIC_MASTERY.md)  ││
│  └──────────┴───────────┴──────────────────────┘│
└─────────────────────────────────────────────────┘
```

### Component Responsibilities

| Component | What it does |
|-----------|-------------|
| **Visual Editor** | Canvas-based node graph. Authors create passages as cards, draw connections between them. Full drag/drop, zoom/pan. Generates .qalam script behind the scenes. |
| **Script Editor** | Text editor with syntax highlighting for the .qalam scripting language. Changes sync bidirectionally with the visual editor. |
| **Parser** | Reads .qalam text → produces an AST (abstract syntax tree). Handles Arabic Unicode, RTL, mixed bidi text. |
| **Compiler** | AST → story JSON format. Validates structure, reports errors in Arabic. |
| **Runtime** | Plays compiled JSON. Manages state (variables, visited passages, inventory). Renders passages with choices. |
| **Exporter** | Bundles runtime + story JSON into a single standalone HTML file. Also exports to JSON, Twine-compatible format. |
| **Arabic Quality Linter** | Optional — flags AI anti-patterns from ARABIC_MASTERY.md in story text. Useful when authors use AI to draft passages. |

---

## 3. The Aqlamna Scripting Language (.qalam)

### 3.1 Design Principles

1. **Prose-first** — most lines are story text printed directly. Code is the exception, marked with symbols.
2. **Symbol-based markup** — uses `===`, `*`, `->`, `~` like Ink. Symbols are language-neutral.
3. **Arabic keyword aliases** — every keyword has both an Arabic and English form. `متغير x = 5` and `VAR x = 5` are identical.
4. **UTF-8 throughout** — passage names, variable names, everything can be Arabic.
5. **RTL-aware** — parser handles bidi text, Arabic punctuation (،؟؛), and tashkeel (diacritics) correctly.

### 3.2 Full Syntax Reference

#### Passages (مقاطع)

Passages are the fundamental unit — a chunk of text the reader sees. Defined with `===`:

```
=== غرفة_النوم ===

تستيقظ في غرفة مظلمة. ضوء خافت يتسلل من تحت الباب.
يمكنك سماع أصوات غريبة من الخارج.
```

Passages can have sub-sections (like Ink's stitches), defined with `=`:

```
=== المنزل ===

= غرفة_النوم
تستيقظ في غرفة مظلمة.

= المطبخ
رائحة القهوة تملأ المكان.
```

Reference sub-sections as `المنزل.غرفة_النوم`.

#### Choices (خيارات)

Choices use `*` (consumed after first use) or `+` (sticky, always available):

```
=== الباب ===

تقف أمام الباب المغلق.

* [افتح الباب] فتحت الباب ببطء...
  -> الممر

* [اطرق على الباب] طرقت بقوة. لا إجابة.
  -> الباب.لا_إجابة

+ [عُد للغرفة] قررت العودة.
  -> غرفة_النوم
```

Text inside `[ ]` is what the reader sees as a clickable choice. Text after `]` is what appears when they click. If no `[ ]`, the entire line is both the choice text and the result.

Nested choices:

```
* [افتح الباب]
  الباب مقفل.
  ** [ابحث عن المفتاح] وجدت المفتاح تحت السجادة.
     -> الممر
  ** [اكسر الباب] الباب متين جداً. لم ينكسر.
     -> الباب
```

#### Diverts (تحويلات)

`->` moves to another passage:

```
-> غرفة_النوم           // go to passage
-> المنزل.المطبخ        // go to sub-section
-> نهاية                // go to ending
```

Special diverts:
```
-> نهاية    // END — story ends (Arabic alias)
-> END      // same thing in English
-> تابع     // DONE — current section ends, returns to caller (Arabic)
-> DONE     // same in English
```

#### Variables (متغيرات)

Declare with `متغير` (or `VAR`):

```
متغير الشجاعة = 0
متغير اسم_البطل = "سارة"
متغير وجد_المفتاح = خطأ
متغير عدد_المحاولات = 3
```

Modify with `~`:

```
~ الشجاعة = الشجاعة + 1
~ وجد_المفتاح = صح
~ عدد_المحاولات = عدد_المحاولات - 1
```

Boolean values: `صح` / `خطأ` (Arabic) or `true` / `false` (English).

#### Conditionals (شروط)

Inline conditionals with `{ }`:

```
{وجد_المفتاح: أخرجت المفتاح من جيبك وفتحت الباب.}
{لا وجد_المفتاح: الباب مقفل. تحتاج مفتاحاً.}
```

Multi-branch:

```
{الشجاعة:
  - الشجاعة < 3: ترتجف خوفاً.
  - الشجاعة < 7: تتردد لحظة ثم تتقدم.
  - غير_ذلك: تندفع بلا تردد.
}
```

English aliases: `غير_ذلك` = `else`.

Conditional choices:

```
* {وجد_المفتاح} [افتح الباب بالمفتاح]
  -> الممر
* {لا وجد_المفتاح} [حاول كسر القفل]
  ~ عدد_المحاولات = عدد_المحاولات - 1
  -> الباب
```

#### Tags (وسوم)

Metadata attached to passages or lines:

```
=== المعركة === #مشهد_أكشن #موسيقى_حماسية

النص هنا. #تأخير_بطيء
```

Reserved tags:
- `#صورة:اسم_الملف.png` — display an image
- `#صوت:اسم_الملف.mp3` — play audio
- `#خلفية:لون_أو_صورة` — set background
- `#كاتب:الاسم` — author credit (for multi-author stories)
- `#تأخير:ثوانٍ` — delay before showing text (typewriter effect)

#### Functions (دوال)

Functions are defined like passages but with the `دالة` keyword after `===`:

```
=== دالة حساب_المكافأة(النقاط) ===
  {النقاط:
    - النقاط >= 10: ~ عائد = "ذهبية"
    - النقاط >= 5: ~ عائد = "فضية"
    - غير_ذلك: ~ عائد = "برونزية"
  }
  ->->
```

**Parser rule:** `=== دالة` distinguishes a function from a passage. Functions end with `->->` (return to caller). The special variable `عائد` holds the return value.

Call a function and use its return value:

```
~ المكافأة = حساب_المكافأة(الرحيق)
حصلت على ميدالية {المكافأة}!
```

**Built-in functions:**

| Function | Signature | Returns |
|----------|-----------|---------|
| `عشوائي(ن)` | `عشوائي(max: number)` | Random integer from 0 to max-1 (inclusive). Uniform distribution. |
| `عشوائي(أ، ب)` | `عشوائي(min: number, max: number)` | Random integer from min to max (inclusive). |
| `زار(مقطع)` | `زار(passage_name: string)` | `صح` if the player has visited the named passage, `خطأ` otherwise. |
| `عدد_الزيارات(مقطع)` | `عدد_الزيارات(passage_name: string)` | Integer: number of times the player has entered the named passage. |
| `طول(نص)` | `طول(text: string)` | Integer: number of characters in the string. |

#### Lists / Enums (قوائم)

For tracking states (like Ink's lists):

```
قائمة حالة_الباب = (مغلق)، مفتوح، مكسور
قائمة المخزون = (لا_شيء)، مفتاح، سكين، مصباح
```

```
~ حالة_الباب = مفتوح
{حالة_الباب == مغلق: الباب مقفل.}
```

#### Tunnels (أنفاق)

Reusable passages that return to where they were called from:

```
-> وصف_الغرفة ->

=== وصف_الغرفة ===
الغرفة واسعة ذات سقف عالٍ. الجدران مزينة بنقوش عربية.
->->
```

`->->` means "return to caller" (like Ink's `->->`).

#### Threads (خيوط)

Pull content from multiple passages into one:

```
=== السوق ===

الأصوات تملأ المكان والبائعون ينادون على بضائعهم.

<- بائع_الفاكهة
<- بائع_التوابل

=== بائع_الفاكهة ===
* [تحدث مع بائع الفاكهة]
  -> حوار_الفاكهة

=== بائع_التوابل ===
* [تحدث مع بائع التوابل]
  -> حوار_التوابل
```

#### Variable Interpolation (إدراج المتغيرات)

Curly braces with NO colon = interpolation (insert variable value into text):

```
جمعتِ {الرحيق} قطرة من الرحيق.
اسمك هو {اسم_البطل}.
```

Curly braces WITH a colon = conditional (test a condition):

```
{وجد_المفتاح: المفتاح في جيبك.}
```

**Parser rule:** `{` followed by any expression then `:` → conditional. `{` followed by a variable name then `}` (no colon) → interpolation.

#### Negation and Logical Operators

- `لا` (not) is ONLY recognized as an operator when it immediately precedes a variable name inside `{ }` or a choice condition. In prose text, `لا` is just the word "no."
- Parser rule: `لا` is a keyword ONLY inside `{ }` blocks and `*`/`+` choice conditions. Outside these contexts, it's plain text.

#### Expressions and Operators

**Comparison operators:** `==`, `!=` (or `≠`), `<`, `>`, `<=` (or `≤`), `>=` (or `≥`)

**Arithmetic operators:** `+`, `-`, `*`, `/`, `%` (mod)

**Logical operators:** `و` (and), `أو` (or), `لا` (not) — English aliases: `and`, `or`, `not`

**String concatenation:** `+` when both operands are strings.

**Operator precedence (high to low):**
1. `لا` / `not` (unary)
2. `*`, `/`, `%`
3. `+`, `-`
4. `<`, `>`, `<=`, `>=`
5. `==`, `!=`
6. `و` / `and`
7. `أو` / `or`

Parentheses `( )` override precedence.

#### Comments (تعليقات)

```
// هذا تعليق لسطر واحد (لا يظهر للقارئ)

/* هذا تعليق
   متعدد الأسطر */
```

#### Includes (تضمينات)

```
تضمين الشخصيات.qalam
تضمين الفصل_الأول.qalam
```

English: `INCLUDE characters.qalam`

### 3.3 Complete Keyword Reference

| Arabic | English | Purpose |
|--------|---------|---------|
| `متغير` | `VAR` | Declare a variable |
| `ثابت` | `CONST` | Declare a constant |
| `صح` | `true` | Boolean true |
| `خطأ` | `false` | Boolean false |
| `غير_ذلك` | `else` | Else branch |
| `لا` | `not` | Logical NOT |
| `و` | `and` | Logical AND |
| `أو` | `or` | Logical OR |
| `نهاية` | `END` | End the story |
| `تابع` | `DONE` | End current section |
| `قائمة` | `LIST` | Declare a list/enum |
| `تضمين` | `INCLUDE` | Include another file |
| `دالة` | `function` | Define a function |
| `رجوع` | `return` | Return from function |
| `عائد` | `result` | Return value |

---

## 4. Story Data Format (JSON)

The compiler produces this JSON. The runtime consumes it. Export bundles it into standalone HTML.

```json
{
  "qalam_version": "0.1",
  "title": "لصّ القصر",
  "author": "سارة أحمد",
  "language": "ar",
  "direction": "rtl",
  "start": "البداية",
  
  "variables": {
    "الشجاعة": { "type": "number", "initial": 0 },
    "وجد_المفتاح": { "type": "boolean", "initial": false },
    "اسم_البطل": { "type": "string", "initial": "سارة" }
  },
  
  "lists": {
    "حالة_الباب": {
      "values": ["مغلق", "مفتوح", "مكسور"],
      "initial": "مغلق"
    }
  },
  
  "passages": {
    "البداية": {
      "tags": ["مشهد_أول"],
      "content": [
        { "type": "text", "value": "تستيقظ في غرفة مظلمة." },
        { "type": "text", "value": "ضوء خافت يتسلل من تحت الباب." },
        {
          "type": "conditional",
          "condition": { "var": "وجد_المفتاح", "op": "==", "value": true },
          "then": [{ "type": "text", "value": "المفتاح في جيبك." }],
          "else": []
        },
        {
          "type": "choices",
          "items": [
            {
              "id": "choice_1",
              "label": "افتح الباب",
              "sticky": false,
              "condition": null,
              "content": [
                { "type": "text", "value": "فتحت الباب ببطء..." }
              ],
              "divert": "الممر"
            },
            {
              "id": "choice_2",
              "label": "ابحث في الغرفة",
              "sticky": false,
              "condition": null,
              "content": [
                { "type": "set", "var": "وجد_المفتاح", "value": true },
                { "type": "text", "value": "وجدت مفتاحاً تحت الوسادة." }
              ],
              "divert": "البداية"
            }
          ]
        }
      ]
    },
    "الممر": {
      "tags": [],
      "content": [
        { "type": "text", "value": "ممر طويل مظلم يمتد أمامك." },
        { "type": "divert", "target": "نهاية_الفصل" }
      ]
    }
  },
  
  "metadata": {
    "created": "2026-07-30T00:00:00Z",
    "modified": "2026-07-30T00:00:00Z",
    "word_count": 1250,
    "passage_count": 15,
    "description": "مغامرة تفاعلية في قصر قديم",
    "genre": "مغامرة",
    "age_rating": "عام"
  }
}
```

### 4.1 Condition Object Schema

Conditions used in `conditional` nodes and choice conditions follow this schema:

```json
// Simple boolean variable check
{ "var": "وجد_المفتاح" }

// Comparison
{ "var": "الشجاعة", "op": ">=", "value": 5 }

// Negation
{ "not": { "var": "وجد_المفتاح" } }

// Compound (AND)
{ "and": [
  { "var": "وجد_المفتاح" },
  { "var": "الشجاعة", "op": ">=", "value": 3 }
]}

// Compound (OR)
{ "or": [
  { "var": "حالة_الباب", "op": "==", "value": "مفتوح" },
  { "var": "وجد_المفتاح" }
]}
```

Valid `op` values: `"=="`, `"!="`, `"<"`, `">"`, `"<="`, `">="`. If `op` is omitted, the condition checks truthiness (non-zero number, non-empty string, `true`).

### 4.2 Content Node Types

| Type | Fields | Description |
|------|--------|-------------|
| `text` | `value` | Plain text to display |
| `choices` | `items[]` | Array of choice objects |
| `conditional` | `condition`, `then`, `else` | If/else branching |
| `set` | `var`, `value`, `op` (optional) | Set or modify a variable. `op`: `"="` (assign), `"+="`, `"-="`, `"*="`, `"/="`. If `op` is omitted, defaults to `"="`. |
| `divert` | `target` | Jump to another passage |
| `tag` | `name`, `value` | Inline tag (image, sound, etc.) |
| `tunnel` | `target` | Call a passage; execution returns here when the tunnel hits `->->` |
| `thread` | `targets[]` | Pull choices from multiple passages into current passage |
| `call` | `function`, `args[]`, `result_var` | Call a function, store return value in `result_var` |
| `interpolation` | `var` | Insert variable's current value into text output |

---

## 5. Visual Editor Design

### 5.1 Layout

```
┌──────────────────────────────────────────────────────┐
│  ● ● ●  أقلامنا — لصّ القصر                [▶ شغّل] │
├────────┬─────────────────────────────┬───────────────┤
│        │                             │               │
│ شجرة   │      لوحة المقاطع           │  محرر المقطع  │
│ القصة  │      (Canvas)              │               │
│        │   ┌─────┐    ┌─────┐       │  عنوان: ___   │
│ البداية│   │البداي│───▸│الممر │       │               │
│  الممر │   │ ة   │    │     │       │  [محرر نصي]   │
│  النهاي│   └──┬──┘    └──┬──┘       │               │
│   ة   │      │          │          │  خيارات:      │
│        │   ┌──▾──┐    ┌──▾──┐      │  + أضف خياراً │
│        │   │الغرفة│   │النهاي│      │               │
│        │   │     │    │ ة   │      │  متغيرات:     │
│        │   └─────┘    └─────┘      │  الشجاعة: 0   │
│        │                           │               │
├────────┴─────────────────────────────┴───────────────┤
│  [محرر النص]  |  [المحرر المرئي]  |  [المتغيرات]    │
└──────────────────────────────────────────────────────┘
```

### 5.2 Core Interactions

**Canvas (center panel):**
- Passage cards rendered as rounded rectangles with Arabic title + preview text
- Connections drawn as curved arrows between cards
- Drag to reposition cards
- Double-click card to edit in side panel
- Right-click for context menu (delete, duplicate, set as start)
- Scroll wheel to zoom, click-drag on background to pan
- All text rendered RTL; connections respect RTL reading flow

**Passage cards show:**
- Title (bold, top)
- First ~50 characters of body text (preview)
- Color-coded border: green = start, red = ending, blue = normal, orange = has conditions
- Small icons: 🔑 has variables, 🔀 has conditions, 📷 has media tags
- Choice count badge

**Side panel (right):**
- Rich text area for passage content (with .qalam syntax highlighting)
- Drag-and-drop choice reordering
- Variable inspector (shows current values during test play)
- Tag editor

**Tree panel (left):**
- Hierarchical list of all passages
- Drag to reorder
- Search/filter
- Right-click to create/delete

### 5.3 Bidirectional Sync

The visual editor and script editor show the same story in two representations. Changes in one immediately reflect in the other:

```
Visual Editor ←→ In-memory AST ←→ Script Editor (.qalam text)
                      ↓
               Compiler → Story JSON → Player
```

The AST is the source of truth. Both editors read from and write to it. The compiler is a one-way transform from AST to playable JSON.

---

## 6. Story Player (Runtime)

### 6.1 Player UI

```
┌──────────────────────────────────────┐
│                                      │
│         لصّ القصر                    │
│                                      │
│  تستيقظ في غرفة مظلمة.              │
│  ضوء خافت يتسلل من تحت الباب.       │
│  يمكنك سماع أصوات غريبة من الخارج.  │
│                                      │
│  ┌────────────────────────────────┐  │
│  │       ▸ افتح الباب             │  │
│  ├────────────────────────────────┤  │
│  │       ▸ ابحث في الغرفة        │  │
│  ├────────────────────────────────┤  │
│  │       ▸ عُد للنوم              │  │
│  └────────────────────────────────┘  │
│                                      │
│  [⟲ أعد] [📖 حفظ] [⚙ إعدادات]      │
│                                      │
└──────────────────────────────────────┘
```

### 6.2 Runtime Features

**Core:**
- State machine: tracks current passage, variable values, visited passages, consumed choices
- Save/load game state (JSON serialized to localStorage or downloadable)
- Undo (go back one step)
- History (scrollable transcript of everything the reader has seen)

**Text display:**
- Full RTL layout with proper bidi handling for mixed Arabic/English/numbers
- Typewriter effect (optional, controlled by `#تأخير` tag)
- Text animation (fade in paragraphs)
- Support for tashkeel (diacritics) display

**Theming:**
- CSS-based themes: dark mode (default, like classic IF), light mode, paper/book mode
- Custom CSS per story (authors can include a stylesheet)
- Responsive — works on mobile

**Media:**
- Images referenced by `#صورة:` tags, loaded from story bundle or URL
- Audio via `#صوت:` tags (background music, sound effects)
- No video (keep it text-focused)

**Educator features (via tags/config):**
- `#مفردات:كلمة=تعريف` — hoverable vocabulary tooltip
- `#سؤال:` — quiz-style passage where the reader must answer correctly
- `#نقاط:` — scoring system for gamified learning
- `#زمن:ثوانٍ` — timed choices

---

## 7. RTL & Arabic-Specific Technical Requirements

### 7.1 Layout Rules

1. **Everything defaults to `direction: rtl; text-align: right;`** — this is not a setting, it's the default.
2. **CSS logical properties only** — use `margin-inline-start` not `margin-left`, `padding-inline-end` not `padding-right`, `inset-inline-start` not `left`.
3. **Flexbox/Grid `direction: rtl`** — flex items flow right-to-left automatically.
4. **React Flow nodes** — React Flow renders DOM nodes, not canvas. Each passage card is a custom React component with `direction: rtl`. Connection edges flow right-to-left (source handle on the left side of cards, target handle on the right — reversed from LTR default).
5. **Scrollbars** — on the left side (browser default for RTL).

### 7.2 Text Handling

1. **Unicode bidirectional algorithm** — the browser handles most bidi automatically. But the parser must be aware of bidi control characters (RLM, LRM, RLE, LRE, etc.) and not break them.
2. **Arabic shaping** — the browser handles glyph joining. But the script editor must use a monospace font that supports Arabic ligatures (e.g., IBM Plex Mono Arabic, or fall back to system Arabic fonts).
3. **Tashkeel/diacritics** — **Design decision: normalize variable names by stripping tashkeel.** `كَلْب` and `كلب` resolve to the same variable. Tashkeel in prose text is preserved as-is. Rationale: authors shouldn't get silent bugs because they typed a fatḥa on one reference but not another.
4. **Arabic punctuation** — the parser must recognize `،` (Arabic comma), `؟` (Arabic question mark), `؛` (Arabic semicolon), `«»` (Arabic quotation marks, though `""` is also accepted per ARABIC_MASTERY.md).
5. **Numbers** — support both Arabic-Indic (٠١٢٣٤٥٦٧٨٩) and Western Arabic (0123456789). Store as numbers internally; display in user-preferred format.

### 7.3 Keyboard & Input

1. **Arabic keyboard layout** — the script editor must work with Arabic keyboard input by default.
2. **Shortcut keys** — use Ctrl/Cmd + key combos that don't conflict with Arabic input. Avoid letter-based shortcuts; prefer function keys or Ctrl+Shift combos.
3. **IME support** — handle Arabic input method composition correctly.
4. **Mixed input** — the script editor will have Arabic prose mixed with symbol markup (`===`, `->`, `*`, `~`). The editor must handle cursor movement correctly at bidi boundaries.

### 7.4 Font Stack

```css
font-family: 
  'IBM Plex Sans Arabic',     /* primary — clean, modern, free */
  'Noto Sans Arabic',         /* fallback — Google, covers all weights */
  'Amiri',                    /* literary/book feel option */
  'Tajawal',                  /* UI-friendly alternative */
  system-ui,
  sans-serif;
```

For the script editor (monospace):
```css
font-family:
  'IBM Plex Mono',            /* for symbols and code */
  'Noto Sans Arabic',         /* Arabic text within code */
  monospace;
```

---

## 8. Tech Stack (Recommended)

### 8.1 Frontend

| Component | Technology | Why |
|-----------|-----------|-----|
| **Framework** | React 18+ with TypeScript | Component model fits the editor architecture. TypeScript prevents bugs in parser/compiler. |
| **State management** | Zustand | Lightweight, no boilerplate. Single store for the AST. |
| **Canvas (node editor)** | React Flow | Battle-tested node graph library. Handles zoom, pan, connections. Customizable nodes. |
| **Script editor** | CodeMirror 6 | Extensible, supports custom languages, RTL-aware, excellent on mobile. |
| **Styling** | Tailwind CSS (with RTL plugin) | Utility-first, logical properties via `rtl:` variant. |
| **Build** | Vite | Fast, works with React + TypeScript. |
| **Testing** | Vitest + Playwright | Unit tests for parser/compiler, E2E for editor. |

### 8.2 Parser & Compiler

| Component | Technology | Why |
|-----------|-----------|-----|
| **Parser** | Hand-written recursive descent (TypeScript) | Full control over error messages (in Arabic), bidi-aware tokenizer. PEG/LALR generators don't handle Arabic well. |
| **AST** | TypeScript interfaces | Strongly typed, serializable to JSON. |
| **Compiler** | TypeScript | AST → Story JSON transform. Validates, resolves references, reports errors. |

### 8.3 Runtime / Player

| Component | Technology | Why |
|-----------|-----------|-----|
| **Player** | Vanilla TypeScript (no framework) | The player must be embeddable in exported HTML with zero dependencies. |
| **Styling** | Minimal CSS (bundled) | Standalone HTML must work without CDN calls. |
| **Save/load** | localStorage + JSON download | Works offline, no server needed. |

### 8.4 Backend (optional, for hosted platform)

| Component | Technology | Why |
|-----------|-----------|-----|
| **API** | None for MVP | Stories are JSON files saved in the browser (IndexedDB) or downloaded. |
| **Future: hosting** | Simple static file server (Cloudflare Pages, GitHub Pages) | Exported HTML files are static. No backend needed for playing. |
| **Future: user accounts** | Supabase or Firebase | If you add login, story saving, sharing. |

---

## 9. Project Structure

```
aqlamna/
├── packages/
│   ├── core/                    # Parser, compiler, AST types
│   │   ├── src/
│   │   │   ├── parser/
│   │   │   │   ├── tokenizer.ts     # Arabic-aware lexer
│   │   │   │   ├── parser.ts        # Recursive descent parser
│   │   │   │   └── errors.ts        # Error messages (Arabic + English)
│   │   │   ├── compiler/
│   │   │   │   ├── compiler.ts      # AST → Story JSON
│   │   │   │   └── validator.ts     # Structure validation
│   │   │   ├── types/
│   │   │   │   ├── ast.ts           # AST node types
│   │   │   │   └── story.ts         # Story JSON schema types
│   │   │   └── index.ts
│   │   ├── tests/
│   │   └── package.json
│   │
│   ├── runtime/                 # Story player (standalone)
│   │   ├── src/
│   │   │   ├── engine.ts            # State machine, variable eval
│   │   │   ├── renderer.ts          # DOM rendering (RTL)
│   │   │   ├── save.ts              # Save/load state
│   │   │   ├── themes/              # CSS themes
│   │   │   │   ├── dark.css
│   │   │   │   ├── light.css
│   │   │   │   └── book.css
│   │   │   └── index.ts
│   │   ├── template.html            # Standalone export template
│   │   └── package.json
│   │
│   ├── editor/                  # Visual + script editor (web app)
│   │   ├── src/
│   │   │   ├── components/
│   │   │   │   ├── Canvas/          # React Flow node graph
│   │   │   │   ├── ScriptEditor/    # CodeMirror integration
│   │   │   │   ├── PassageEditor/   # Side panel for editing passages
│   │   │   │   ├── VariablePanel/   # Variable inspector
│   │   │   │   ├── Toolbar/         # Top bar with actions
│   │   │   │   └── Player/          # Embedded player for testing
│   │   │   ├── store/               # Zustand store (AST + editor state)
│   │   │   ├── codemirror/          # CM6 language mode for .qalam
│   │   │   ├── export/              # Export to HTML, JSON, Twine
│   │   │   └── App.tsx
│   │   └── package.json
│   │
│   └── linter/                  # Arabic quality linter (optional)
│       ├── src/
│       │   ├── rules/               # Rules derived from ARABIC_MASTERY.md
│       │   └── linter.ts
│       └── package.json
│
├── docs/
│   ├── language-spec-ar.md          # Full .qalam spec in Arabic
│   ├── language-spec-en.md          # English translation
│   ├── tutorial-ar.md               # Getting started guide (Arabic)
│   └── ARABIC_MASTERY.md            # Copied from teachaiarabic project
│
├── examples/
│   ├── مغامرة_بسيطة.qalam          # Simple adventure (tutorial)
│   ├── لعبة_تعليمية.qalam          # Educational game example
│   └── قصة_متفرعة.qalam           # Branching story example
│
├── LICENSE                          # GPL-3.0
├── README.md                        # Arabic first, English section below
├── README-en.md                     # Full English README
└── package.json                     # Monorepo root (npm workspaces)
```

---

## 10. Export Format

### 10.1 Standalone HTML Export

A single `.html` file containing:
1. The story JSON (embedded as a `<script>` tag)
2. The runtime engine (minified, inlined)
3. The theme CSS (inlined)
4. Any images (base64 encoded, or referenced by URL)

```html
<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>لصّ القصر</title>
  <style>/* runtime CSS inlined here */</style>
</head>
<body>
  <div id="qalam-player"></div>
  <script id="qalam-story" type="application/json">
    /* story JSON here */
  </script>
  <script>/* runtime JS inlined here */</script>
</body>
</html>
```

Target size: <100KB for a text-only story (excluding images).

### 10.2 Other Export Formats

| Format | Purpose |
|--------|---------|
| `.qalam` (text) | The source script — human-readable, version-controllable |
| `.qalam.json` | Compiled story JSON — for embedding in other apps |
| `.html` | Standalone playable story |
| Twine archive (`.html`) | For importing into Twine (compatibility) |
| EPUB (future) | For e-readers |

---

## 11. ARABIC_MASTERY.md Integration

### 11.1 As a Linter

The `linter` package reads ARABIC_MASTERY.md rules and flags violations in story text:

**What it checks:**
- AI anti-patterns from sections 1, 1b (overused phrases, bloated descriptions, tell-don't-show)
- Tashkeel over-application (section 3) — warns if unnecessary shaddas detected
- Quotation mark style (section on punctuation) — flags «» vs "" inconsistency
- Linguistic purism (section 9.5) — warns if text uses archaic forms that ARABIC_MASTERY.md flagged

**What it does NOT do:**
- Grammar checking (out of scope for MVP)
- Spell checking (use existing Arabic spell checkers)
- It does NOT auto-correct — only flags and suggests

**How it works:**
- Pattern matching for known anti-patterns (regex-based)
- Word frequency analysis for overused AI words
- Configurable severity: error (blocks export) / warning / info

### 11.2 As Documentation

ARABIC_MASTERY.md ships with the project as a writing guide for authors. The editor links to it from the help menu. For AI-assisted story generation features (future), the rules are injected into the AI prompt.

---

## 12. Naming: Why "Aqlamna" (أقلامنا)

- أقلامنا means "Our Pens" — plural of قلم (pen), with the possessive "نا" (our)
- The communal name reflects the open-source, community-owned spirit of the project
- Domains: **aqlamna.org** (primary) and **aqlamna.com** (redirect) — both registered
- npm: `@aqlamna/core`, `@aqlamna/editor`, `@aqlamna/runtime`
- GitHub: `aqlamna` or `aqlamna-if`
- The Quran references the pen in Surah Al-Qalam (سورة القلم) — culturally resonant
- "Our Pens" implies: this tool belongs to every Arabic writer, not one company

Names considered and rejected: Qalam (قلم, domain taken), رواي (Rawai), نسّاج (Nassaj), حكاية (Hikaya).

---

## 13. Development Roadmap

### Phase 1: Core Engine (MVP)
- [ ] .qalam parser (tokenizer + recursive descent)
- [ ] Compiler (AST → JSON)
- [ ] Runtime player (renders passages, handles choices, variables)
- [ ] Standalone HTML export
- [ ] 3 example stories in .qalam format
- [ ] Unit tests for parser and compiler

### Phase 2: Visual Editor
- [ ] React app with React Flow canvas
- [ ] Passage card creation/editing/connection
- [ ] Side panel passage editor
- [ ] Bidirectional sync (visual ↔ script)
- [ ] CodeMirror 6 integration with .qalam syntax highlighting
- [ ] Save/load projects (IndexedDB + JSON download)

### Phase 3: Polish & Features
- [ ] Themes (dark, light, book)
- [ ] Mobile-responsive player
- [ ] Arabic quality linter (ARABIC_MASTERY.md rules)
- [ ] Tutorial and documentation in Arabic
- [ ] Twine import/export compatibility
- [ ] Image and audio support

### Phase 4: Community & Platform
- [ ] GitHub release with GPL-3.0 license
- [ ] Hosted instance (static site)
- [ ] Story sharing (upload exported HTML)
- [ ] Community story library
- [ ] Educator tools (classroom mode, scoring, analytics)
- [ ] AI-assisted story generation (with ARABIC_MASTERY.md prompt injection)

---

## 14. Example: Complete .qalam Story

```qalam
// لصّ الرحيق — قصة تفاعلية قصيرة
// مثال كامل على صيغة .qalam

متغير الرحيق = 0
متغير اسم_اللاعب = "نحلة"
متغير وجد_الخريطة = خطأ

قائمة الطقس = (مشمس)، غائم، ممطر

=== البداية === #مشهد_أول

صباح جديد في المرج. الشمس ترسل أشعتها الذهبية بين الأزهار.
أنتِ نحلة صغيرة، ومهمتك اليوم: جمع الرحيق لخليتك.

* [انطلقي نحو حقل الأزهار]
  فردتِ جناحيكِ وطرتِ فوق العشب الأخضر.
  -> حقل_الأزهار

* [تفقّدي الخلية أولاً]
  عدتِ إلى الخلية لتسمعي آخر الأخبار.
  -> الخلية

=== حقل_الأزهار ===

حقل واسع مليء بالألوان. ورود حمراء وأقحوانات بيضاء وزنابق برتقالية.
{وجد_الخريطة: الخريطة تشير إلى أنّ أفضل رحيق في الزنابق.}

* [اقتربي من الورود الحمراء]
  ~ الرحيق = الرحيق + 2
  رحيق حلو ولكن قليل.
  -> حقل_الأزهار

* [جرّبي الأقحوانات]
  ~ الرحيق = الرحيق + 3
  رحيق وفير ولذيذ!
  -> حقل_الأزهار

* {وجد_الخريطة} [توجّهي إلى الزنابق البرتقالية]
  ~ الرحيق = الرحيق + 5
  كنز! رحيق الزنابق هو الأغنى.
  -> حقل_الأزهار

+ {الرحيق >= 5} [عودي إلى الخلية بالرحيق]
  جمعتِ ما يكفي. حان وقت العودة.
  -> العودة

=== الخلية ===

النحلات مشغولات بالعمل. الملكة تطلب المزيد من الرحيق.

* [تحدثي مع النحلة الحكيمة]
  أخبرتكِ النحلة الحكيمة عن موقع أفضل الأزهار.
  ~ وجد_الخريطة = صح
  -> حقل_الأزهار

* [انطلقي مباشرة]
  لا وقت للكلام!
  -> حقل_الأزهار

=== العودة ===

{الرحيق:
  - الرحيق < 8: عدتِ بقليل من الرحيق. يوم عادي.
  - الرحيق < 12: عدتِ بحمل جيد! النحلات سعيدات.
  - غير_ذلك: عدتِ بكنز من الرحيق! الملكة تشكركِ شخصياً.
}

جمعتِ {الرحيق} قطرة من الرحيق.

-> نهاية
```

---

## 15. Competitive Landscape

| Tool | Arabic Support | Visual Editor | Scripting | Open Source | Notes |
|------|---------------|---------------|-----------|-------------|-------|
| Twine | None (RTL hacks) | Yes (excellent) | Harlowe/SugarCube/Snowman | Yes (MIT) | Gold standard for visual editing |
| Ink | None | Inky (basic) | Ink (excellent) | Yes (MIT) | Gold standard for scripting |
| Inform7 | None | No | Natural English | Yes | English-only by design |
| Ren'Py | Partial RTL | No | Python-like | Yes (MIT) | Visual novel focus |
| Yarn Spinner | None | YarnEditor | Yarn | Yes (MIT) | Unity integration focus |
| **Aqlamna** | **Native** | **Yes** | **.qalam** | **Yes (GPL-3.0)** | **Arabic-first** |

Aqlamna's moat: **nobody else is building for Arabic.** The technology isn't harder — the market is just invisible to Western developers.

---

## 16. Success Metrics

**MVP (3 months):**
- Parser handles 100% of .qalam syntax without errors
- 3 example stories playable in the browser
- Standalone HTML export <100KB
- Editor works on Chrome, Firefox, Safari

**6 months:**
- 10+ community-contributed stories on the platform
- Featured on Arabic tech blogs / ProductHunt
- Educator pilot: 1 Arabic teacher using it in a classroom

**1 year:**
- 100+ published stories
- Integration with hakawatialahlam.com (children's stories as interactive format)
- NPM package used by 3+ external projects
