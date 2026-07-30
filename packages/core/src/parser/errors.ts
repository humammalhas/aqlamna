// ---------------------------------------------------------------------------
// Aqlamna error types, message table, factory, and AST validation
// ---------------------------------------------------------------------------

import type { StoryAST, ContentNode } from "../types/ast.js";

// ---- QalamError type -------------------------------------------------------

/** Every parser or compiler error carries these four populated fields. */
export interface QalamError {
  code: string;
  message_ar: string;
  message_en: string;
  line: number;
  column: number;
}

// ---- Message table (§1.15) — verbatim, do not edit ------------------------

type ErrorMessages = Record<string, { ar: string; en: string }>;

const TEMPLATES: ErrorMessages = {
  E101: {
    ar: "لا يوجد مقطع بهذا الاسم: {name}",
    en: "No passage named {name}.",
  },
  E102: {
    ar: "اسم المقطع مكرّر: {name}",
    en: "Duplicate passage name: {name}.",
  },
  E103: {
    ar: "ترويسة المقطع غير مغلقة؛ أضف === في نهاية السطر.",
    en: "Unterminated passage header — add === at the end of the line.",
  },
  E104: {
    ar: "خيار خارج أيّ مقطع؛ ابدأ مقطعًا بـ === قبل كتابة الخيارات.",
    en: "Choice outside a passage — open a passage with === first.",
  },
  E105: {
    ar: "شرط غير مكتمل؛ القوس { لم يُغلق.",
    en: "Malformed conditional — { was never closed.",
  },
  E201: {
    ar: "تعبير غير مدعوم في الإسناد: {expr}. المدعوم: رقم أو نصّ أو صح/خطأ أو قيمة من قائمة.",
    en: "Unsupported expression in assignment: {expr}. Allowed: a number, a string, صح/خطأ, or a declared list value.",
  },
  E202: {
    ar: "متغير غير معرّف: {name}. أعلنه بـ متغير قبل استخدامه.",
    en: "Undeclared variable: {name}. Declare it with متغير first.",
  },
  E203: {
    ar: "نوع غير متطابق: المتغير {name} نوعه {expected}، والقيمة المسندة {got}.",
    en: "Type mismatch: {name} is {expected}, assigned value is {got}.",
  },
};

// ---- Error factory ---------------------------------------------------------

/** Substitutions map keys like `{name}`, `{expr}`, `{expected}`, `{got}`. */
export function qalamError(
  code: string,
  line: number,
  column: number,
  substitutions: Record<string, string> = {},
): QalamError {
  const tpl = TEMPLATES[code];
  if (!tpl) {
    // Internal fallback for non-spec codes (E000)
    const fallback = substitutions._msg ?? "Unexpected token.";
    return {
      code,
      message_ar: fallback,
      message_en: fallback,
      line,
      column,
    };
  }

  let message_ar = tpl.ar;
  let message_en = tpl.en;

  for (const [key, val] of Object.entries(substitutions)) {
    if (key === "_msg") continue; // internal fallback only
    message_ar = message_ar.replace(`{${key}}`, val);
    message_en = message_en.replace(`{${key}}`, val);
  }

  return { code, message_ar, message_en, line, column };
}

// ---- Type name helpers (for E203) -----------------------------------------

function typeNameAr(type: string): string {
  switch (type) {
    case "number":  return "رقم";
    case "string":  return "نصّ";
    case "boolean": return "صح/خطأ";
    case "list":    return "قائمة";
    default:        return type;
  }
}

// ---- AST validation --------------------------------------------------------

interface ValidationCtx {
  passageNames: Set<string>;       // includes dotted subsections
  subsectionMap: Map<string, string[]>; // passage → subsection names
  variables: Map<string, "number" | "string" | "boolean" | "list">;
  listEntries: Map<string, Set<string>>; // list name → entry values
}

/** Return all validation errors in the AST. Empty array = valid. */
export function validateStory(ast: StoryAST): QalamError[] {
  const errors: QalamError[] = [];

  // Build lookup structures
  const ctx: ValidationCtx = {
    passageNames: new Set(),
    subsectionMap: new Map(),
    variables: new Map(),
    listEntries: new Map(),
  };

  // Collect passages and subsections
  for (const p of ast.passages) {
    ctx.passageNames.add(p.name);
    const subNames: string[] = [];
    for (const sub of p.subsections) {
      const dotted = `${p.name}.${sub.name}`;
      ctx.passageNames.add(dotted);
      subNames.push(sub.name);
    }
    ctx.subsectionMap.set(p.name, subNames);
  }

  // Collect variables and lists
  for (const [name, decl] of Object.entries(ast.variables)) {
    ctx.variables.set(name, decl.type);
  }
  for (const [name, decl] of Object.entries(ast.lists)) {
    ctx.variables.set(name, "list");
    ctx.listEntries.set(name, new Set(decl.entries));
  }

  // Walk all passages and subsections
  for (const p of ast.passages) {
    errors.push(...validateContent(p.content, ctx));
    for (const sub of p.subsections) {
      errors.push(...validateContent(sub.content, ctx));
    }
  }

  return errors;
}

/** Walk content nodes recursively, collecting validation errors. */
function validateContent(
  content: ContentNode[],
  ctx: ValidationCtx,
): QalamError[] {
  const errors: QalamError[] = [];

  for (const node of content) {
    switch (node.type) {
      case "divert":
      case "divert_tunnel":
      case "thread":
        if (
          node.target !== "END" &&
          node.target !== "DONE" &&
          node.target !== "\u0646\u0647\u0627\u064A\u0629" && // نهاية
          node.target !== "\u062A\u0627\u0628\u0639" &&       // تابع
          !ctx.passageNames.has(node.target)
        ) {
          errors.push(qalamError("E101", node.line, node.column, { name: node.target }));
        }
        break;

      case "conditional":
        errors.push(...validateConditionRefs(node.condition, ctx, node.line, node.column));
        errors.push(...validateContent(node.then, ctx));
        errors.push(...validateContent(node.else, ctx));
        break;

      case "interpolation":
        if (!ctx.variables.has(node.var)) {
          errors.push(qalamError("E202", node.line, node.column, { name: node.var }));
        }
        break;

      case "set":
        if (!ctx.variables.has(node.var)) {
          errors.push(qalamError("E202", node.line, node.column, { name: node.var }));
        } else {
          // Type check (E203)
          const varType = ctx.variables.get(node.var)!;
          const val = node.value;
          const gotType = typeof val;

          if (varType === "list") {
            const entries = ctx.listEntries.get(node.var);
            if (gotType === "string" && entries && entries.has(val as string)) {
              // valid list value assignment
            } else {
              errors.push(makeE203(node, "list", val));
            }
          } else if (varType === "number" && gotType !== "number") {
            errors.push(makeE203(node, "number", val));
          } else if (varType === "string" && gotType !== "string") {
            errors.push(makeE203(node, "string", val));
          } else if (varType === "boolean" && gotType !== "boolean") {
            errors.push(makeE203(node, "boolean", val));
          }
        }
        break;

      case "choices":
        for (const item of node.items) {
          if (item.condition) {
            errors.push(...validateConditionRefs(item.condition, ctx, item.line, item.column));
          }
          errors.push(...validateContent(item.content, ctx));
          if (item.divert) {
            if (
              item.divert !== "END" &&
              item.divert !== "DONE" &&
              item.divert !== "RETURN" &&
              item.divert !== "\u0646\u0647\u0627\u064A\u0629" && // نهاية
              item.divert !== "\u062A\u0627\u0628\u0639" &&       // تابع
              !ctx.passageNames.has(item.divert)
            ) {
              errors.push(qalamError("E101", item.line, item.column, { name: item.divert }));
            }
          }
        }
        break;

      case "text":
      case "divert_return":
        // No validation needed
        break;

      default:
        break;
    }
  }

  return errors;
}

/** Check that all variables referenced in a condition exist. */
function validateConditionRefs(
  cond: { var: string; op?: string; value?: number | string | boolean },
  ctx: ValidationCtx,
  line: number,
  column: number,
): QalamError[] {
  const errors: QalamError[] = [];
  if (!ctx.variables.has(cond.var)) {
    errors.push(qalamError("E202", line, column, { name: cond.var }));
  }
  return errors;
}

// ---- E203 helper (localised type names) ------------------------------------

/** Build an E203 error with language-appropriate type names. */
function makeE203(
  node: { var: string; line: number; column: number; value: number | string | boolean },
  expectedType: string,
  val: number | string | boolean,
): QalamError {
  const expectedAr = typeNameAr(expectedType);
  const expectedEn = expectedType;
  let gotAr: string;
  let gotEn: string;
  if (typeof val === "number") {
    gotAr = "رقم";
    gotEn = "number";
  } else if (typeof val === "boolean") {
    gotAr = "صح/خطأ";
    gotEn = "boolean";
  } else {
    gotAr = "نصّ";
    gotEn = "string";
  }
  // Build messages directly to localise type names per language
  const message_ar =
    `نوع غير متطابق: المتغير ${node.var} نوعه ${expectedAr}، والقيمة المسندة ${gotAr}.`;
  const message_en =
    `Type mismatch: ${node.var} is ${expectedEn}, assigned value is ${gotEn}.`;
  return { code: "E203", message_ar, message_en, line: node.line, column: node.column };
}
