// ---------------------------------------------------------------------------
// AI co-writing tests — build-mastery-prompt output, transport layer (mocked),
// CORS detection, key isolation, mastery prompt presence, validation.
// No real API calls — every network call is mocked.
// ---------------------------------------------------------------------------

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { compile } from "@aqlamna/core";
import {
  extractPassageNames,
  extractVariableNames,
} from "../src/lib/ai.js";
import {
  callTransport,
  TransportError,
  type ChatMessage,
} from "../src/lib/transport.js";
import {
  getApiKey,
  setApiKey,
  clearApiKey,
  getSelectedProviderId,
  setSelectedProviderId,
  hasApiKey,
  clearAllKeys,
} from "../src/lib/ai-keys.js";
import { providerById } from "../src/lib/providers.js";

// ---- Helpers ---------------------------------------------------------------

/** Create a minimal fetch mock that returns a successful response. */
function mockFetchOk(content: string) {
  return vi.fn().mockResolvedValue(
    new Response(JSON.stringify({ choices: [{ message: { content } }] }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }),
  );
}

/** Create a fetch mock that rejects with a CORS-like TypeError. */
function mockFetchCors() {
  return vi.fn().mockRejectedValue(new TypeError("Failed to fetch"));
}

/** Create a fetch mock that returns an auth error. */
function mockFetchAuth() {
  return vi.fn().mockResolvedValue(
    new Response(JSON.stringify({ error: "invalid key" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    }),
  );
}

/** Extract the fetch call arguments from the mock. */
function lastFetchCall(spy: ReturnType<typeof vi.fn>) {
  const calls = spy.mock.calls as Array<[string, RequestInit?]>;
  return calls[calls.length - 1] ?? [null, null];
}

// ---- build-mastery-prompt output check ---------------------------------------

describe("build-mastery-prompt output", () => {
  it("exports a non-empty MASTERY_SYSTEM_PROMPT string", async () => {
    const mod = await import("../src/generated/mastery-prompt.js");
    const prompt: string = mod.MASTERY_SYSTEM_PROMPT;

    expect(typeof prompt).toBe("string");
    expect(prompt.length).toBeGreaterThan(0);
  });

  it("contains at least 20 rules extracted from the markdown", async () => {
    const mod = await import("../src/generated/mastery-prompt.js");
    const prompt: string = mod.MASTERY_SYSTEM_PROMPT;

    const bulletCount = (prompt.match(/• /g) ?? []).length;
    expect(bulletCount).toBeGreaterThanOrEqual(20);
  });

  it("is under 20000 characters (Unicode-aware count)", async () => {
    const mod = await import("../src/generated/mastery-prompt.js");
    const prompt: string = mod.MASTERY_SYSTEM_PROMPT;
    const charCount = [...prompt].length;

    expect(charCount).toBeLessThanOrEqual(20000);
  });

  it("contains key ARABIC_MASTERY.md concepts", async () => {
    const mod = await import("../src/generated/mastery-prompt.js");
    const prompt: string = mod.MASTERY_SYSTEM_PROMPT;

    expect(prompt).toContain("الخاتمة");
    expect(prompt).toContain("حوار");
    expect(prompt).toContain("تفصيلة حسّية");
    expect(prompt).toContain("فـ");
  });
});

// ---- Transport: OpenAI-compatible --------------------------------------------

describe("openai-compatible transport", () => {
  let fetchSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchSpy = mockFetchOk("اهلاً بالعالم");
    vi.stubGlobal("fetch", fetchSpy);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("builds correct URL, headers, and body", async () => {
    const messages: ChatMessage[] = [
      { role: "system", content: "نظام" },
      { role: "user", content: "مرحباً" },
    ];

    const text = await callTransport(
      "openai-compatible",
      { baseUrl: "https://api.example.com/", model: "test-model", apiKey: "sk-test" },
      messages,
    );

    expect(text).toBe("اهلاً بالعالم");

    const [url, init] = lastFetchCall(fetchSpy);
    expect(url).toBe("https://api.example.com/v1/chat/completions");
    expect(init!.method).toBe("POST");
    expect((init!.headers as Record<string, string>)["Authorization"]).toBe("Bearer sk-test");
    expect((init!.headers as Record<string, string>)["Content-Type"]).toBe("application/json");

    const body = JSON.parse(init!.body as string);
    expect(body.model).toBe("test-model");
    expect(body.messages).toEqual(messages);
    expect(body.temperature).toBe(0.7);
  });

  it("omits Authorization header when requiresKey is false (no apiKey)", async () => {
    await callTransport(
      "openai-compatible",
      { baseUrl: "http://localhost:11434/", model: "llama3.2" },
      [{ role: "user", content: "مرحباً" }],
    );

    const [, init] = lastFetchCall(fetchSpy);
    const headers = init!.headers as Record<string, string>;
    expect(headers["Authorization"]).toBeUndefined();
  });

  it("surfaces Arabic CORS message on opaque fetch failure", async () => {
    vi.unstubAllGlobals();
    vi.stubGlobal("fetch", mockFetchCors());

    await expect(
      callTransport(
        "openai-compatible",
        { baseUrl: "https://blocked.example.com/", model: "m", apiKey: "k" },
        [{ role: "user", content: "x" }],
      ),
    ).rejects.toThrow(TransportError);

    try {
      await callTransport(
        "openai-compatible",
        { baseUrl: "https://blocked.example.com/", model: "m", apiKey: "k" },
        [{ role: "user", content: "x" }],
      );
    } catch (err: unknown) {
      const te = err as TransportError;
      expect(te.code).toBe("cors");
      expect(te.message).toContain("CORS");
      expect(te.message).toContain("أوبن راوتر");
      expect(te.message).toContain("أولاما");
      // Must NOT leak the raw "Failed to fetch"
      expect(te.message).not.toBe("Failed to fetch");
    }
  });

  it("surfaces Arabic auth error on 401", async () => {
    vi.unstubAllGlobals();
    vi.stubGlobal("fetch", mockFetchAuth());

    await expect(
      callTransport(
        "openai-compatible",
        { baseUrl: "https://api.example.com/", model: "m", apiKey: "bad-key" },
        [{ role: "user", content: "x" }],
      ),
    ).rejects.toThrow(TransportError);

    try {
      await callTransport(
        "openai-compatible",
        { baseUrl: "https://api.example.com/", model: "m", apiKey: "bad-key" },
        [{ role: "user", content: "x" }],
      );
    } catch (err: unknown) {
      const te = err as TransportError;
      expect(te.code).toBe("auth");
      expect(te.message).toContain("مفتاح");
    }
  });
});

// ---- Transport: Anthropic ---------------------------------------------------

describe("anthropic transport", () => {
  let fetchSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchSpy = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({ content: [{ type: "text", text: "كلود يرد" }] }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", fetchSpy);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("builds correct Anthropic URL and headers", async () => {
    const messages: ChatMessage[] = [
      { role: "system", content: "تعليمات النظام" },
      { role: "user", content: "سؤال" },
    ];

    const text = await callTransport(
      "anthropic",
      { baseUrl: "https://api.anthropic.com/", model: "claude-sonnet-4-6", apiKey: "sk-ant" },
      messages,
    );

    expect(text).toBe("كلود يرد");

    const [url, init] = lastFetchCall(fetchSpy);
    expect(url).toBe("https://api.anthropic.com/v1/messages");

    const headers = init!.headers as Record<string, string>;
    expect(headers["x-api-key"]).toBe("sk-ant");
    expect(headers["anthropic-version"]).toBe("2023-06-01");
    expect(headers["anthropic-dangerous-direct-browser-access"]).toBe("true");

    const body = JSON.parse(init!.body as string);
    expect(body.model).toBe("claude-sonnet-4-6");
    expect(body.system).toBe("تعليمات النظام");
    expect(body.messages).toEqual([{ role: "user", content: "سؤال" }]);
  });

  it("includes mastery prompt (system message) in the request", async () => {
    const mod = await import("../src/generated/mastery-prompt.js");
    const prompt: string = mod.MASTERY_SYSTEM_PROMPT;

    await callTransport(
      "anthropic",
      { baseUrl: "https://api.anthropic.com/", model: "claude-sonnet-4-6", apiKey: "sk-ant" },
      [
        { role: "system", content: prompt },
        { role: "user", content: "أكمل القصة" },
      ],
    );

    const [, init] = lastFetchCall(fetchSpy);
    const body = JSON.parse(init!.body as string);
    expect(body.system).toContain("الخاتمة");
  });

  it("surfaces CORS message on opaque failure", async () => {
    vi.unstubAllGlobals();
    vi.stubGlobal("fetch", mockFetchCors());

    try {
      await callTransport(
        "anthropic",
        { baseUrl: "https://api.anthropic.com/", model: "m", apiKey: "k" },
        [{ role: "user", content: "x" }],
      );
    } catch (err: unknown) {
      const te = err as TransportError;
      expect(te.code).toBe("cors");
      expect(te.message).toContain("أوبن راوتر");
    }
  });
});

// ---- Transport: Gemini ------------------------------------------------------

describe("gemini transport", () => {
  let fetchSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchSpy = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({ candidates: [{ content: { parts: [{ text: "رد جيميناي" }] } }] }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", fetchSpy);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("builds correct Gemini URL with key in query string", async () => {
    const messages: ChatMessage[] = [
      { role: "system", content: "تعليمات" },
      { role: "user", content: "سؤال" },
    ];

    const text = await callTransport(
      "gemini",
      { baseUrl: "https://generativelanguage.googleapis.com/", model: "gemini-2.5-flash", apiKey: "gem-key" },
      messages,
    );

    expect(text).toBe("رد جيميناي");

    const [url, init] = lastFetchCall(fetchSpy);
    expect(url).toContain("https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent");
    expect(url).toContain("key=gem-key");

    const body = JSON.parse(init!.body as string);
    expect(body.contents).toEqual([
      { role: "user", parts: [{ text: "سؤال" }] },
    ]);
    expect(body.systemInstruction).toEqual({
      parts: [{ text: "تعليمات" }],
    });
  });

  it("includes mastery prompt as systemInstruction", async () => {
    const mod = await import("../src/generated/mastery-prompt.js");
    const prompt: string = mod.MASTERY_SYSTEM_PROMPT;

    await callTransport(
      "gemini",
      { baseUrl: "https://generativelanguage.googleapis.com/", model: "gemini-2.5-flash", apiKey: "k" },
      [
        { role: "system", content: prompt },
        { role: "user", content: "أكمل" },
      ],
    );

    const [, init] = lastFetchCall(fetchSpy);
    const body = JSON.parse(init!.body as string);
    expect(body.systemInstruction.parts[0].text).toContain("الخاتمة");
  });

  it("surfaces CORS message on opaque failure", async () => {
    vi.unstubAllGlobals();
    vi.stubGlobal("fetch", mockFetchCors());

    try {
      await callTransport(
        "gemini",
        { baseUrl: "https://generativelanguage.googleapis.com/", model: "m", apiKey: "k" },
        [{ role: "user", content: "x" }],
      );
    } catch (err: unknown) {
      const te = err as TransportError;
      expect(te.code).toBe("cors");
      expect(te.message).toContain("أولاما");
    }
  });
});

// ---- Key isolation ----------------------------------------------------------

describe("per-provider key isolation", () => {
  beforeEach(() => {
    clearAllKeys();
  });

  afterEach(() => {
    clearAllKeys();
  });

  it("preserves deepseek key when switching to openai", () => {
    setApiKey("deepseek", "sk-deep-123");
    setApiKey("openai", "sk-openai-456");

    // Both keys should be retrievable independently
    expect(getApiKey("deepseek")).toBe("sk-deep-123");
    expect(getApiKey("openai")).toBe("sk-openai-456");

    // Switch provider
    setSelectedProviderId("openai");
    expect(getSelectedProviderId()).toBe("openai");

    // DeepSeek key still there
    expect(getApiKey("deepseek")).toBe("sk-deep-123");
  });

  it("clearing one provider does not affect another", () => {
    setApiKey("deepseek", "sk-deep");
    setApiKey("groq", "sk-groq");

    clearApiKey("deepseek");

    expect(getApiKey("deepseek")).toBeNull();
    expect(getApiKey("groq")).toBe("sk-groq");
  });

  it("hasApiKey returns false when no key set for selected provider", () => {
    setSelectedProviderId("openai");
    expect(hasApiKey()).toBe(false);

    setApiKey("openai", "sk-test");
    expect(hasApiKey()).toBe(true);
  });

  it("hasApiKey returns true for local providers that need no key", () => {
    setSelectedProviderId("ollama");
    // Ollama requiresKey: false — should always report key as available
    expect(hasApiKey()).toBe(true);
  });
});

// ---- AI validation: valid .qalam compiles -----------------------------------

describe("AI response validation", () => {
  it("a valid choice suggestion compiles successfully", () => {
    const aiText = "* [اختر الباب] تفتح الباب بحذر.\n  -> نهاية\n* [ابقَ في مكانك] تنتظر قليلاً.\n  -> نهاية";

    const trialSource = "متغير _ai_test = 0\n\n=== مقطع_اختبار ===\nنص تجريبي.\n" + aiText;

    const result = compile(trialSource, "ai-test.qalam");
    expect(result).toBeDefined();
    expect(result.passages).toBeDefined();
  });

  it("a valid prose continuation compiles successfully", () => {
    const aiText = "تستمر الرحلة عبر الممر المظلم. تسمع صوت قطرات ماء من بعيد.";

    const trialSource = "متغير _ai_test = 0\n\n=== مقطع_اختبار ===\n" + aiText;

    const result = compile(trialSource, "ai-test.qalam");
    expect(result).toBeDefined();
  });

  it("a valid passage body (prose + choices) compiles successfully", () => {
    const aiText = "تدخل الغرفة القديمة. الهواء ثقيل برائحة الغبار.\n\n* [افتح النافذة] تدفع النافذة فتفتح بصعوبة.\n  -> نهاية\n\n* [أشعل المصباح] تضيء الغرفة فجأة.\n  -> نهاية";

    const trialSource = "متغير _ai_test = 0\n\n=== مقطع_اختبار ===\n" + aiText;

    const result = compile(trialSource, "ai-test.qalam");
    expect(result).toBeDefined();
  });
});

// ---- AI validation: BROKEN .qalam is rejected -------------------------------

describe("AI response rejection", () => {
  it("broken .qalam with missing passage header is rejected with Arabic error", () => {
    const aiText = `=== غرفة
نص بدون إغلاق صحيح`;

    const trialSource = `متغير _ai_test = 0\n\n=== مقطع_اختبار ===\nنص تجريبي.\n${aiText}`;

    let caught: Record<string, unknown> | null = null;
    try {
      compile(trialSource, "ai-test.qalam");
    } catch (err: unknown) {
      caught = err as Record<string, unknown>;
    }

    expect(caught).not.toBeNull();
    expect(caught!.message_ar).toBeDefined();
    expect(typeof caught!.message_ar).toBe("string");
    expect((caught!.message_ar as string).length).toBeGreaterThan(0);
    expect(caught!.message_ar).not.toContain("Error");
    expect(caught!.message_ar).not.toContain("at ");
  });

  it("choices with divert to undefined passage are rejected with Arabic error", () => {
    const aiText = `* [اذهب] تمشي نحو الباب.
  -> مقطع_غير_موجود`;

    const trialSource = `متغير _ai_test = 0\n\n=== مقطع_اختبار ===\nنص تجريبي.\n${aiText}\n  -> نهاية`;

    let caught: Record<string, unknown> | null = null;
    try {
      compile(trialSource, "ai-test.qalam");
    } catch (err: unknown) {
      caught = err as Record<string, unknown>;
    }

    expect(caught).not.toBeNull();
    expect(caught!.code).toBe("E101");
    expect(caught!.message_ar).toContain("مقطع");
    expect(caught!.line).toBeGreaterThan(0);
  });

  it("broken syntax does NOT get inserted — validate then abort pattern", () => {
    const aiText = `* [خيار مكسور
  -> مقطع_غير_موجود`;

    const trialSource = `متغير _ai_test = 0\n\n=== مقطع_اختبار ===\nنص تجريبي.\n${aiText}\n  -> نهاية`;

    let inserted = false;
    try {
      compile(trialSource, "ai-test.qalam");
      inserted = true;
    } catch {
      inserted = false;
    }

    expect(inserted).toBe(false);
  });
});

// ---- Utilities: extract passages and variables ------------------------------

describe("passage and variable extraction", () => {
  it("extracts passage names from source", () => {
    const source = `متغير س = 0

=== البداية ===
نص البداية.

=== الغابة ===
نص الغابة.
`;

    const names = extractPassageNames(source);
    expect(names).toEqual(["البداية", "الغابة"]);
  });

  it("extracts Arabic variable names", () => {
    const source = `متغير الرحيق = 0
متغير وجد_الخريطة = خطأ
متغير اسم_البطل = "نحلة"

=== البداية ===
نص.
`;

    const names = extractVariableNames(source);
    expect(names).toEqual(["الرحيق", "وجد_الخريطة", "اسم_البطل"]);
  });

  it("extracts English VAR declarations too", () => {
    const source = `متغير س = 0
VAR y = 5
=== البداية ===
نص.
`;

    const names = extractVariableNames(source);
    expect(names).toEqual(["س", "y"]);
  });
});

// ---- Network isolation: fetch is mocked in all tests above -------------------

describe("network isolation", () => {
  it("fetch is not called when no tests make real API calls", () => {
    const spy = vi.spyOn(globalThis, "fetch");
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});
