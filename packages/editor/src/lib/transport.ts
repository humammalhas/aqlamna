// ---------------------------------------------------------------------------
// Transport layer — one function per provider kind. Each converts to and from
// the internal ChatMessage shape, builds the correct URL/headers/body, and
// returns the assistant text or throws a structured error.
// ---------------------------------------------------------------------------

import type { ProviderKind } from "./providers.js";

// ---- Internal message shape ------------------------------------------------

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface TransportConfig {
  baseUrl: string;
  model: string;
  apiKey?: string;
}

export interface TransportOptions {
  temperature?: number;
  max_tokens?: number;
}

// ---- Error types -----------------------------------------------------------

export class TransportError extends Error {
  constructor(
    message: string,
    public readonly code: "auth" | "cors" | "server" | "network" | "empty",
    public readonly status?: number,
  ) {
    super(message);
    this.name = "TransportError";
  }
}

// ---- Public dispatch -------------------------------------------------------

/**
 * Call the right transport for the given provider kind. Returns the assistant's
 * text content or throws a TransportError.
 */
export async function callTransport(
  kind: ProviderKind,
  config: TransportConfig,
  messages: ChatMessage[],
  options?: TransportOptions,
): Promise<string> {
  switch (kind) {
    case "openai-compatible":
      return openaiCompatibleChat(config, messages, options);
    case "anthropic":
      return anthropicMessages(config, messages, options);
    case "gemini":
      return geminiGenerateContent(config, messages, options);
  }
}

// ---- OpenAI-compatible transport -------------------------------------------

async function openaiCompatibleChat(
  config: TransportConfig,
  messages: ChatMessage[],
  options?: TransportOptions,
): Promise<string> {
  const url = `${config.baseUrl}v1/chat/completions`;
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (config.apiKey) {
    headers["Authorization"] = `Bearer ${config.apiKey}`;
  }

  const body = {
    model: config.model,
    messages,
    temperature: options?.temperature ?? 0.7,
    max_tokens: options?.max_tokens ?? 2048,
  };

  const res = await fetchWithCorsDetection(url, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    await throwStructuredError(res, "openai-compatible");
  }

  const json = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const content = json.choices?.[0]?.message?.content;
  if (!content || content.trim().length === 0) {
    throw new TransportError("لم يُرجع النموذج أي نص.", "empty");
  }
  return content.trim();
}

// ---- Anthropic transport ---------------------------------------------------

async function anthropicMessages(
  config: TransportConfig,
  messages: ChatMessage[],
  options?: TransportOptions,
): Promise<string> {
  const url = `${config.baseUrl}v1/messages`;

  // Separate system message(s) from conversation messages
  const systemParts = messages.filter((m) => m.role === "system").map((m) => m.content);
  const conversation = messages.filter((m) => m.role !== "system").map((m) => ({
    role: m.role,
    content: m.content,
  }));

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "x-api-key": config.apiKey ?? "",
    "anthropic-version": "2023-06-01",
    "anthropic-dangerous-direct-browser-access": "true",
  };

  const body: Record<string, unknown> = {
    model: config.model,
    max_tokens: options?.max_tokens ?? 2048,
    messages: conversation,
  };
  if (systemParts.length > 0) {
    body["system"] = systemParts.join("\n\n");
  }
  if (options?.temperature !== undefined) {
    body["temperature"] = options.temperature;
  }

  const res = await fetchWithCorsDetection(url, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    await throwStructuredError(res, "anthropic");
  }

  const json = (await res.json()) as {
    content?: Array<{ type: string; text?: string }>;
  };
  const text = json.content?.find((c) => c.type === "text")?.text;
  if (!text || text.trim().length === 0) {
    throw new TransportError("لم يُرجع النموذج أي نص.", "empty");
  }
  return text.trim();
}

// ---- Gemini transport ------------------------------------------------------

async function geminiGenerateContent(
  config: TransportConfig,
  messages: ChatMessage[],
  _options?: TransportOptions,
): Promise<string> {
  const url = `${config.baseUrl}v1beta/models/${config.model}:generateContent?key=${encodeURIComponent(config.apiKey ?? "")}`;

  // Separate system message from user messages
  const systemMsg = messages.find((m) => m.role === "system");
  const userMsgs = messages.filter((m) => m.role !== "system");

  const body: Record<string, unknown> = {
    contents: userMsgs.map((m) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content }],
    })),
  };
  if (systemMsg) {
    body["systemInstruction"] = {
      parts: [{ text: systemMsg.content }],
    };
  }

  const res = await fetchWithCorsDetection(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    await throwStructuredError(res, "gemini");
  }

  const json = (await res.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };
  const text = json.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text || text.trim().length === 0) {
    throw new TransportError("لم يُرجع النموذج أي نص.", "empty");
  }
  return text.trim();
}

// ---- Helpers ---------------------------------------------------------------

/**
 * Wraps fetch to detect opaque CORS failures. When a browser blocks a
 * cross-origin request due to CORS, fetch throws a TypeError with message
 * "Failed to fetch" — no status, no response body. We surface a specific
 * Arabic message instead of the raw browser string.
 */
async function fetchWithCorsDetection(
  url: string,
  init: RequestInit,
): Promise<Response> {
  try {
    return await fetch(url, init);
  } catch (err: unknown) {
    if (err instanceof TypeError && err.message === "Failed to fetch") {
      throw new TransportError(
        "فشل الاتصال: على الأرجح أن المزوّد يمنع الطلبات المباشرة من المتصفح (CORS). جرّب استخدام أوبن راوتر (openrouter.ai) أو شغّل نموذجاً محلياً عبر أولاما (ollama) — كلاهما يعمل من المتصفح دون مشاكل.",
        "cors",
      );
    }
    throw new TransportError(
      `فشل الاتصال: ${err instanceof Error ? err.message : "خطأ غير معروف"}`,
      "network",
    );
  }
}

async function throwStructuredError(
  res: Response,
  _kind: ProviderKind,
): Promise<never> {
  const body = await res.text().catch(() => "");

  if (res.status === 401 || res.status === 403) {
    throw new TransportError(
      "مفتاح API غير صالح. تحقق من المفتاح في الإعدادات.",
      "auth",
      res.status,
    );
  }

  throw new TransportError(
    `خطأ في الاتصال (${res.status}): ${body.slice(0, 200)}`,
    res.status >= 500 ? "server" : "network",
    res.status,
  );
}
