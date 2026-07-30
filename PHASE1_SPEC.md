# Aqlamna — Phase 1 Specification & Acceptance Contract

**Scope:** parser → compiler → runtime → standalone HTML export. No visual editor.
**Authority:** `ARABIC_IF_ENGINE_DESIGN.md` is the design. This document fills gaps in it
and defines what "done" means. Where the two disagree, this document wins for Phase 1.

---

## 1. Spec gaps closed here

The design document did not specify these. They are decided now so the parser has no
room to guess. Each is a real decision — if you disagree, change it here before building.

### 1.1 Story front matter

The design had no way to declare a title or author. Added:

```
عنوان: "لصّ القصر"
مؤلف: "سارة أحمد"
لغة: "ar"
```

English aliases: `TITLE:`, `AUTHOR:`, `LANGUAGE:`. All optional, must appear before the
first `===` passage.

Defaults when absent:
- `title` → the source filename without extension
- `author` → `null`
- `language` → `"ar"`
- `direction` → `"rtl"` (always, not configurable in Phase 1)

### 1.2 Start passage

`start` is the FIRST passage declared in the file. No override syntax in Phase 1.

### 1.3 Divert target normalisation

`نهاية` and `END` both compile to the literal target string `"END"`.
`تابع` and `DONE` both compile to `"DONE"`.
All other targets keep their name as written, with tashkeel stripped.

### 1.4 Choice IDs

`choice_1`, `choice_2`, … numbered sequentially from 1, per passage, in source order.
Sticky (`+`) and consumable (`*`) choices share one counter.

### 1.5 Interpolation splits a text line

A line containing `{متغير}` compiles to consecutive content nodes in source order:
`text` → `interpolation` → `text`. Leading and trailing spaces around the braces are
PRESERVED in the adjacent text nodes (see fixture 03: `"جمعتِ "` keeps its trailing space).
Empty text segments are omitted entirely — never emit `{"type":"text","value":""}`.

### 1.6 Assignment normalisation

`~ س = س + 2` where the right side is `<same variable> <+|-|*|/> <number literal>`
compiles to a shorthand op: `{"type":"set","var":"س","op":"+=","value":2}`.

Any other assignment uses `"op": "="` with the evaluated right side as `value`.
For Phase 1, `value` may be a number, string, or boolean literal only. Assigning a
general expression (e.g. `~ س = ص + ع`) must raise error `E201` — not silently guess.

### 1.7 Boolean conditions without a comparison

`{وجد_المفتاح: ...}` compiles the condition to `{"var":"وجد_المفتاح"}` with no `op`
and no `value` — the truthiness form from design §4.1. Do not expand it to `== true`.

### 1.8 Metadata block is excluded from tests

The `metadata` object in design §4 carries timestamps, so it is non-deterministic.
The compiler still emits it. The test harness must strip `metadata` before comparing
to expected JSON.

### 1.10 Whitespace normalisation

Discovered during step 2 review — the tokenizer preserves whitespace faithfully, so the
parser must be told exactly where to trim. Rules:

- **Prose text lines** are trimmed of leading and trailing whitespace.
- **Choice result text** (everything after the closing `]`) is trimmed. Source
  `* [افتح] فتحت الباب.` yields the label `افتح` and result text `فتحت الباب.` — the
  space after `]` is a separator, not content.
- **Conditional body text** (after the `:` inside `{ }`) is trimmed the same way.
- **Interpolation-adjacent spaces inside a prose line are PRESERVED.** In
  `جمعتِ {الرحيق} قطرة.` the text nodes are exactly `"جمعتِ "` and `" قطرة."`.
  This is the one place whitespace is meaningful, because removing it would join
  the number to the surrounding words.

Trim at the parser stage, not the tokenizer — the tokenizer must keep raw text so
this rule stays in one place.

### 1.11 Dotted sub-section references

`-> المنزل.المطبخ` refers to sub-section `المطبخ` inside passage `المنزل`
(design §3.2). The dot is significant and must survive tokenization — either as a
single identifier `المنزل.المطبخ` or as `IDENTIFIER DOT IDENTIFIER`. It must never be
silently dropped, which would make `المنزل.المطبخ` indistinguishable from two
unrelated identifiers.

In the compiled JSON, a divert to a sub-section keeps the dotted form as its
`target` string.

### 1.12 Multi-branch conditionals compile to nested conditionals

Design §3.2 allows:

```
{الشجاعة:
  - الشجاعة < 3: ترتجف.
  - الشجاعة < 7: تتردد.
  - غير_ذلك: تندفع.
}
```

There is no multi-branch node type in the story JSON. This compiles to a **chain of
nested `conditional` nodes**, each subsequent branch living in the previous one's `else`:

```json
{ "type": "conditional", "condition": { "var": "الشجاعة", "op": "<", "value": 3 },
  "then": [ ...branch 1... ],
  "else": [
    { "type": "conditional", "condition": { "var": "الشجاعة", "op": "<", "value": 7 },
      "then": [ ...branch 2... ],
      "else": [ ...غير_ذلك branch... ] }
  ]}
```

With exactly two branches (one condition plus `غير_ذلك`) this is a single conditional
node with a populated `else`. If there is no `غير_ذلك` branch, the innermost `else` is `[]`.

The header variable before the `:` is only a scoping hint for the reader — the compiled
conditions come from the `-` branch lines, NOT from the header.

**This must never silently collapse into one text node.** Emitting the branch lines as
literal prose is a bug, not a fallback.

### 1.13 Nested choices stay nested

`**` choices belong to their parent `*` choice, not to the passage. A nested choice group
compiles to a `choices` node inside the parent choice's `content` array, positioned where
it appeared in the source.

Nested choice IDs extend the parent's ID with an underscore and a 1-based counter:
`choice_1` → `choice_1_1`, `choice_1_2`. Depth 3 continues the pattern (`choice_1_2_1`).

Flattening nested choices into siblings changes the story's logic and is a bug.

### 1.14 Every subsection is emitted

A passage with several `= subsection` blocks emits **one entry per subsection**, each keyed
`passage.subsection`. Emitting only the first is a bug. The parent passage keeps whatever
content appeared before the first `=` marker.

### 1.6b Assigning a list value

Amends §1.6. `~ حالة_الباب = مكسور` — where `مكسور` is a value of a declared `قائمة` — is
valid and compiles to `{"type":"set","var":"حالة_الباب","op":"=","value":"مكسور"}`.

Resolution rule: a bare identifier on the right-hand side of `~` is valid **only** if it is
a declared value of the list being assigned to. Anything else is still `E201`.

### 1.15 Arabic message style, and the exact message strings

Every Arabic string Aqlamna ships obeys `ARABIC_MASTERY.md` — but only its **language and
punctuation** sections. The narrative rules (bloated endings §1.1, preaching §1.2, sensory
detail §1.6) are about storytelling and do not apply to UI or error text.

Rules that DO apply everywhere:

- `""` for quotation, never `«»` (§1b.1)
- one adjective, never a doubled pair (§1b.2)
- no `قام بـ`, no `تمّ + مصدر` (§2.4)
- correct plurals — `مشكلات` not `مشاكل`, `مديرون` not `مدراء` (§2.2)
- tashkeel only where it prevents ambiguity, never decorative (§3)
- active voice, plain phrasing (§5.2, §5.4)

Language keywords are quoted **exactly as the language spells them** — `متغير` with no
shadda, `قائمة`, `صح`, `خطأ` — even where prose Arabic would vocalise differently. A message
that misspells the keyword it's telling the author to use is worse than useless.

**The messages. Use these strings verbatim; `{...}` are substitutions.**

| Code | `message_ar` | `message_en` |
|------|--------------|--------------|
| E101 | `لا يوجد مقطع بهذا الاسم: {name}` | `No passage named {name}.` |
| E102 | `اسم المقطع مكرّر: {name}` | `Duplicate passage name: {name}.` |
| E103 | `ترويسة المقطع غير مغلقة؛ أضف === في نهاية السطر.` | `Unterminated passage header — add === at the end of the line.` |
| E104 | `خيار خارج أيّ مقطع؛ ابدأ مقطعًا بـ === قبل كتابة الخيارات.` | `Choice outside a passage — open a passage with === first.` |
| E105 | `شرط غير مكتمل؛ القوس { لم يُغلق.` | `Malformed conditional — { was never closed.` |
| E201 | `تعبير غير مدعوم في الإسناد: {expr}. المدعوم: رقم أو نصّ أو صح/خطأ أو قيمة من قائمة.` | `Unsupported expression in assignment: {expr}. Allowed: a number, a string, صح/خطأ, or a declared list value.` |
| E202 | `متغير غير معرّف: {name}. أعلنه بـ متغير قبل استخدامه.` | `Undeclared variable: {name}. Declare it with متغير first.` |
| E203 | `نوع غير متطابق: المتغير {name} نوعه {expected}، والقيمة المسندة {got}.` | `Type mismatch: {name} is {expected}, assigned value is {got}.` |

Do not paraphrase these, and do not "improve" the Arabic. If a message is wrong, say so and
stop — the project owner decides the wording.

### 1.9 Error codes

Every parser and compiler error has a stable code and a message in both languages.
Minimum set for Phase 1:

| Code | Meaning |
|------|---------|
| `E101` | Divert target does not exist |
| `E102` | Duplicate passage name |
| `E103` | Unterminated passage header (`===` without closing `===`) |
| `E104` | Choice outside a passage |
| `E105` | Malformed conditional block (`{` never closed) |
| `E201` | Unsupported expression in assignment |
| `E202` | Undeclared variable referenced |
| `E203` | Type mismatch in assignment |

Error objects: `{ code, message_ar, message_en, line, column }`.

---

## 2. Acceptance criteria

Phase 1 is done when ALL of these are objectively true. No partial credit.

**Parser + compiler**
1. All three fixtures in `packages/core/tests/fixtures/` compile to byte-identical
   JSON (after stripping `metadata` and normalising key order).
2. Tashkeel test: a story referencing `كَلْب` and `كلب` produces ONE variable, not two.
3. Digit test: `متغير س = ٥` and `متغير س = 5` both produce `"initial": 5`.
4. Every error in the §1.9 table is reachable by a test that triggers it, and each
   returns both `message_ar` and `message_en` non-empty.
5. `لا` inside prose text is NOT treated as an operator. A passage whose body is
   `لا أعرف ماذا أفعل.` compiles to a single text node.

**Runtime**
6. Fixture 03 is playable: clicking «اجمع الرحيق» twice makes the conditional choice
   «عودي إلى الخلية» appear (it requires `الرحيق >= 4`).
7. A consumable `*` choice disappears after being taken; a sticky `+` choice does not.
8. Save then reload restores the exact same passage and variable values.

**Export**
9. `npm run export -- fixture 03` produces ONE `.html` file that opens with a
   `file://` URL, with no network requests and no console errors.
10. That file is under 100 KB.

**Hygiene**
11. `npm test` passes from a clean clone with only `npm install` run first.
12. TypeScript strict mode, zero errors.
13. `packages/runtime/` has zero runtime dependencies in its `package.json`.

---

## 3. Build order and review checkpoints

Each step is a separate CodeWhale session. Stop at every checkpoint and review before
moving on. Do not run two steps in one go — that's how you lose track of what changed.

| Step | What gets built | Your checkpoint |
|------|-----------------|-----------------|
| 1 | Monorepo scaffold: npm workspaces, `packages/core`, Vitest wired up, test harness that reads the fixtures | `npm test` runs and reports 3 FAILING tests. Failing is correct — the code doesn't exist yet. If it reports 0 tests, the harness is wrong. |
| 2 | Tokenizer only | Tokenizer unit tests pass. Fixtures still fail. Read the token output for fixture 01 and check it looks sane. |
| 3 | Parser → AST | AST snapshot tests pass. Fixtures still fail (no compiler yet). |
| 4 | Compiler → story JSON | **All 3 fixtures now pass.** This is the big one. If they pass, the language works. |
| 5 | Error handling: all §1.9 codes | Error tests pass, both languages present. |
| 6 | Runtime engine + renderer | Play fixture 03 in a browser. Criteria 6–8 by hand. |
| 7 | Standalone HTML export | Criteria 9–10. Open the file offline and check DevTools shows no network calls. |

**The rule that keeps you in control:** at each checkpoint the answer is a number, not
an opinion. "3 tests failing" or "3 tests passing". You never have to read the parser
code to know whether it works.

---

## 4. What to watch for

The fixtures are the contract. If CodeWhale ever proposes editing a file under
`tests/fixtures/`, that is it trying to make the test match the bug. The constitution
forbids it, but check the diffs anyway — it's the single most likely way this goes wrong.

Second most likely: it writes a parser that special-cases the three fixtures instead of
implementing the language. Smell test at step 4 — write a fourth story yourself, in
Arabic, using only syntax from the design doc, and see whether it compiles. If it only
ever works on the fixtures, you'll know immediately.

---

*Phase 1 spec — 2026-07-30. Fixtures and acceptance criteria are the contract; the
implementation is not specified here on purpose.*
