// ---------------------------------------------------------------------------
// AI service — DeepSeek API calls for AI co-writing.
// Three actions: suggest choices, continue scene, write passage.
// Every response is validated via @aqlamna/core BEFORE being offered.
// ---------------------------------------------------------------------------

import { compile } from "@aqlamna/core";
import { getApiKey } from "./ai-keys.js";
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

اقترح 3 خيارات بصيغة .qalam لهذا المقطع. اكتب الخيارات فقط (بدون شرح). استخدم الصياغة التالية لكل خيار:

* [نص الخيار] نص النتيجة
  -> اسم_المقطع

أسماء المقاطع الموجودة: ${names}
أسماء المتغيرات الموجودة: ${vars}

لا تخترع أسماء مقاطع جديدة — استخدم فقط الأسماء الموجودة أعلاه. اكتب 3 خيارات فقط.`;
  },

  continue_scene: ({ contextText }) => {
    return `أكمل كتابة المشهد التالي بالعربية الفصحى. لا تضف خيارات ولا مقاطع جديدة — فقط استمر في السرد النثري للمشهد:

${contextText}

أكمل بـ 3-5 جمل مناسبة. لا تكرر ما كُتب بالفعل.`;
  },

  write_passage: ({ contextText, passageNames, variableNames }) => {
    const vars = variableNames.length > 0 ? variableNames.join("، ") : "(لا توجد متغيرات)";
    return `اكتب مقطعًا جديدًا بصيغة .qalam. المقطع الحالي الذي يحوّل إليه:

${contextText}

اكتب مشهدًا كاملاً من 4-6 جمل، ثم أضف 2-3 خيارات في النهاية.

المتغيرات الموجودة (يمكنك استخدامها): ${vars}

ابدأ بنص المقطع مباشرة (لا تكتب === اسم_المقطع ===).`;
  },
};

// ---- API call --------------------------------------------------------------

const DEEPSEEK_API = "https://api.deepseek.com/v1/chat/completions";

export async function callAI(req: AIRequest): Promise<AIResponse> {
  const apiKey = getApiKey();
  if (!apiKey) {
    return { raw: "", valid: null, error: "لم يُضبط مفتاح API. افتح الإعدادات وأدخل مفتاح DeepSeek." };
  }

  const userPrompt = ACTION_PROMPTS[req.action]({
    contextText: req.contextText,
    passageNames: req.passageNames,
    variableNames: req.variableNames,
  });

  // First attempt
  const firstRaw = await sendToDeepSeek(apiKey, userPrompt);
  if (firstRaw.error) {
    return { raw: "", valid: null, error: firstRaw.error };
  }

  const validation = validateAIResponse(firstRaw.text, req);
  if (validation.valid) {
    return { raw: firstRaw.text, valid: validation.valid, error: null };
  }

  // Second attempt — feed the error back
  const retryPrompt = `محاولتك السابقة فشلت في التجميع (compile). الخطأ:
${validation.error}

أعد المحاولة. ${userPrompt}`;

  const secondRaw = await sendToDeepSeek(apiKey, retryPrompt);
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

// ---- DeepSeek HTTP call ----------------------------------------------------

async function sendToDeepSeek(
  apiKey: string,
  userPrompt: string,
): Promise<{ text: string; error: string | null }> {
  try {
    const res = await fetch(DEEPSEEK_API, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "deepseek-chat",
        messages: [
          { role: "system", content: MASTERY_SYSTEM_PROMPT },
          { role: "user", content: userPrompt },
        ],
        temperature: 0.7,
        max_tokens: 2048,
      }),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      if (res.status === 401) {
        return { text: "", error: "مفتاح API غير صالح. تحقق من المفتاح في الإعدادات." };
      }
      return { text: "", error: `خطأ في الاتصال (${res.status}): ${body.slice(0, 200)}` };
    }

    const json = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };

    const content = json.choices?.[0]?.message?.content;
    if (!content || content.trim().length === 0) {
      return { text: "", error: "لم يُرجع النموذج أي نص." };
    }

    return { text: content.trim(), error: null };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "خطأ غير معروف";
    return { text: "", error: `فشل الاتصال: ${msg}` };
  }
}

// ---- Validation ------------------------------------------------------------

function validateAIResponse(
  aiText: string,
  req: AIRequest,
): { valid: string | null; error: string | null } {
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
