# أقلامنا — image generation spec

Phase 3.3. Written 30 July 2026. Decisions below were made by the project owner; they are
not open for reinterpretation. Where this document and an implementation disagree, this
document wins — same standing as `PHASE1_SPEC.md`.

## The four decisions

1. **The `.qalam` source holds a reference, never image bytes.** Bytes live beside the
   project in IndexedDB. The export inlines them at build time. Rationale: base64 inside the
   source turns the code pane into a wall of gibberish and makes diffs useless. This mirrors
   the seed-story and mastery-prompt build steps — source stays human, the build assembles.
2. **Budget: warn at 1 MB, hard stop at 2 MB** for the exported file.
3. **768 px on the long side, WebP.** One resolution, no per-image choice.
4. **One exported file, always.** No folder mode, ever. The single-file promise — one file,
   no server, nothing leaves your device — is the product's identity, not a feature.

## 1. Language

### 1.1 Declaration

An image is declared at the top of the file, in the same region as `متغير` and `قائمة`:

```qalam
صورة بوابة_المدينة = "بوابة حجرية قديمة عند غروب الشمس، وحارس واقف تحتها"
```

- Keyword: `صورة`. English alias: `image`.
- The name follows the same rules as a variable name — tashkeel stripped when resolving.
- The string is the **Arabic description**. It is authored in Arabic and stays Arabic.
- Declaring an image does not generate it. Generation is an explicit author action in the
  editor (§3).

### 1.2 Use inside a passage

```qalam
=== الوصول ===

صورة: بوابة_المدينة

وقفتِ أمام البوابة، والحرّاس لا ينظرون إليكِ.
```

- `صورة:` on its own line places the image at that point in the passage.
- The same image may be used in more than one passage. It is stored once and inlined once.
- An image reference is a **node in the passage body**, ordered with prose and choices exactly
  as written. It is not metadata and not a passage-level property.

### 1.3 Story-level image style

Optional. One per story. Declared in the same region as `متغير` and `صورة`:

```qalam
أسلوب_الصور: "رسم كتب أطفال، ألوان ترابية هادئة، خطوط ناعمة"
```

English alias: `image_style`.

- The style string is Arabic and stays Arabic. It is authored once and applied to every image.
- At generation time, the bridge translates the image DESCRIPTION ONLY, then appends the style
  verbatim in English. The text model is explicitly instructed to translate the subject
  faithfully and invent NO style, NO lighting, NO mood, NO composition.
- Without this declaration, the text model volunteers a different style every time — ten images
  get ten different visual treatments and the book looks inconsistent.
- The style is compiled into the story JSON so a re-export preserves it. It is not a UI toggle
  that resets.

### 1.4 Errors

Message strings are fixed here, as in `PHASE1_SPEC.md` §1.15. Nobody paraphrases them.

| Code | Arabic | English |
|---|---|---|
| E106 | `لا توجد صورة بهذا الاسم: {name}` | `No image with this name: {name}` |
| E107 | `اسم الصورة مكرّر: {name}` | `Duplicate image name: {name}` |
| E108 | `تصريح الصورة يحتاج وصفًا بين علامتَي اقتباس.` | `An image declaration needs a description in quotes.` |

E106 is raised at compile time when `صورة:` references an undeclared name — the same class
of check as an unknown passage in a divert.

A declared image that is never used is **not** an error. It is a warning in the editor only.

A declared image that has never been generated is **not** a compile error either — it exports
as a placeholder box carrying the Arabic description as visible text, so the story still plays.

## 2. Compiled output

Passage body node:

```json
{ "type": "image", "name": "بوابة_المدينة" }
```

Story-level asset table, emitted alongside `passages`:

```json
"images": {
  "بوابة_المدينة": {
    "alt": "بوابة حجرية قديمة عند غروب الشمس، وحارس واقف تحتها",
    "data": "data:image/webp;base64,..."
  }
}
```

- `alt` is always the author's Arabic description. It is the accessibility text and the
  placeholder text; it is never the English prompt.
- `data` is absent when the image has not been generated. The runtime must handle that.
- Images are keyed by name and stored **once**, no matter how many passages use them.

## 3. Generation pipeline

Two API calls per image. This is deliberate.

```
author writes Arabic description
        ↓
   text model  (the provider already configured for writing)
        ↓  "turn this into an English image-generation prompt"
   English prompt  — never shown to the author
        ↓
   image model
        ↓
   downscale to 768px long side, encode WebP
        ↓
   IndexedDB, keyed by project + image name
```

**Why the bridge exists:** Gemini and FLUX both understand English materially better than
Arabic for image prompts. Sending the Arabic string straight through produces visibly worse
images. The author writes Arabic, sees Arabic, and never learns English is involved.

**`ARABIC_MASTERY.md` has nothing to do with this path.** That corpus governs prose quality.
Do not send the mastery system prompt on the image-prompt call. Do not lint image
descriptions against it.

The English prompt is not stored. If the author regenerates, the bridge runs again.

## 4. Provider matrix

Verified by web search on 30 Jul 2026. Do not edit this table from memory — check the
provider's own pricing page and record the date.

| Provider | Images? | Model | Cost |
|---|---|---|---|
| Together | ✅ | FLUX.1 [schnell] | **$0.0027 / megapixel** → ≈ **$0.0016 per 768px image**. No free tier as of 31 Jul 2026; the account is read-only until a deposit is made. THE DEFAULT — 30× cheaper than Gemini. |
| Gemini | ✅ | ⚠️ see note | `gemini-2.5-flash-image` ≈ $0.039/image, **no free tier**, **shuts down 2 Oct 2026** |
| OpenAI | ✅ | `gpt-image-1` | paid, no free tier |
| Venice | ❓ | unverified | could not confirm — **check before implementing** |
| DeepSeek, Mistral, OpenRouter, Anthropic | ❌ | — | text only |
| **Groq** | ❌ | — | **vision INPUT only — Groq reads images, it does not generate them.** Commonly confused with xAI's *Grok*, which does generate. |
| Ollama, LM Studio | ❌ | — | text only. Local image generation needs a diffusion stack (ComfyUI / A1111) with a different API — **out of scope for 3.3** |

⚠️ **Do not hardcode `gemini-2.5-flash-image`.** It is scheduled for shutdown on 2 Oct 2026,
about two months from this spec. Use `gemini-3.1-flash-image-preview` or whatever Google's
current image model is at implementation time, and put the model id in provider config so it
can be changed without touching code.

### 4.1 Exact identifiers — copy these, do not retype

| what | value |
|---|---|
| Together image endpoint | `https://api.together.xyz/v1/images/generations` |
| model string | `black-forest-labs/FLUX.1-schnell` |
| auth header | `Authorization: Bearer $TOGETHER_API_KEY` |
| response | base64 or a URL depending on `response_format` — request **base64** so nothing has to be re-fetched |

`FLUX.1 [schnell]` is the display name on the pricing page. The model string is the one above.
A wrong character returns 404, and that is the most common failure when wiring a provider.
Verify each identifier against Together's Models page before shipping; they rename models.

The key is the author's own, entered in الإعدادات and stored in localStorage only — never in
the repo, never in an env var baked into the build, never sent anywhere but the provider.

**Recommended default: Together FLUX.1 [schnell]** — at ≈$0.0016 per 768px image, a 10-image
story costs under two cents and a $5 deposit buys roughly 3,000 images.

⚠️ **CORRECTION, 31 Jul 2026.** An earlier version of this table said Together had a free
endpoint (`FLUX.1-schnell-Free`). That was a 2024 promotional offer and it no longer exists —
verified against the live pricing page and a real account, which sits in read-only mode until
a deposit is made. **NOTHING on the provider list is free today.** Do not reintroduce a "free"
claim without checking the provider's own pricing page and recording the date.

This matters for the product, not just the bill: a teacher or student cannot try image
generation without a card. Text co-writing still works with any free-tier text provider, so
images must remain strictly optional — never a step in the onboarding path.

Add a `supportsImages` field to the provider config in `providers.ts`, in the same style as
the existing `browserCors` field.

**When the selected provider cannot make images, the generate button is disabled and says
why in Arabic** — the same treatment as the missing-API-key hint, not a silent no-op.

An author may configure a text provider and an image provider **independently**. Writing with
DeepSeek and drawing with Gemini must work; it is the expected setup, not an edge case.

## 5. Storage and budget

- **IndexedDB**, keyed by project id + image name. Never `localStorage` — its ~5 MB ceiling
  is shared with everything else and images will blow it.
- Stored as a WebP blob, already downscaled. The original full-size response is discarded.
- The editor shows **running total: `1.2 MB / 2 MB`** wherever images are managed. This is
  not a hidden limit the author discovers by failing.
- At 1 MB: a visible warning, export still allowed.
- At 2 MB: export blocked with an Arabic message naming the largest images so the author
  knows what to remove.
- Deleting an image frees the space and updates the total immediately.

## 6. Runtime and export

- The runtime renders `<img>` with `src` = the inlined data URI and `alt` = the Arabic
  description, `max-inline-size: 100%`, `block-size: auto`, rounded to match the player.
- **Zero network requests still holds.** No CDN, no lazy loading from a URL, no external
  font or placeholder service.
- Missing `data` renders a bordered placeholder containing the Arabic description as text.
  The story remains playable.
- The exported file must still open from `file://`.

## 7. Privacy — this changes what the policy must say

Today `docs/الخصوصية.md` says nothing leaves the device unless AI features are used. Image
generation adds a second thing that leaves: **the Arabic description, its English
translation, and nothing else**. The generated image comes back and is stored locally.

`docs/الخصوصية.md` and `docs/الشروط.md` must both be updated **in the same commit** as the
feature. Not after. Specifically:

- name that image generation sends the description to the chosen provider
- state that two calls are made — translation, then generation — and both go to providers the
  author configured
- state that images are stored only on the author's device
- state that Aqlamna never sees the description, the prompt, or the image
- note that generated images may carry the provider's own usage terms, which are between the
  author and that provider

## 8. Tests

- Fixture `06_images.qalam` + `.expected.json`: a declaration, a use, a second use of the
  same image in another passage, and an image declared but never used. Hand-written from this
  spec, then confirmed to fail before the feature exists.
- Unit tests for E106, E107, E108 in both languages.
- A test that the same image used twice appears **once** in the `images` table.
- A test that an ungenerated image exports and still plays.
- A Playwright test on the **exported artifact**: the `<img>` is present, its `src` starts
  with `data:image/webp;base64,`, and the page issues zero network requests.
- A size test: an export with N images stays under the declared budget and is blocked over it.

## 9. Out of scope for 3.3

- Image editing, cropping, filters
- Uploading the author's own images (worth doing later; not now)
- Per-image style or aspect-ratio controls
- Image generation from the canvas view
- Any server-side storage of anything
