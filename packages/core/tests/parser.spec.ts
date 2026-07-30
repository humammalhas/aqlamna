import { describe, test, expect } from "vitest";
import { parse } from "../src/parser/parser.js";
import type {
  StoryAST, PassageNode, ContentNode,
  TextNode, DivertNode, DivertTunnelNode, DivertReturnNode, ThreadNode,
  ChoicesNode, ConditionalNode, InterpolationNode, SetNode,
} from "../src/types/ast.js";

const FIX = (name: string) => `packages/core/tests/fixtures/${name}.qalam`;

/** Parse a fixture file by name and return the AST. */
function parseFixture(name: string): StoryAST {
  const fs = require("node:fs");
  const src = fs.readFileSync(FIX(name), "utf-8");
  return parse(src, name + ".qalam");
}

describe("parser", () => {
  // ---- front matter -------------------------------------------------------
  describe("front matter", () => {
    test("parses title and author", () => {
      const ast = parse('عنوان: "اختبار"\nمؤلف: "همام"\n=== بداية ===\nنص.', "test.qalam");
      expect(ast.title).toBe("اختبار");
      expect(ast.author).toBe("همام");
      expect(ast.language).toBe("ar");
    });

    test("defaults when absent", () => {
      const ast = parse("=== بداية ===\nنص.", "my-story.qalam");
      expect(ast.title).toBe("my-story");
      expect(ast.author).toBeNull();
      expect(ast.language).toBe("ar");
    });

    test("english front matter keys", () => {
      const ast = parse('TITLE: "Test"\nLANGUAGE: "en"\n=== start ===\ntext.', "test.qalam");
      expect(ast.title).toBe("Test");
      expect(ast.language).toBe("en");
    });
  });

  // ---- variable declarations ----------------------------------------------
  describe("variable declarations", () => {
    test("number variable", () => {
      const ast = parse("متغير س = 0\n=== بداية ===\nنص.", "test.qalam");
      expect(ast.variables["س"]).toEqual({ type: "number", initial: 0 });
    });

    test("boolean variable (arabic)", () => {
      const ast = parse("متغير وجد = خطأ\n=== بداية ===\nنص.", "test.qalam");
      expect(ast.variables["وجد"]).toEqual({ type: "boolean", initial: false });
    });

    test("boolean variable (english)", () => {
      const ast = parse("VAR found = true\n=== start ===\ntext.", "test.qalam");
      expect(ast.variables["found"]).toEqual({ type: "boolean", initial: true });
    });

    test("string variable", () => {
      const ast = parse('متغير اسم = "نحلة"\n=== بداية ===\nنص.', "test.qalam");
      expect(ast.variables["اسم"]).toEqual({ type: "string", initial: "نحلة" });
    });
  });

  // ---- list declarations --------------------------------------------------
  describe("list declarations", () => {
    test("list with initial value in parens", () => {
      const ast = parse("قائمة مخزون = (لا_شيء)، مفتاح، سكين\n=== بداية ===\nنص.", "test.qalam");
      expect(ast.lists["مخزون"]).toEqual({
        entries: ["لا_شيء", "مفتاح", "سكين"],
        initial: "لا_شيء",
      });
    });
  });

  // ---- passages -----------------------------------------------------------
  describe("passages", () => {
    test("single passage with start", () => {
      const ast = parse("=== البداية ===\nمرحبًا.", "test.qalam");
      expect(ast.start).toBe("البداية");
      expect(ast.passages).toHaveLength(1);
      expect(ast.passages[0]!.name).toBe("البداية");
    });

    test("passage with tags", () => {
      const ast = parse("=== مشهد === #حركة #موسيقى\nنص.", "test.qalam");
      expect(ast.passages[0]!.tags).toEqual(["حركة", "موسيقى"]);
    });

    test("multiple passages", () => {
      const ast = parse("=== أ ===\nنص.\n=== ب ===\nنص آخر.", "test.qalam");
      expect(ast.passages).toHaveLength(2);
      expect(ast.passages[0]!.name).toBe("أ");
      expect(ast.passages[1]!.name).toBe("ب");
    });

    test("start is first passage", () => {
      const ast = parse("=== ثانية ===\nنص.\n=== أولى ===\nنص.", "test.qalam");
      expect(ast.start).toBe("ثانية");
    });
  });

  // ---- subsections --------------------------------------------------------
  describe("subsections", () => {
    test("subsection inside passage", () => {
      const ast = parse("=== منزل ===\n= غرفة\nنص الغرفة.", "test.qalam");
      expect(ast.passages[0]!.subsections).toHaveLength(1);
      expect(ast.passages[0]!.subsections[0]!.name).toBe("غرفة");
    });
  });

  // ---- prose text ---------------------------------------------------------
  describe("prose text", () => {
    test("single text line", () => {
      const ast = parse("=== بداية ===\nمرحبًا.", "test.qalam");
      const content = ast.passages[0]!.content;
      expect(content).toEqual([{ type: "text", value: "مرحبًا." }]);
    });

    test("trims whitespace from prose lines (§1.10)", () => {
      const ast = parse("=== بداية ===\n   مرحبًا.   ", "test.qalam");
      const text = (ast.passages[0]!.content[0] as TextNode).value;
      expect(text).toBe("مرحبًا.");
    });
  });

  // ---- diverts -----------------------------------------------------------
  describe("diverts", () => {
    test("simple divert", () => {
      const ast = parse("=== أ ===\n-> ب", "test.qalam");
      const content = ast.passages[0]!.content;
      expect(content[0]).toMatchObject({ type: "divert", target: "ب" });
    });

    test("divert to END", () => {
      const ast = parse("=== أ ===\n-> نهاية", "test.qalam");
      const node = ast.passages[0]!.content[0] as DivertNode;
      expect(node.type).toBe("divert");
      expect(node.target).toBe("نهاية");
    });

    test("divert to DONE", () => {
      const ast = parse("=== أ ===\n-> تابع", "test.qalam");
      const node = ast.passages[0]!.content[0] as DivertNode;
      expect(node.target).toBe("تابع");
    });

    test("tunnel divert -> x ->", () => {
      const ast = parse("=== أ ===\n-> وصف ->", "test.qalam");
      const node = ast.passages[0]!.content[0] as DivertTunnelNode;
      expect(node.type).toBe("divert_tunnel");
      expect(node.target).toBe("وصف");
    });

    test("divert return ->->", () => {
      const ast = parse("=== أ ===\n->->", "test.qalam");
      expect(ast.passages[0]!.content[0]!.type).toBe("divert_return");
    });
  });

  // ---- threads ------------------------------------------------------------
  describe("threads", () => {
    test("thread marker", () => {
      const ast = parse("=== أ ===\n<- بائع", "test.qalam");
      const node = ast.passages[0]!.content[0] as ThreadNode;
      expect(node.type).toBe("thread");
      expect(node.target).toBe("بائع");
    });
  });

  // ---- choices ------------------------------------------------------------
  describe("choices", () => {
    test("simple consumable choice", () => {
      const ast = parse("=== بداية ===\n* [افتح] فتحت.\n  -> ممر", "test.qalam");
      const choices = ast.passages[0]!.content[0] as ChoicesNode;
      expect(choices.type).toBe("choices");
      expect(choices.items).toHaveLength(1);
      expect(choices.items[0]!.label).toBe("افتح");
      expect(choices.items[0]!.sticky).toBe(false);
      expect(choices.items[0]!.divert).toBe("ممر");
    });

    test("sticky choice", () => {
      const ast = parse("=== بداية ===\n+ [انتظر] انتظرت.\n  -> بداية", "test.qalam");
      const choices = ast.passages[0]!.content[0] as ChoicesNode;
      expect(choices.items[0]!.sticky).toBe(true);
    });

    test("choice without label (label in text)", () => {
      // When no [ ], the label is the text itself
      // This pattern isn't in the fixtures — the tokenizer requires [ ] for labels
    });

    test("choice with result text is trimmed (§1.10)", () => {
      const ast = parse("=== بداية ===\n* [افتح]   فتحت الباب.  \n  -> ممر", "test.qalam");
      const choices = ast.passages[0]!.content[0] as ChoicesNode;
      const txt = choices.items[0]!.content[0] as TextNode;
      expect(txt.value).toBe("فتحت الباب.");
    });

    test("choice with condition", () => {
      const ast = parse("=== بداية ===\n+ {رحيق >= 4} [عُد]", "test.qalam");
      const choices = ast.passages[0]!.content[0] as ChoicesNode;
      expect(choices.items[0]!.condition).toEqual({
        var: "رحيق", op: ">=", value: 4,
      });
    });

    test("choice with truthiness condition", () => {
      const ast = parse("=== بداية ===\n* {وجد} [تقدم]", "test.qalam");
      const choices = ast.passages[0]!.content[0] as ChoicesNode;
      expect(choices.items[0]!.condition).toEqual({ var: "وجد" });
    });

    test("multiple choices", () => {
      const ast = parse("=== بداية ===\n* [أ] -> ب\n+ [ج] -> د", "test.qalam");
      const choices = ast.passages[0]!.content[0] as ChoicesNode;
      expect(choices.items).toHaveLength(2);
    });

    test("choice with assignment in body", () => {
      const ast = parse("=== بداية ===\n* [اجمع]\n  ~ رحيق = رحيق + 2\n  -> بداية", "test.qalam");
      const choices = ast.passages[0]!.content[0] as ChoicesNode;
      const setNode = choices.items[0]!.content[0] as SetNode;
      expect(setNode.type).toBe("set");
      expect(setNode.var).toBe("رحيق");
      expect(setNode.op).toBe("+=");
      expect(setNode.value).toBe(2);
    });
  });

  // ---- assignments --------------------------------------------------------
  describe("assignments", () => {
    test("simple assignment", () => {
      const ast = parse("=== بداية ===\n~ وجد = صح", "test.qalam");
      const node = ast.passages[0]!.content[0] as SetNode;
      expect(node.type).toBe("set");
      expect(node.var).toBe("وجد");
      expect(node.op).toBe("=");
      expect(node.value).toBe(true);
    });

    test("shorthand increment", () => {
      const ast = parse("=== بداية ===\n~ س = س + 1", "test.qalam");
      const node = ast.passages[0]!.content[0] as SetNode;
      expect(node.var).toBe("س");
      expect(node.op).toBe("+=");
      expect(node.value).toBe(1);
    });

    test("shorthand decrement", () => {
      const ast = parse("=== بداية ===\n~ ع = ع - 3", "test.qalam");
      const node = ast.passages[0]!.content[0] as SetNode;
      expect(node.op).toBe("-=");
      expect(node.value).toBe(3);
    });
  });

  // ---- conditionals -------------------------------------------------------
  describe("conditionals", () => {
    test("inline conditional", () => {
      const ast = parse("=== بداية ===\n{وجد: الخريطة معك.}", "test.qalam");
      const node = ast.passages[0]!.content[0] as ConditionalNode;
      expect(node.type).toBe("conditional");
      expect(node.condition).toEqual({ var: "وجد" });
      expect(node.then).toEqual([{ type: "text", value: "الخريطة معك." }]);
      expect(node.else).toEqual([]);
    });

    test("conditional body trimmed (§1.10)", () => {
      const ast = parse("=== بداية ===\n{وجد:   الخريطة معك.   }", "test.qalam");
      const node = ast.passages[0]!.content[0] as ConditionalNode;
      expect(node.then).toEqual([{ type: "text", value: "الخريطة معك." }]);
    });

    test("conditional with comparison", () => {
      const ast = parse("=== بداية ===\n{شجاعة > 5: تندفع.}", "test.qalam");
      const node = ast.passages[0]!.content[0] as ConditionalNode;
      expect(node.condition).toEqual({ var: "شجاعة", op: ">", value: 5 });
    });

    test("single-line conditional with normal prose", () => {
      const ast = parse("=== بداية ===\n{مفتاح: ثم صمت.}", "test.qalam");
      const node = ast.passages[0]!.content[0] as ConditionalNode;
      expect(node.type).toBe("conditional");
      expect(node.condition).toEqual({ var: "مفتاح" });
      expect(node.then).toEqual([{ type: "text", value: "ثم صمت." }]);
      expect(node.else).toEqual([]);
    });

    test("single-line conditional with dash-leading prose is NOT multi-branch", () => {
      const ast = parse("=== بداية ===\n{مفتاح: - ثم صمت.}", "test.qalam");
      const node = ast.passages[0]!.content[0] as ConditionalNode;
      expect(node.type).toBe("conditional");
      expect(node.condition).toEqual({ var: "مفتاح" });
      expect(node.then).toEqual([{ type: "text", value: "- ثم صمت." }]);
      expect(node.else).toEqual([]);
    });

    test("multi-branch conditional compiles to nested chain", () => {
      const src = "=== بداية ===\n{شجاعة:\n  - شجاعة < 3: ترتجف.\n  - غير_ذلك: تتقدم.\n}";
      const ast = parse(src, "test.qalam");
      const outer = ast.passages[0]!.content[0] as ConditionalNode;
      expect(outer.type).toBe("conditional");
      expect(outer.condition).toEqual({ var: "شجاعة", op: "<", value: 3 });
      expect(outer.then).toEqual([{ type: "text", value: "ترتجف." }]);
      // The else branch is nested as a text node
      expect(outer.else).toEqual([
        { type: "text", value: "تتقدم." },
      ]);
    });
  });

  // ---- interpolation ------------------------------------------------------
  describe("interpolation", () => {
    test("inline interpolation", () => {
      const ast = parse("=== بداية ===\n{رحيق}", "test.qalam");
      const node = ast.passages[0]!.content[0] as InterpolationNode;
      expect(node.type).toBe("interpolation");
      expect(node.var).toBe("رحيق");
    });

    test("interpolation in prose preserves adjacent spaces (§1.10)", () => {
      const ast = parse("=== بداية ===\nجمعتِ {رحيق} قطرة.", "test.qalam");
      const content = ast.passages[0]!.content;
      expect(content[0]).toMatchObject({ type: "text", value: "جمعتِ " });
      expect(content[1]).toMatchObject({ type: "interpolation", var: "رحيق" });
      expect(content[2]).toMatchObject({ type: "text", value: " قطرة." });
    });

    test("mixed interpolation and text", () => {
      const ast = parse("=== بداية ===\nلديك {عدد} قطع.", "test.qalam");
      const content = ast.passages[0]!.content;
      expect(content[0]).toMatchObject({ type: "text", value: "لديك " });
      expect(content[1]).toMatchObject({ type: "interpolation", var: "عدد" });
      expect(content[2]).toMatchObject({ type: "text", value: " قطع." });
    });
  });

  // ---- fixture-aligned tests ----------------------------------------------
  describe("fixture 01 minimal", () => {
    const ast = parseFixture("01_minimal");

    test("title defaults to filename", () => {
      expect(ast.title).toBe("01_minimal");
    });

    test("start passage", () => {
      expect(ast.start).toBe("البداية");
    });

    test("passage content", () => {
      const content = ast.passages[0]!.content;
      expect(content[0]).toMatchObject({ type: "text", value: "مرحبًا." });
      expect(content[1]).toMatchObject({ type: "divert", target: "نهاية" });
    });
  });

  describe("fixture 02 choices", () => {
    const ast = parseFixture("02_choices");

    test("title parsed from front matter", () => {
      expect(ast.title).toBe("الباب");
      expect(ast.author).toBe("همام");
    });

    test("first passage has tag", () => {
      expect(ast.passages[0]!.tags).toEqual(["مشهد_أول"]);
    });

    test("first passage has prose and choices", () => {
      const content = ast.passages[0]!.content;
      expect(content).toHaveLength(2); // text + choices
      expect(content[0]!.type).toBe("text");
      expect((content[0] as TextNode).value).toBe("تقف أمام الباب المغلق.");
      expect(content[1]!.type).toBe("choices");
    });

    test("choice items", () => {
      const items = (ast.passages[0]!.content[1] as ChoicesNode).items;
      expect(items).toHaveLength(2);
      expect(items[0]!.label).toBe("افتح الباب");
      expect(items[0]!.sticky).toBe(false);
      expect(items[0]!.divert).toBe("الممر");
      expect(items[1]!.label).toBe("انتظر");
      expect(items[1]!.sticky).toBe(true);
      expect(items[1]!.divert).toBe("البداية");
    });

    test("second passage", () => {
      expect(ast.passages[1]!.name).toBe("الممر");
    });
  });

  describe("fixture 03 variables", () => {
    const ast = parseFixture("03_variables");

    test("title from front matter", () => {
      expect(ast.title).toBe("الرحيق");
    });

    test("variables", () => {
      expect(ast.variables).toEqual({
        "الرحيق": { type: "number", initial: 0 },
        "وجد_الخريطة": { type: "boolean", initial: false },
        "اسم_البطل": { type: "string", initial: "نحلة" },
      });
    });

    test("conditional in passage", () => {
      const content = ast.passages[0]!.content;
      const cond = content[0] as ConditionalNode;
      expect(cond.type).toBe("conditional");
      expect(cond.condition).toEqual({ var: "وجد_الخريطة" });
      expect(cond.then).toEqual([{ type: "text", value: "الخريطة معك." }]);
    });

    test("interpolation line splits text", () => {
      const content = ast.passages[0]!.content;
      const text1 = content[1] as TextNode;
      const interp = content[2] as InterpolationNode;
      const text2 = content[3] as TextNode;
      expect(text1.type).toBe("text");
      expect(text1.value).toBe("جمعتِ "); // trailing space preserved
      expect(interp.type).toBe("interpolation");
      expect(interp.var).toBe("الرحيق");
      expect(text2.type).toBe("text");
      expect(text2.value).toBe(" قطرة."); // leading space preserved
    });

    test("choices with conditions and assignments", () => {
      const choices = ast.passages[0]!.content[4] as ChoicesNode;
      expect(choices.items).toHaveLength(3);

      // Choice 1: consumable, no condition
      expect(choices.items[0]!.sticky).toBe(false);
      expect(choices.items[0]!.condition).toBeNull();
      expect(choices.items[0]!.divert).toBe("البداية");

      // Choice 2: consumable, no condition
      expect(choices.items[1]!.label).toBe("تحدثي مع النحلة الحكيمة");
      expect(choices.items[1]!.sticky).toBe(false);

      // Choice 3: sticky, with condition
      expect(choices.items[2]!.sticky).toBe(true);
      expect(choices.items[2]!.condition).toEqual({
        var: "الرحيق", op: ">=", value: 4,
      });
      expect(choices.items[2]!.divert).toBe("نهاية");
    });
  });

  // ---- dotted references --------------------------------------------------
  describe("dotted references", () => {
    test("divert to dotted target", () => {
      const ast = parse("=== أ ===\n-> منزل.مطبخ", "test.qalam");
      const node = ast.passages[0]!.content[0] as DivertNode;
      expect(node.target).toBe("منزل.مطبخ");
    });
  });
});
