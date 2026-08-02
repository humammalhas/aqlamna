// ---------------------------------------------------------------------------
// Image generation pipeline — two API calls:
//   1. Arabic description → English prompt (text model, NO MASTERY prompt)
//   2. English prompt → image data URL (image model)
//
// The English prompt is not stored. Regenerating runs the bridge again.
// ---------------------------------------------------------------------------

import { callTransport, TransportError, type ChatMessage } from "./transport.js";
import {
  getSelectedProvider,
  getTransportConfig,
  getApiKey,
} from "./ai-keys.js";
import {
  getImageProvider,
  getImageModel,
  getImageApiKey,
} from "./ai-keys.js";
import { characterLines } from "./writer-model.js";

// ---- Bridge: Arabic → English prompt ---------------------------------------

/**
 * The output cap for every call on this page, and it is deliberately far above
 * what the answers need.
 *
 * `max_tokens` bounds REASONING plus text, and the default provider reasons.
 * Measured against `deepseek-v4-flash` on 2 Aug 2026, at the budgets this file
 * used to ship:
 *
 *   subject bridge  200 → finish_reason "length", 200 tokens spent, content ""
 *   ✨ suggestion   160 → cut mid-word: "…صبيّ في العاشرة من عمره، بشعرٍ"
 *   style           100 → content "" — the style silently reached no picture
 *   character       120 → content ""
 *
 * Every one of them was reasoning-starved, and only the subject one was loud
 * about it. The style has been dropped in silence on the default provider since
 * the day it was made to cross the bridge; `if (englishStyle)` treats "" as
 * "no style" and asks for the picture anyway.
 *
 * The same calls complete in 139–392 tokens once the reasoning has room. This
 * ceiling is not a target — a short answer costs what it costs, and only a
 * runaway pays for the headroom.
 */
const TRANSLATE_MAX_TOKENS = 1200;

const BRIDGE_SYSTEM_PROMPT =
  "Translate this Arabic description faithfully into English. " +
  "Output ONLY the English translation — no style, no lighting, no mood, " +
  "no composition, no camera direction, no atmosphere words. " +
  "Just the subject. No explanation, no prefix, no quotation marks.";

/**
 * The style has to cross the bridge too.
 *
 * IMAGES_SPEC.md says the bridge translates the subject and appends the
 * author's style **verbatim**, to stop the text model inventing a look of its
 * own. That guard is right; the word "verbatim" was wrong. The style is written
 * in Arabic, and the image model cannot read Arabic — so appending it verbatim
 * appended nothing.
 *
 * Measured on FLUX.1-schnell, same subject, same model, only this clause
 * changed:
 *   ", رسم كتب أطفال، ألوان ترابية"                        → a photograph
 *   ", children's book illustration, earthy colours, flat" → an illustration
 *
 * The story style silently did nothing, which is the same failure as sending
 * the subject in Arabic: not a worse picture, the wrong one. Translating the
 * author's own words is not inventing — the system prompt below still forbids
 * adding anything the author did not write.
 */
const STYLE_SYSTEM_PROMPT =
  "Translate this Arabic art-style phrase into English image-generation " +
  "keywords. Keep exactly the same meaning — do not add any style, colour, " +
  "lighting or mood the input does not state. " +
  "Output ONLY the English, no explanation, no quotation marks.";

/**
 * Character descriptions cross the bridge for exactly the same reason the style
 * does, and fail the same silent way if they do not: an Arabic clause appended
 * to an English prompt is not a weaker instruction, it is no instruction. The
 * prompt below keeps the same "add nothing the author did not write" guard —
 * translating someone's own words is not inventing a look for them.
 */
const CHARACTER_SYSTEM_PROMPT =
  "Translate this Arabic character description into English image-generation " +
  "keywords describing the person's appearance: age, build, hair, clothing. " +
  "Keep exactly the same meaning — do not add any trait, colour, expression " +
  "or clothing the input does not state. Drop the character's name; describe " +
  "only how they look. " +
  "Output ONLY the English, no explanation, no quotation marks.";

/** Styles change rarely; a story of ten images should not pay for ten calls. */
const styleCache = new Map<string, string>();
/** Same reasoning for characters — the same cast recurs in every scene. */
const characterCache = new Map<string, string>();

/**
 * One short Arabic fragment → English, cached. Shared by the style and the
 * character descriptions: both are the author's own words being carried across
 * the bridge, and both recur across every image in a story.
 */
async function arabicFragmentToEnglish(
  arabic: string,
  systemPrompt: string,
  cache: Map<string, string>,
  maxTokens: number,
): Promise<string> {
  const key = arabic.trim();
  const cached = cache.get(key);
  if (cached !== undefined) return cached;

  // Already Latin (the author typed English): nothing to translate.
  if (!/[؀-ۿ]/.test(key)) { cache.set(key, key); return key; }

  const provider = getSelectedProvider();
  const apiKey = getApiKey(provider.id);
  if (provider.requiresKey && !apiKey) return key;

  const text = await callTransport(
    provider.kind,
    getTransportConfig(),
    [
      { role: "system", content: systemPrompt },
      { role: "user", content: key },
    ],
    { temperature: 0.2, max_tokens: maxTokens },
  );
  const english = text.replace(/^["']|["']$/g, "").trim();
  // An empty answer is a failure, not a translation — caching it would make one
  // starved call drop this style from every picture for the rest of the session.
  if (english.length > 0) cache.set(key, english);
  return english;
}

function arabicStyleToEnglish(arabicStyle: string): Promise<string> {
  return arabicFragmentToEnglish(
    arabicStyle,
    STYLE_SYSTEM_PROMPT,
    styleCache,
    TRANSLATE_MAX_TOKENS,
  );
}

function arabicCharacterToEnglish(arabicCharacter: string): Promise<string> {
  return arabicFragmentToEnglish(
    arabicCharacter,
    CHARACTER_SYSTEM_PROMPT,
    characterCache,
    TRANSLATE_MAX_TOKENS,
  );
}

/**
 * The character lines this description is actually about.
 *
 * Every character in the story would bloat the prompt and, worse, draw people
 * into scenes they are not in. A line is `الاسم: الوصف`, so the name before the
 * first colon is matched against the description text. A bare substring test is
 * deliberate: it catches `سليمًا` and `لسليم` — the same boy inflected — which a
 * word-boundary match would miss, because `\b` is an ASCII word boundary and
 * there is no boundary between an Arabic letter and a space.
 */
export function relevantCharacterLines(
  characters: string | null | undefined,
  arabicDescription: string,
): string[] {
  const haystack = (arabicDescription ?? "").trim();
  if (haystack.length === 0) return [];

  return characterLines(characters).filter((line) => {
    const colon = line.indexOf(":");
    const name = (colon === -1 ? line : line.slice(0, colon)).trim();
    return name.length > 0 && haystack.includes(name);
  });
}

/**
 * Translate an Arabic description into an English image prompt using the
 * currently selected text provider. This call does NOT include the
 * ARABIC_MASTERY system prompt — that corpus governs prose, not pictures.
 */
async function arabicToEnglishPrompt(arabicDescription: string): Promise<string> {
  const provider = getSelectedProvider();
  const apiKey = getApiKey(provider.id);

  if (provider.requiresKey && (!apiKey || apiKey.length === 0)) {
    throw new Error(`لم يُضبط مفتاح API للمزوّد ${provider.nameAr}. افتح الإعدادات وأدخل المفتاح.`);
  }

  const messages: ChatMessage[] = [
    { role: "system", content: BRIDGE_SYSTEM_PROMPT },
    { role: "user", content: arabicDescription },
  ];

  const text = await callTransport(provider.kind, getTransportConfig(), messages, {
    temperature: 0.7,
    max_tokens: TRANSLATE_MAX_TOKENS,
  });

  // Clean up — strip quotes and stray prefixes
  return text.replace(/^["']|["']$/g, "").trim();
}

// ---- Suggesting a description from the scene the author already wrote -------

/**
 * Arabic in, Arabic out. This is NOT the bridge.
 *
 * The description field was the last place the visual writer still asked an
 * author to think like a prompt engineer: it wanted a subject with no style, no
 * lighting and no signage, from someone who had just written a paragraph of
 * prose. This reads that paragraph and proposes the description, in Arabic, for
 * the author to edit. The English translation still happens afterwards, in the
 * bridge — one job per call.
 *
 * The constraints are the same ones IMAGES_SPEC.md gives a human: subject only,
 * because style belongs to أسلوب_الصور; and no written words in the picture,
 * because image models cannot draw Arabic script.
 */
const SUGGEST_SYSTEM_PROMPT =
  "أنت تقترح وصفًا لصورة تُرسم لمقطع من قصة تفاعلية.\n" +
  "اقرأ نصّ المقطع، ثمّ اكتب وصفًا عربيًّا قصيرًا لما يظهر في الصورة: من فيها، وأين، ومتى.\n" +
  "الموضوع وحده. لا إضاءة ولا مزاج ولا ألوان ولا تكوين ولا زاوية تصوير — كلّ ذلك يأتي من مكان آخر.\n" +
  "لا تطلب لافتة ولا كتابًا مفتوحًا ولا أيّ كلام مكتوب داخل الصورة.\n" +
  "إذا رافقت الطلبَ أوصافُ شخصيات، فاذكر الشخصية باسمها وانقل عمرها وهيئتها ولباسها إلى الوصف، ولو سكت عنها نصّ المقطع.\n" +
  "جملة واحدة. دون علامات اقتباس، ودون مقدّمة، ودون شرح.";

/**
 * @param characters The story's `أوصاف_الشخصيات`, whole. Not filtered by
 * relevance here: the prose is what decides who is in the scene, and this call
 * is reading the prose. The reported failure was the opposite of over-supply —
 * prose saying only "وقف سليمٌ" produced a description with no age, and the
 * image model drew a man of seventy.
 */
export async function suggestImageDescription(
  sceneTitle: string,
  prose: string,
  characters?: string | null,
): Promise<string> {
  const text = prose.trim();
  if (text.length === 0) {
    throw new Error("اكتب نصّ المقطع أولًا، ثمّ اطلب اقتراح وصف.");
  }

  const provider = getSelectedProvider();
  const apiKey = getApiKey(provider.id);
  if (provider.requiresKey && (!apiKey || apiKey.length === 0)) {
    throw new Error(
      `لم يُضبط مفتاح API للمزوّد ${provider.nameAr}. افتح الإعدادات وأدخل المفتاح.`,
    );
  }

  const suggestion = await callTransport(
    provider.kind,
    getTransportConfig(),
    [
      { role: "system", content: SUGGEST_SYSTEM_PROMPT },
      {
        role: "user",
        content:
          `اسم المقطع: ${sceneTitle || "دون اسم"}\n\nنصّ المقطع:\n${text}` +
          (characterLines(characters).length > 0
            ? `\n\nأوصاف الشخصيات:\n${characterLines(characters).join("\n")}`
            : ""),
      },
    ],
    { temperature: 0.6, max_tokens: TRANSLATE_MAX_TOKENS },
  );

  return suggestion.replace(/^["'«»]|["'«»]$/g, "").trim();
}

// ---- Image generation transports -------------------------------------------

/**
 * Generate an image via Together AI (FLUX.1 schnell).
 * Model: `black-forest-labs/FLUX.1-schnell`.
 */
async function togetherGenerateImage(
  apiKey: string,
  model: string,
  englishPrompt: string,
): Promise<string> {
  const url = "https://api.together.xyz/v1/images/generations";
  const body = {
    model,
    prompt: englishPrompt,
    width: 1024,
    height: 768,
    steps: 4,
    n: 1,
    response_format: "b64_json",
  };

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    if (res.status === 401 || res.status === 403) {
      throw new TransportError("مفتاح API غير صالح لتوجيذر. تحقق من المفتاح في الإعدادات.", "auth", res.status);
    }
    throw new TransportError(`خطأ من توجيذر (${res.status}): ${text.slice(0, 200)}`, "server", res.status);
  }

  const json = (await res.json()) as {
    data?: Array<{ b64_json?: string; url?: string }>;
  };

  const b64 = json.data?.[0]?.b64_json;
  if (!b64) {
    throw new TransportError("لم تُرجع توجيذر صورة.", "empty");
  }

  return `data:image/png;base64,${b64}`;
}

/**
 * Generate an image via OpenAI (gpt-image-2).
 *
 * NO `response_format` HERE. The gpt-image family always returns base64 and
 * rejects the parameter outright — `400 Unknown parameter:
 * 'response_format'` — so sending it was not a redundant field, it was the
 * whole call failing. Measured both ways on 2 Aug 2026: with it, 400; without
 * it, 200 and `b64_json` present. It shipped because nobody had ever run this
 * path against a live key.
 */
export function openaiImageRequestBody(
  model: string,
  englishPrompt: string,
): Record<string, unknown> {
  return {
    model,
    prompt: englishPrompt,
    n: 1,
    size: "1024x1024",
  };
}

async function openaiGenerateImage(
  apiKey: string,
  model: string,
  englishPrompt: string,
): Promise<string> {
  const url = "https://api.openai.com/v1/images/generations";
  const body = openaiImageRequestBody(model, englishPrompt);

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    if (res.status === 401 || res.status === 403) {
      throw new TransportError("مفتاح API غير صالح لأوبن إيه آي. تحقق من المفتاح في الإعدادات.", "auth", res.status);
    }
    throw new TransportError(`خطأ من أوبن إيه آي (${res.status}): ${text.slice(0, 200)}`, "server", res.status);
  }

  const json = (await res.json()) as {
    data?: Array<{ b64_json?: string; url?: string }>;
  };

  const b64 = json.data?.[0]?.b64_json;
  if (!b64) {
    throw new TransportError("لم تُرجع أوبن إيه آي صورة.", "empty");
  }

  return `data:image/png;base64,${b64}`;
}

/**
 * Generate an image via Gemini.
 * Gemini returns inline image data in the generateContent response.
 */
async function geminiGenerateImage(
  apiKey: string,
  model: string,
  englishPrompt: string,
): Promise<string> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`;

  const body = {
    contents: [
      {
        parts: [{ text: `Generate an image: ${englishPrompt}` }],
      },
    ],
    generationConfig: {
      responseModalities: ["IMAGE", "TEXT"],
    },
  };

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    if (res.status === 401 || res.status === 403) {
      throw new TransportError("مفتاح API غير صالح لجيميناي. تحقق من المفتاح في الإعدادات.", "auth", res.status);
    }
    throw new TransportError(`خطأ من جيميناي (${res.status}): ${text.slice(0, 200)}`, "server", res.status);
  }

  const json = (await res.json()) as {
    candidates?: Array<{
      content?: {
        parts?: Array<{
          inlineData?: { mimeType?: string; data?: string };
          text?: string;
        }>;
      };
    }>;
  };

  for (const part of json.candidates?.[0]?.content?.parts ?? []) {
    if (part.inlineData?.data && part.inlineData?.mimeType) {
      return `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
    }
  }

  throw new TransportError("لم تُرجع جيميناي صورة.", "empty");
}

// ---- Public API -------------------------------------------------------------

export interface ImageGenResult {
  /** The generated image as a data URL (PNG from the provider). */
  dataUrl: string;
  /** The English prompt produced by the bridge (for review logging only). */
  englishPrompt: string;
  /** Wall-clock ms for the translation call. */
  translateMs: number;
  /** Wall-clock ms for the image generation call. */
  drawMs: number;
}

export type GenStep = "translate" | "draw";

/**
 * Generate one image from an Arabic description.
 *
 * Call 1: Arabic → English prompt via the text provider (no MASTERY prompt).
 * Call 2: English prompt → image via the image provider.
 *
 * Returns the raw PNG data URL from the provider.
 * Downscaling and WebP encoding happen in the storage layer (image-db.ts).
 */
export async function generateImage(
  arabicDescription: string,
  imageStyle: string | null | undefined,
  characters?: string | null,
  onProgress?: (step: GenStep) => void,
): Promise<ImageGenResult> {
  // Call 1 — text model: Arabic → English (description only, no style)
  onProgress?.("translate");
  const t0 = Date.now();
  let translated: string;
  try {
    translated = await arabicToEnglishPrompt(arabicDescription);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "خطأ غير معروف";
    throw new Error(`فشلت الترجمة: ${msg}`);
  }
  const translateMs = Date.now() - t0;

  // Append the characters this scene is about, then the story style — both
  // translated, because the image model reads English. Characters go next to
  // the subject they describe and before the style, which is about the picture
  // rather than the people in it.
  //
  // A failure in either must not lose the picture: fall back to what we already
  // have, which is what the author got before that clause crossed the bridge.
  // The subject comes back as a sentence ("Salim is standing in the
  // courtyard."), and the clauses after it are keywords. Without this the
  // prompt reads "…courtyard., a boy of ten".
  const append = (prompt: string, clause: string) =>
    `${prompt.replace(/[.\s]+$/, "")}, ${clause}`;

  let englishPrompt = translated;

  const relevant = relevantCharacterLines(characters, arabicDescription);
  if (relevant.length > 0) {
    try {
      const englishCharacters = (
        await Promise.all(relevant.map((line) => arabicCharacterToEnglish(line)))
      )
        .map((s) => s.trim())
        .filter((s) => s.length > 0);
      if (englishCharacters.length > 0) {
        englishPrompt = append(englishPrompt, englishCharacters.join(", "));
      }
    } catch {
      // Keep the subject; a character we could not translate is a detail lost,
      // not a picture lost.
    }
  }

  if (imageStyle && imageStyle.trim()) {
    try {
      const englishStyle = await arabicStyleToEnglish(imageStyle);
      if (englishStyle) englishPrompt = append(englishPrompt, englishStyle);
    } catch {
      // Same reasoning — the style is a detail, the picture is the point.
    }
  }

  // Call 2 — image model: English → image
  onProgress?.("draw");
  const t1 = Date.now();
  const imageProvider = getImageProvider();
  const imageModel = getImageModel();
  const imageApiKey = getImageApiKey();

  if (imageProvider.requiresKey && (!imageApiKey || imageApiKey.length === 0)) {
    throw new Error(
      `لم يُضبط مفتاح API لمزوّد الصور ${imageProvider.nameAr}. افتح الإعدادات وأدخل المفتاح.`,
    );
  }

  let dataUrl: string;

  try {
    switch (imageProvider.id) {
      case "together":
        dataUrl = await togetherGenerateImage(imageApiKey!, imageModel, englishPrompt);
        break;
      case "openai":
        dataUrl = await openaiGenerateImage(imageApiKey!, imageModel, englishPrompt);
        break;
      case "gemini":
        dataUrl = await geminiGenerateImage(imageApiKey!, imageModel, englishPrompt);
        break;
      default:
        throw new Error(
          `المزوّد ${imageProvider.nameAr} لا يدعم توليد الصور.`,
        );
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : "خطأ غير معروف";
    throw new Error(`فشل توليد الصورة: ${msg}`);
  }
  const drawMs = Date.now() - t1;

  return { dataUrl, englishPrompt, translateMs, drawMs };
}
