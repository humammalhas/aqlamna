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
  getEffectiveBaseUrl,
  getEffectiveModel,
  getApiKey,
} from "./ai-keys.js";
import {
  getImageProvider,
  getImageModel,
  getImageApiKey,
} from "./ai-keys.js";

// ---- Bridge: Arabic → English prompt ---------------------------------------

const BRIDGE_SYSTEM_PROMPT =
  "Translate this Arabic description faithfully into English. " +
  "Output ONLY the English translation — no style, no lighting, no mood, " +
  "no composition, no camera direction, no atmosphere words. " +
  "Just the subject. No explanation, no prefix, no quotation marks.";

/**
 * Translate an Arabic description into an English image prompt using the
 * currently selected text provider. This call does NOT include the
 * ARABIC_MASTERY system prompt — that corpus governs prose, not pictures.
 */
async function arabicToEnglishPrompt(arabicDescription: string): Promise<string> {
  const provider = getSelectedProvider();
  const baseUrl = getEffectiveBaseUrl();
  const model = getEffectiveModel();
  const apiKey = getApiKey(provider.id);

  if (provider.requiresKey && (!apiKey || apiKey.length === 0)) {
    throw new Error(`لم يُضبط مفتاح API للمزوّد ${provider.nameAr}. افتح الإعدادات وأدخل المفتاح.`);
  }

  const messages: ChatMessage[] = [
    { role: "system", content: BRIDGE_SYSTEM_PROMPT },
    { role: "user", content: arabicDescription },
  ];

  const text = await callTransport(provider.kind, { baseUrl, model, apiKey: apiKey ?? undefined }, messages, {
    temperature: 0.7,
    max_tokens: 200,
  });

  // Clean up — strip quotes and stray prefixes
  return text.replace(/^["']|["']$/g, "").trim();
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
 * Generate an image via OpenAI (DALL-E / gpt-image-1).
 */
async function openaiGenerateImage(
  apiKey: string,
  model: string,
  englishPrompt: string,
): Promise<string> {
  const url = "https://api.openai.com/v1/images/generations";
  const body = {
    model,
    prompt: englishPrompt,
    n: 1,
    size: "1024x1024",
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

  // Append story-level image style if the author set one
  const englishPrompt = imageStyle
    ? `${translated}, ${imageStyle}`
    : translated;

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
