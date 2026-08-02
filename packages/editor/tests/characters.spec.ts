// ---------------------------------------------------------------------------
// Character continuity.
//
// A scene whose prose says only "وقف سليمٌ في الفناء" tells the image model
// nothing about who Salim is, so every scene invents him again: a boy in one
// picture, an old man in the next. The story now carries أوصاف_الشخصيات — one
// line per character — and that line reaches BOTH the ✨ suggestion (so the
// suggested description names the right person) and the image bridge (so the
// drawing gets the same person twice).
//
// It is the same shape as أسلوب_الصور and it fails the same way if it does not
// cross the bridge: the image model cannot read Arabic, so an untranslated
// character line appends nothing at all.
// ---------------------------------------------------------------------------

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { compile } from "@aqlamna/core";
import { generateQalam } from "../src/lib/generate-qalam.js";
import { importWriterState } from "../src/lib/writer-import.js";
import {
  emptyWriterState,
  emptyScene,
  resetIds,
  type WriterState,
} from "../src/lib/writer-model.js";
import {
  suggestImageDescription,
  generateImage,
  relevantCharacterLines,
} from "../src/lib/image-gen.js";
import {
  setSelectedProviderId,
  setApiKey,
  setImageProviderId,
  clearAllKeys,
} from "../src/lib/ai-keys.js";

type StoryJSON = Parameters<typeof importWriterState>[0];

const SALIM = "سليم: صبيّ في العاشرة، شعر أسود قصير، قميص أزرق";
const GRANDMOTHER = "جدّته: امرأة في السبعين، ثوب مطرّز أخضر";

function storyWithCharacters(): WriterState {
  resetIds();
  const state = emptyWriterState();
  state.title = "طائرة الورق";
  state.imageStyle = "رسم كتب أطفال، ألوان ترابية";
  state.characters = `${SALIM}\n${GRANDMOTHER}`;
  state.images = [{ name: "الفناء", description: "سليم واقف في فناء البيت" }];
  const scene = emptyScene("البداية");
  scene.image = "الفناء";
  scene.prose = "وقف سليمٌ في الفناء.";
  scene.isEnding = true;
  state.scenes = [scene];
  return state;
}

// ---- 1. The language carries it -------------------------------------------

describe("أوصاف_الشخصيات is a story-level field", () => {
  it("serialises one line per character", () => {
    const src = generateQalam(storyWithCharacters());
    expect(src).toContain(`أوصاف_الشخصيات: "${SALIM}"`);
    expect(src).toContain(`أوصاف_الشخصيات: "${GRANDMOTHER}"`);
  });

  it("compiles into the story JSON", () => {
    const src = generateQalam(storyWithCharacters());
    const story = compile(src, "w.qalam", {
      timestamp: "2026-08-02T00:00:00.000Z",
    }) as unknown as { characters?: string[] };
    expect(story.characters).toEqual([SALIM, GRANDMOTHER]);
  });

  it("round-trips byte-identically", () => {
    const first = generateQalam(storyWithCharacters());
    const story = compile(first, "w.qalam", {
      timestamp: "2026-08-02T00:00:00.000Z",
    }) as unknown as StoryJSON;

    const imported = importWriterState(story);
    expect(imported.ok).toBe(true);
    if (!imported.ok) return;

    expect(imported.state.characters).toBe(`${SALIM}\n${GRANDMOTHER}`);
    expect(generateQalam(imported.state)).toBe(first);
  });

  it("a story with no characters emits no line and still round-trips", () => {
    const state = storyWithCharacters();
    state.characters = "";
    const first = generateQalam(state);
    expect(first).not.toContain("أوصاف_الشخصيات");

    const story = compile(first, "w.qalam", {
      timestamp: "2026-08-02T00:00:00.000Z",
    }) as unknown as StoryJSON;
    const imported = importWriterState(story);
    expect(imported.ok).toBe(true);
    if (!imported.ok) return;
    expect(imported.state.characters).toBe("");
    expect(generateQalam(imported.state)).toBe(first);
  });
});

// ---- 2. Picking the character the scene is actually about ------------------

describe("relevantCharacterLines", () => {
  const all = `${SALIM}\n${GRANDMOTHER}`;

  it("returns only the characters the description names", () => {
    expect(relevantCharacterLines(all, "سليم واقف في فناء البيت")).toEqual([SALIM]);
  });

  it("matches a name carrying a case ending or a prefix", () => {
    // "سليمًا" and "لسليم" are the same boy.
    expect(relevantCharacterLines(all, "نرى سليمًا يركض")).toEqual([SALIM]);
    expect(relevantCharacterLines(all, "الطائرة لسليم")).toEqual([SALIM]);
  });

  it("returns several when the scene holds several", () => {
    expect(relevantCharacterLines(all, "سليم مع جدّته في الفناء")).toEqual([
      SALIM,
      GRANDMOTHER,
    ]);
  });

  it("returns nothing when no character is named", () => {
    expect(relevantCharacterLines(all, "بيت حجري عند الغروب")).toEqual([]);
  });

  it("is empty for an empty field", () => {
    expect(relevantCharacterLines("", "سليم في الفناء")).toEqual([]);
    expect(relevantCharacterLines("   \n  ", "سليم")).toEqual([]);
  });
});

// ---- 3. The two AI calls ---------------------------------------------------

describe("character descriptions reach the model", () => {
  let fetchSpy: ReturnType<typeof vi.fn>;
  /** Every chat body the code sent, in order. */
  let chatBodies: Array<Record<string, unknown>>;

  beforeEach(() => {
    localStorage.clear();
    clearAllKeys();
    setSelectedProviderId("deepseek");
    setApiKey("deepseek", "test-key");
    setImageProviderId("together");
    setApiKey("together", "test-key");

    chatBodies = [];
    fetchSpy = vi.fn(async (url: string, init: RequestInit) => {
      const body = JSON.parse(init.body as string);
      if (String(url).includes("/chat/completions")) {
        chatBodies.push(body);
        const sent = JSON.stringify(body.messages);
        // Stand in for the text model: echo a marker when the character line
        // reached it, so the assertion is about the wiring, not about luck.
        let reply = "a courtyard";
        if (sent.includes("صبيّ في العاشرة")) reply = "a ten-year-old boy in a blue shirt";
        else if (sent.includes("رسم كتب أطفال")) reply = "children's book illustration";
        return new Response(JSON.stringify({ choices: [{ message: { content: reply } }] }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ data: [{ b64_json: "AAAA" }] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    });
    vi.stubGlobal("fetch", fetchSpy);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  // The reported bug: prose says only "وقف سليمٌ", the suggestion comes back
  // with no age, and FLUX draws an old man.
  it("✨ suggestion is given the character line the prose left out", async () => {
    await suggestImageDescription("البداية", "وقف سليمٌ في الفناء.", SALIM);

    const sent = JSON.stringify(chatBodies[0]!.messages);
    expect(sent).toContain("سليم");
    expect(sent).toContain("صبيّ في العاشرة");
  });

  it("✨ suggestion works with no characters set", async () => {
    await expect(
      suggestImageDescription("البداية", "وقف سليمٌ في الفناء.", ""),
    ).resolves.toBeTruthy();
  });

  it("the final English prompt carries the TRANSLATED character detail", async () => {
    const result = await generateImage(
      "سليم واقف في فناء البيت",
      "رسم كتب أطفال، ألوان ترابية",
      `${SALIM}\n${GRANDMOTHER}`,
    );

    // Translated, not verbatim — the image model cannot read Arabic, so an
    // Arabic clause here would silently do nothing.
    expect(result.englishPrompt).toContain("ten-year-old boy");
    expect(result.englishPrompt).not.toContain("صبيّ");
    expect(result.englishPrompt).not.toContain("سليم");
    // The grandmother is not in this scene and must not be drawn into it.
    expect(result.englishPrompt).not.toContain("seventy");
    // Keyword clauses follow a sentence; "courtyard., a boy of ten" is not it.
    expect(result.englishPrompt).not.toContain(".,");
  });

  it("losing the character translation keeps the picture", async () => {
    // A character this suite has not translated before — the cache is
    // module-level and by design outlives a single image, so a name already
    // seen would never reach the failing call.
    const khalid = "خالد: رجل في الأربعين، لحية قصيرة";

    fetchSpy.mockImplementation(async (url: string, init: RequestInit) => {
      const body = JSON.parse(init.body as string);
      if (String(url).includes("/chat/completions")) {
        const system = String(body.messages?.[0]?.content ?? "");
        // Fail only the character leg; the subject translation still works.
        if (system.includes("character description")) {
          return new Response("upstream on fire", { status: 500 });
        }
        return new Response(
          JSON.stringify({ choices: [{ message: { content: "a courtyard" } }] }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      return new Response(JSON.stringify({ data: [{ b64_json: "AAAA" }] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    });

    const result = await generateImage("خالد واقف في فناء البيت", null, khalid);
    expect(result.englishPrompt).toBe("a courtyard");
    expect(result.dataUrl).toContain("base64,AAAA");
  });

  // `max_tokens` bounds reasoning + text, and the default provider reasons.
  // At the budgets this file shipped with, every one of these calls came back
  // empty or cut mid-word against deepseek-v4-flash — silently, for the style.
  it("every call leaves room for a reasoning model to answer", async () => {
    await suggestImageDescription("البداية", "وقف سليمٌ في الفناء.", SALIM);
    await generateImage("سليم في الفناء", "رسم كتب أطفال", SALIM);

    const budgets = chatBodies.map((b) => b.max_tokens as number);
    expect(budgets.length).toBeGreaterThanOrEqual(3);
    for (const b of budgets) {
      // Measured worst case with reasoning was 392 completion tokens.
      expect(b).toBeGreaterThanOrEqual(1000);
    }
  });

  it("an empty translation is never cached", async () => {
    const rania = "رانية: فتاة في الثامنة، ضفيرتان";
    let calls = 0;
    fetchSpy.mockImplementation(async (url: string, init: RequestInit) => {
      const body = JSON.parse(init.body as string);
      if (String(url).includes("/chat/completions")) {
        const system = String(body.messages?.[0]?.content ?? "");
        if (system.includes("character description")) {
          calls += 1;
          // A reasoning-starved reply: HTTP 200, no text.
          const content = calls === 1 ? "" : "an eight-year-old girl, two braids";
          return new Response(JSON.stringify({ choices: [{ message: { content } }] }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        }
        return new Response(
          JSON.stringify({ choices: [{ message: { content: "a courtyard" } }] }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      return new Response(JSON.stringify({ data: [{ b64_json: "AAAA" }] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    });

    const first = await generateImage("رانية في الفناء", null, rania);
    expect(first.englishPrompt).toBe("a courtyard");

    const second = await generateImage("رانية في الفناء", null, rania);
    expect(second.englishPrompt).toContain("two braids");
    expect(calls).toBe(2);
  });

  it("a failed translation is not cached, so the next image retries", async () => {
    const hind = "هند: امرأة في الثلاثين، معطف رمادي";
    let characterCalls = 0;

    fetchSpy.mockImplementation(async (url: string, init: RequestInit) => {
      const body = JSON.parse(init.body as string);
      if (String(url).includes("/chat/completions")) {
        const system = String(body.messages?.[0]?.content ?? "");
        if (system.includes("character description")) {
          characterCalls += 1;
          if (characterCalls === 1) return new Response("nope", { status: 500 });
          return new Response(
            JSON.stringify({
              choices: [{ message: { content: "a woman in her thirties, grey coat" } }],
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          );
        }
        return new Response(
          JSON.stringify({ choices: [{ message: { content: "a courtyard" } }] }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      return new Response(JSON.stringify({ data: [{ b64_json: "AAAA" }] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    });

    const first = await generateImage("هند في الفناء", null, hind);
    expect(first.englishPrompt).toBe("a courtyard");

    const second = await generateImage("هند في الفناء", null, hind);
    expect(second.englishPrompt).toContain("grey coat");
    expect(characterCalls).toBe(2);
  });
});
