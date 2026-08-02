// ---------------------------------------------------------------------------
// AI service — multi-provider co-writing via the transport layer.
// Three actions: suggest choices, continue scene, write passage.
// Every response is validated via @aqlamna/core BEFORE being offered.
// ---------------------------------------------------------------------------

import { compile } from "@aqlamna/core";
import { normalizeChoiceSyntax } from "./ai-normalize.js";
import {
  getSelectedProvider,
  getTransportConfig,
  getApiKey,
} from "./ai-keys.js";
import { callTransport, TransportError, type ChatMessage } from "./transport.js";
import { MASTERY_SYSTEM_PROMPT } from "../generated/mastery-prompt.js";
import type { QalamError } from "../store.js";

// ---- Types -----------------------------------------------------------------

export type AIAction = "suggest_choices" | "continue_scene" | "write_passage";

export interface AIRequest {
  action: AIAction;
  /** The full .qalam source (story so far). */
  fullSource: string;
  /** The input text at/near the cursor that the action is about. */
  contextText: string;
  /** Names of all passages in the story (so AI doesn't invent references). */
  passageNames: string[];
  /** Names of all variables in the story (so AI doesn't invent references). */
  variableNames: string[];
  /** Optional human-written instruction prepended to the action prompt. */
  humanInstruction?: string;
}

export interface AIResponse {
  /** The raw text returned by the AI (before validation). */
  raw: string;
  /** The validated text that compiled successfully, or null. */
  valid: string | null;
  /** Error message if compile failed, in Arabic. */
  error: string | null;
}

// ---- Prompt builders -------------------------------------------------------

const ACTION_PROMPTS: Record<AIAction, (ctx: { contextText: string; passageNames: string[]; variableNames: string[] }) => string> = {
  suggest_choices: ({ contextText, passageNames, variableNames }) => {
    const names = passageNames.length > 0 ? passageNames.join("، ") : "(لا توجد مقاطع بعد)";
    const vars = variableNames.length > 0 ? variableNames.join("، ") : "(لا توجد متغيرات)";
    return `المقطع الحالي:
${contextText}

اقترح 3 خيارات بصيغة .qalam لهذا المقطع. اكتب الخيارات فقط (بدون شرح).

كل خيار سطران بهذا الشكل حرفيًّا — القوسان المعقوفان [ ] واجبان حول نصّ الزرّ:

* [نص الزرّ]
  -> اسم_المقطع

لا تكتب قائمة مرقّمة ولا شرطات. لا تحذف القوسين.
نصّ الزرّ قصير: من كلمتين إلى خمس. ما بعد القوسين — إن كتبته — سطر واحد يصف ما يحدث بعد الضغط.

أسماء المقاطع الموجودة: ${names}
أسماء المتغيرات الموجودة: ${vars}

لا تخترع أسماء مقاطع جديدة — استخدم فقط الأسماء الموجودة أعلاه. اكتب 3 خيارات فقط.`;
  },

  continue_scene: ({ contextText }) => {
    return `أكمل كتابة المشهد التالي بالعربية الفصحى. لا تضف خيارات ولا مقاطع جديدة — فقط استمر في السرد النثري للمشهد:

${contextText}

أكمل بـ 3-5 جمل مناسبة. ابدأ من حيث انتهى النصّ ولا تُعِد كتابة أيّ جملة منه — لا الأولى ولا غيرها. لا تكتب خيارات.`;
  },

  write_passage: ({ contextText, passageNames, variableNames }) => {
    const vars = variableNames.length > 0 ? variableNames.join("، ") : "(لا توجد متغيرات)";
    return `اكتب مقطعًا جديدًا بصيغة .qalam. المقطع الحالي الذي يحوّل إليه:

${contextText}

اكتب مشهدًا كاملاً من 4-6 جمل، ثم أضف 2-3 خيارات في النهاية.

الخيارات تُكتب بهذه الصيغة حرفيًّا، سطرًا لكل خيار، والقوسان المعقوفان واجبان:

* [نص الزرّ]

لا تكتب قائمة مرقّمة (١. ٢. ٣.) ولا شرطات ولا عنوانًا مثل "الخيارات:".

المتغيرات الموجودة (يمكنك استخدامها): ${vars}

ابدأ بنص المقطع مباشرة (لا تكتب === اسم_المقطع ===).`;
  },
};

// ---- API call --------------------------------------------------------------

export async function callAI(req: AIRequest): Promise<AIResponse> {
  const provider = getSelectedProvider();
  const apiKey = provider.requiresKey ? (getApiKey(provider.id) ?? undefined) : undefined;

  if (provider.requiresKey && (!apiKey || apiKey.length === 0)) {
    return {
      raw: "",
      valid: null,
      error: `لم يُضبط مفتاح API للمزوّد ${provider.nameAr}. افتح الإعدادات وأدخل المفتاح.`,
    };
  }

  let userPrompt = ACTION_PROMPTS[req.action]({
    contextText: req.contextText,
    passageNames: req.passageNames,
    variableNames: req.variableNames,
  });

  if (req.humanInstruction && req.humanInstruction.trim().length > 0) {
    userPrompt = `تعليمات الكاتب: ${req.humanInstruction.trim()}\n\n${userPrompt}`;
  }

  const messages: ChatMessage[] = [
    { role: "system", content: MASTERY_SYSTEM_PROMPT },
    { role: "user", content: userPrompt },
  ];

  // First attempt
  const firstRaw = await sendToProvider(provider.kind, messages);
  if (firstRaw.error) {
    return { raw: "", valid: null, error: firstRaw.error };
  }

  const validation = validateAIResponse(firstRaw.text, req);
  if (validation.valid) {
    return { raw: firstRaw.text, valid: validation.valid, error: null };
  }

  // Second attempt — feed the error back
  const retryMessages: ChatMessage[] = [
    { role: "system", content: MASTERY_SYSTEM_PROMPT },
    {
      role: "user",
      content: `محاولتك السابقة فشلت في التجميع (compile). الخطأ:
${validation.error}

أعد المحاولة. ${userPrompt}`,
    },
  ];

  const secondRaw = await sendToProvider(provider.kind, retryMessages);
  if (secondRaw.error) {
    // Both attempts failed — return raw text + original error
    return { raw: firstRaw.text, valid: null, error: validation.error };
  }

  const validation2 = validateAIResponse(secondRaw.text, req);
  if (validation2.valid) {
    return { raw: secondRaw.text, valid: validation2.valid, error: null };
  }

  // Both attempts failed — return first raw text + last error
  return { raw: firstRaw.text, valid: null, error: validation2.error ?? validation.error };
}

// ---- Provider call ---------------------------------------------------------

async function sendToProvider(
  kind: "openai-compatible" | "anthropic" | "gemini",
  messages: ChatMessage[],
): Promise<{ text: string; error: string | null }> {
  try {
    const text = await callTransport(kind, getTransportConfig(), messages, {
      temperature: 0.7,
      max_tokens: 2048,
    });
    return { text, error: null };
  } catch (err: unknown) {
    if (err instanceof TransportError) {
      return { text: "", error: err.message };
    }
    const msg = err instanceof Error ? err.message : "خطأ غير معروف";
    return { text: "", error: `فشل الاتصال: ${msg}` };
  }
}

// ---- Validation ------------------------------------------------------------

function validateAIResponse(
  rawText: string,
  req: AIRequest,
): { valid: string | null; error: string | null } {
  // Repair the shape BEFORE compiling, and hand the repaired text on as the
  // valid one — so the preview shows exactly what أضف will insert. Measured
  // against DeepSeek: a whole scene's choices came back as a numbered list, and
  // three good choices came back with no brackets and were refused outright.
  // See ai-normalize.ts; nothing is invented, only re-shaped.
  const aiText = normalizeChoiceSyntax(rawText);

  // Build a synthetic .qalam source that wraps the AI output so it can be compiled
  let trialSource: string;

  switch (req.action) {
    case "suggest_choices": {
      // Choices need a passage context to compile. Use a minimal passage.
      trialSource = `متغير _ai_test = 0\n\n=== مقطع_اختبار ===\nنص تجريبي.\n${aiText}\n  -> نهاية`;
      break;
    }
    case "continue_scene": {
      // Prose continuation is just text — wrap it in a passage
      trialSource = `متغير _ai_test = 0\n\n=== مقطع_اختبار ===\n${aiText}`;
      break;
    }
    case "write_passage": {
      // The AI writes a full passage body (prose + choices)
      trialSource = `متغير _ai_test = 0\n\n=== مقطع_اختبار ===\n${aiText}`;
      break;
    }
  }

  try {
    compile(trialSource, "ai-response.qalam");
    return { valid: aiText, error: null };
  } catch (err: unknown) {
    const qe = err as QalamError;
    if (qe && typeof qe.message_ar === "string") {
      return { valid: null, error: `خطأ تجميع: ${qe.message_ar} (سطر ${qe.line})` };
    }
    const msg = err instanceof Error ? err.message : "خطأ غير معروف";
    return { valid: null, error: `خطأ تجميع: ${msg}` };
  }
}

// ---- Utility: extract passage names from source ----------------------------

export function extractPassageNames(source: string): string[] {
  const names: string[] = [];
  const re = /^===\s+(.+?)\s+===/gm;
  let m: RegExpExecArray | null;
  while ((m = re.exec(source)) !== null) {
    if (m[1]) names.push(m[1].trim());
  }
  return names;
}

export function extractVariableNames(source: string): string[] {
  const names: string[] = [];
  const re = /^(?:متغير|VAR)\s+(\S+)\s*=/gm;
  let m: RegExpExecArray | null;
  while ((m = re.exec(source)) !== null) {
    if (m[1]) names.push(m[1].trim());
  }
  return names;
}
