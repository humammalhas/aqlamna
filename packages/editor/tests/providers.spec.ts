// ---------------------------------------------------------------------------
// Provider registry tests.
//
// These exist because AI co-writing was 100% broken on the live site while
// every unit test was green: the registry shipped model IDs that no longer
// exist on the real APIs, and the selected model was stored in ONE global
// localStorage slot shared by all 11 providers — so a Google model ID was
// sent to Anthropic and came back 404.
//
// Neither failure is visible from reading the code. Both are visible here.
// ---------------------------------------------------------------------------

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { ALL_PROVIDERS, providerById } from "../src/lib/providers.js";
import { openaiImageRequestBody } from "../src/lib/image-gen.js";
import {
  setSelectedProviderId,
  setSelectedModel,
  getSelectedModel,
  getEffectiveModel,
  getTransportConfig,
  setApiKey,
  clearAllKeys,
} from "../src/lib/ai-keys.js";
import { callTransport } from "../src/lib/transport.js";

/**
 * Providers whose model field is free text — OpenRouter proxies 100+ models,
 * and the local servers run whatever the author pulled onto their own machine,
 * so their `models` array is a starting point, not a closed set.
 */
const FREE_TEXT_MODEL_PROVIDERS = new Set(["openrouter", "lmstudio", "ollama"]);

/**
 * Model IDs that were shipped and are wrong. Each one was either measured
 * failing against the live API or is absent from the provider's own current
 * model list. A row here is a regression guard, not a style preference.
 */
const DEAD_MODEL_IDS = [
  // Together — non-serverless, returns 400 "Unable to access non-serverless model"
  "meta-llama/Llama-4-Scout-17B-16E-Instruct",
  // Together — absent from the serverless catalogue
  "mistralai/Mixtral-8x7B-Instruct-v0.1",
  "Qwen/Qwen2.5-72B-Instruct-Turbo",
  // Gemini — 404 "is not found for API version v1beta"
  "gemini-3-flash",
  "gemini-3.1-pro",
  "gemini-3.1-flash-image-preview",
  // Anthropic — not valid API model strings
  "claude-sonnet-4-6",
  "claude-opus-4-6",
  // DeepSeek — retired 2026-07-24
  "deepseek-chat",
  "deepseek-reasoner",
  // Groq — shutdown 2026-08-16
  "llama-3.3-70b-versatile",
  "llama-3.1-8b-instant",
  "qwen/qwen-3-32b",
  // Mistral — retired, replaced by dated IDs
  "open-mistral-nemo",
  // Venice — absent from Venice's own catalogue
  "llama-3.3-70b",
  "deepseek-v3.2",
  "google-gemma-4-31b-it",
  // OpenAI — image model shutdown 2026-12-01
  "gpt-image-1",
  // OpenRouter — bare "auto" is not a model ID; it needs the vendor prefix
  "auto",
];

describe("provider registry — model IDs", () => {
  it("every provider's defaultModel is one of its own models", () => {
    for (const p of ALL_PROVIDERS) {
      expect(p.models, `${p.id}: defaultModel not in models[]`).toContain(
        p.defaultModel,
      );
    }
  });

  it("no provider ships a retired, non-existent or non-serverless model ID", () => {
    const offenders: string[] = [];
    for (const p of ALL_PROVIDERS) {
      for (const dead of DEAD_MODEL_IDS) {
        if (p.models.includes(dead)) offenders.push(`${p.id}.models: ${dead}`);
        if (p.defaultModel === dead) offenders.push(`${p.id}.defaultModel: ${dead}`);
        if (p.imageModel === dead) offenders.push(`${p.id}.imageModel: ${dead}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("every provider that claims image support names an image model", () => {
    for (const p of ALL_PROVIDERS) {
      if (p.supportsImages) {
        expect(p.imageModel, `${p.id}`).toBeTruthy();
      } else {
        expect(p.imageModel, `${p.id}`).toBeNull();
      }
    }
  });

  it("no provider lists a model twice", () => {
    for (const p of ALL_PROVIDERS) {
      expect(new Set(p.models).size, `${p.id}`).toBe(p.models.length);
    }
  });
});

describe("selected model is per-provider, never global", () => {
  beforeEach(() => {
    localStorage.clear();
    clearAllKeys();
  });

  // The exact shape of the live bug: a Gemini model ID was resolved while
  // Anthropic was selected, and Anthropic answered 404 "model: gemini-3-flash".
  it("a model left in the legacy global slot never resolves for another provider", () => {
    localStorage.setItem("aqlamna-model", "gemini-2.5-flash");

    setSelectedProviderId("anthropic");
    const anthropic = providerById("anthropic")!;

    expect(anthropic.models).toContain(getEffectiveModel());
  });

  it("choosing a model under provider A leaves provider B on its own default", () => {
    const gemini = providerById("gemini")!;
    const anthropic = providerById("anthropic")!;

    setSelectedProviderId("gemini");
    setSelectedModel("gemini", gemini.models[gemini.models.length - 1]!);
    expect(getEffectiveModel()).toBe(gemini.models[gemini.models.length - 1]);

    setSelectedProviderId("anthropic");
    expect(getEffectiveModel()).toBe(anthropic.defaultModel);
    expect(anthropic.models).toContain(getEffectiveModel());

    // ...and going back to Gemini still remembers the Gemini choice.
    setSelectedProviderId("gemini");
    expect(getEffectiveModel()).toBe(gemini.models[gemini.models.length - 1]);
  });

  it("every provider resolves to one of its own models, whatever was stored", () => {
    for (const p of ALL_PROVIDERS) {
      // Poison every other provider's slot, then select this one.
      for (const other of ALL_PROVIDERS) {
        setSelectedModel(other.id, "totally-made-up-model-id");
      }
      setSelectedProviderId(p.id);

      if (FREE_TEXT_MODEL_PROVIDERS.has(p.id)) {
        expect(getEffectiveModel(), p.id).toBe("totally-made-up-model-id");
      } else {
        expect(p.models, p.id).toContain(getEffectiveModel());
      }
    }
  });

  it("a stored model that is not in the provider's list is discarded", () => {
    setSelectedModel("gemini", "gemini-3-flash"); // the ID that 404'd
    setSelectedProviderId("gemini");

    expect(getSelectedModel("gemini")).toBe("");
    expect(getEffectiveModel()).toBe(providerById("gemini")!.defaultModel);
  });

  it("free-text providers keep whatever the author typed", () => {
    setSelectedModel("openrouter", "anthropic/claude-opus-5");
    setSelectedProviderId("openrouter");
    expect(getEffectiveModel()).toBe("anthropic/claude-opus-5");
  });
});

// ---------------------------------------------------------------------------
// "OpenAI-compatible" is a family resemblance, not a contract. Both of these
// were measured against the live APIs on 2 Aug 2026 and both are 400s — the
// feature does not degrade, it stops.
// ---------------------------------------------------------------------------

describe("chat body matches what each provider actually accepts", () => {
  let fetchSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    localStorage.clear();
    clearAllKeys();
    // A fresh Response per call — one shared instance has its body consumed by
    // the first `.json()` and every later call throws.
    fetchSpy = vi.fn(async () =>
      new Response(JSON.stringify({ choices: [{ message: { content: "OK" } }] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchSpy);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  /** Send one message as the selected provider and return the parsed body. */
  async function bodySentFor(providerId: string): Promise<Record<string, unknown>> {
    setSelectedProviderId(providerId);
    setApiKey(providerId, "test-key");
    const provider = providerById(providerId)!;
    await callTransport(
      provider.kind,
      getTransportConfig(),
      [{ role: "user", content: "hi" }],
      { temperature: 0.7, max_tokens: 2048 },
    );
    const init = fetchSpy.mock.calls[0]![1] as RequestInit;
    return JSON.parse(init.body as string);
  }

  it("OpenAI gets max_completion_tokens and no temperature", async () => {
    const body = await bodySentFor("openai");
    // 400 Unsupported parameter: 'max_tokens' is not supported with this model
    expect(body).not.toHaveProperty("max_tokens");
    expect(body["max_completion_tokens"]).toBe(2048);
    // 400 Unsupported value: 'temperature' does not support 0.7 with this model
    expect(body).not.toHaveProperty("temperature");
  });

  it("every other OpenAI-compatible provider keeps max_tokens and temperature", async () => {
    for (const p of ALL_PROVIDERS) {
      if (p.kind !== "openai-compatible" || p.id === "openai") continue;
      fetchSpy.mockClear();
      const body = await bodySentFor(p.id);
      expect(body["max_tokens"], p.id).toBe(2048);
      expect(body["temperature"], p.id).toBe(0.7);
      expect(body, p.id).not.toHaveProperty("max_completion_tokens");
    }
  });

  it("the model in the body is one the provider serves", async () => {
    const body = await bodySentFor("deepseek");
    expect(providerById("deepseek")!.models).toContain(body["model"]);
  });
});

describe("OpenAI image generation", () => {
  // Measured both ways on 2 Aug 2026: with `response_format` the call is
  // 400 "Unknown parameter: 'response_format'", without it 200 and b64_json
  // present. The gpt-image family always returns base64.
  it("does not send response_format — gpt-image-* rejects it outright", () => {
    const body = openaiImageRequestBody("gpt-image-2", "a grey square");
    expect(body).not.toHaveProperty("response_format");
    expect(body["model"]).toBe("gpt-image-2");
  });
});
