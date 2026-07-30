// ---------------------------------------------------------------------------
// .qalam language mode tests — tokenisation and lint diagnostics.
// ---------------------------------------------------------------------------

import { describe, it, expect } from "vitest";
import { EditorState } from "@codemirror/state";
import { syntaxTree } from "@codemirror/language";
import { compile } from "@aqlamna/core";
import { qalamLanguage } from "../src/qalam/qalam-mode.js";
import { qalamLinter } from "../src/qalam/qalam-lint.js";

/**
 * Parse `src` with the .qalam StreamLanguage and return the syntax tree.
 * Each node's `type.name` corresponds to Lezer highlight tag names.
 */
function parse(src: string) {
  const state = EditorState.create({
    doc: src,
    extensions: [qalamLanguage],
  });
  return syntaxTree(state);
}

describe("qalam language mode", () => {
  it("tokenises a passage header as heading", () => {
    const src = "=== البداية ===";
    const tree = parse(src);
    let found = false;
    tree.iterate({
      enter(node) {
        if (node.type.name === "heading") found = true;
      },
    });
    expect(found).toBe(true);
  });

  it("tokenises a choice line", () => {
    const src = "* [افتح الباب]";
    const tree = parse(src);
    const names: string[] = [];
    tree.iterate({
      enter(node) {
        if (node.type.name) names.push(node.type.name);
      },
    });
    expect(names.some((n) => n === "strong" || n === "labelName")).toBe(true);
  });

  it("tokenises a divert as controlKeyword", () => {
    const src = "-> نهاية";
    const tree = parse(src);
    let found = false;
    tree.iterate({
      enter(node) {
        if (node.type.name === "controlKeyword") found = true;
      },
    });
    expect(found).toBe(true);
  });

  it("tokenises variable declaration as keyword", () => {
    const src = "متغير الرحيق = 0";
    const tree = parse(src);
    let found = false;
    tree.iterate({
      enter(node) {
        if (node.type.name === "keyword") found = true;
      },
    });
    expect(found).toBe(true);
  });

  it("tokenises an interpolation in prose", () => {
    const src = "جمعتِ {الرحيق} قطرة.";
    const tree = parse(src);
    let found = false;
    tree.iterate({
      enter(node) {
        if (node.type.name?.includes("variableName")) found = true;
      },
    });
    expect(found).toBe(true);
  });

  it("tokenises a comment", () => {
    const src = "// هذا تعليق";
    const tree = parse(src);
    let found = false;
    tree.iterate({
      enter(node) {
        if (node.type.name === "comment") found = true;
      },
    });
    expect(found).toBe(true);
  });

  it("leaves pure prose unstyled", () => {
    const src = "هذا نص عادي بدون تنسيق";
    const tree = parse(src);
    let anyStyled = false;
    tree.iterate({
      enter(node) {
        if (node.type.name && node.type.name !== "Document") anyStyled = true;
      },
    });
    expect(anyStyled).toBe(false);
  });

  it("tokenises a full fixture-03 snippet with all expected types", () => {
    const src = `متغير الرحيق = 0

=== البداية ===

جمعتِ {الرحيق} قطرة.

+ [اجمع الرحيق]
  -> البداية
`;

    const tree = parse(src);
    const names = new Set<string>();
    tree.iterate({
      enter(node) {
        if (node.type.name) names.add(node.type.name);
      },
    });

    expect(names.has("keyword")).toBe(true);
    expect(names.has("heading")).toBe(true);
    expect(names.has("strong")).toBe(true);
    expect(names.has("controlKeyword")).toBe(true);
    const hasInterp = [...names].some((n) => n.includes("variableName"));
    expect(hasInterp).toBe(true);
  });
});

describe("qalam linter", () => {
  it("passes for valid source (no diagnostics)", () => {
    const src = `متغير س = 0

=== البداية ===
نص
-> نهاية
`;

    let threw = false;
    try {
      compile(src, "test.qalam");
    } catch {
      threw = true;
    }
    expect(threw).toBe(false);
  });

  it("produces an error with Arabic message for broken source", () => {
    const src = `=== البداية
نص بدون إغلاق
`;

    let caught: Record<string, unknown> | null = null;
    try {
      compile(src, "test.qalam");
    } catch (err: unknown) {
      caught = err as Record<string, unknown>;
    }

    expect(caught).not.toBeNull();
    expect(typeof caught!.message_ar).toBe("string");
    expect((caught!.message_ar as string).length).toBeGreaterThan(0);
    expect(caught!.line).toBeGreaterThan(0);
  });
});
