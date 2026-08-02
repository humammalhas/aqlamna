// ---------------------------------------------------------------------------
// Aqlamna compiler: StoryAST → story JSON
// ---------------------------------------------------------------------------

import type {
  StoryAST, PassageNode, SubsectionNode, ContentNode,
  ChoiceItem, Condition,
} from "../types/ast.js";

// ---- divert target normalisation (§1.3) ------------------------------------

function normalizeDivertTarget(target: string): string {
  if (target === "نهاية" || target === "END") return "END";
  if (target === "تابع" || target === "DONE") return "DONE";
  return target; // keeps dotted sub-section refs as-is (§1.11)
}

// ---- condition -------------------------------------------------------------

function compileCondition(cond: Condition): Record<string, unknown> {
  const inner: Record<string, unknown> = cond.op !== undefined && cond.value !== undefined
    ? { var: cond.var, op: cond.op, value: cond.value }
    : { var: cond.var };

  if (cond.negated) {
    return { not: inner };
  }
  return inner;
}

// ---- content nodes ---------------------------------------------------------

function compileContent(
  content: ContentNode[],
  parentNum?: string,
): Record<string, unknown>[] {
  return content.map((node): Record<string, unknown> => {
    switch (node.type) {
      case "text":
        return { type: "text", value: node.value };
      case "divert":
        return { type: "divert", target: normalizeDivertTarget(node.target) };
      case "divert_tunnel":
        return { type: "tunnel", target: normalizeDivertTarget(node.target) };
      case "divert_return":
        return { type: "divert_return" };
      case "thread":
        return { type: "thread", target: normalizeDivertTarget(node.target) };
      case "interpolation":
        return { type: "interpolation", var: node.var };
      case "set":
        return { type: "set", var: node.var, op: node.op, value: node.value };
      case "image":
        return { type: "image", name: node.name };
      case "conditional":
        return {
          type: "conditional",
          condition: compileCondition(node.condition),
          then: compileContent(node.then, parentNum),
          else: compileContent(node.else, parentNum),
        };
      case "choices": {
        let n = 1;
        const items = node.items.map((item: ChoiceItem) => ({
          id: parentNum
            ? `choice_${parentNum}_${n++}`
            : `choice_${n++}`,
          label: item.label,
          sticky: item.sticky,
          condition: item.condition ? compileCondition(item.condition) : null,
          // §1.13: nested choices use the parent choice number as prefix
          content: compileContent(
            item.content,
            parentNum ? `${parentNum}_${n - 1}` : String(n - 1),
          ),
          divert: item.divert ? normalizeDivertTarget(item.divert) : null,
        }));
        return { type: "choices", items };
      }
      default:
        // Exhaustiveness: unknown node types pass through with a type marker
        return { type: "unknown", _original: (node as Record<string, unknown>).type };
    }
  });
}

// ---- passage ---------------------------------------------------------------

function compilePassage(
  passage: PassageNode,
): Record<string, unknown> {
  return {
    tags: passage.tags,
    content: compileContent(passage.content),
  };
}

// ---- word count (Arabic-aware) ---------------------------------------------

function countWords(content: ContentNode[]): number {
  let total = 0;
  for (const node of content) {
    switch (node.type) {
      case "text":
        if (node.value !== null) {
          total += node.value.trim().split(/\s+/).filter(Boolean).length;
        }
        break;
      case "conditional":
        total += countWords(node.then) + countWords(node.else);
        break;
      case "choices":
        for (const item of node.items) {
          total += countWords(item.content);
        }
        break;
    }
  }
  return total;
}

// ---- main compile entry point ----------------------------------------------

export interface CompileOptions {
  /**
   * ISO-8601 string written into `metadata.created` / `metadata.modified`.
   *
   * Omitted, the compiler stamps the wall clock — right for the editor, where
   * a story really is being modified right now. Wrong for a build: the CLI
   * exporter re-compiles the same three `.qalam` sources on every
   * `npm run build:all`, so the wall clock made three shipped artifacts differ
   * by a timestamp and nothing else, every single run. A working tree that is
   * never clean is a working tree nobody reads, and `git status` before
   * committing is the only thing standing between this repo and the commit
   * that silently reverted six of the reviewer's files.
   *
   * The exporter passes the source `.qalam`'s own mtime, so exporting an
   * unchanged story twice produces byte-identical HTML.
   */
  timestamp?: string;
}

export function compileStory(
  ast: StoryAST,
  _filename: string,
  options: CompileOptions = {},
): Record<string, unknown> {
  // Build passages object keyed by name (§4)
  const passages: Record<string, unknown> = {};
  let totalWords = 0;

  for (const passage of ast.passages) {
    passages[passage.name] = compilePassage(passage);
    totalWords += countWords(passage.content);

    // Emit subsections as dotted-name passages
    for (const sub of passage.subsections) {
      const dottedName = `${passage.name}.${sub.name}`;
      passages[dottedName] = {
        tags: [],
        content: compileContent(sub.content),
      };
      totalWords += countWords(sub.content);
    }
  }

  // Build lists — map AST `entries` to story JSON `values`
  const lists: Record<string, unknown> = {};
  for (const [name, decl] of Object.entries(ast.lists)) {
    lists[name] = { values: decl.entries, initial: decl.initial };
  }

  const passageCount =
    ast.passages.length +
    ast.passages.reduce((sum, p) => sum + p.subsections.length, 0);

  const now = options.timestamp ?? new Date().toISOString();

  const hasImages = Object.keys(ast.images).length > 0;

  const result: Record<string, unknown> = {
    qalam_version: ast.version,
    title: ast.title,
    author: ast.author,
    language: ast.language,
    direction: ast.direction,
    start: ast.start,
    variables: ast.variables,
    lists,
    passages,
    metadata: {
      created: now,
      modified: now,
      passage_count: passageCount,
      word_count: totalWords,
    },
  };

  if (hasImages) {
    result.images = ast.images;
  }

  if (ast.imageStyle !== null) {
    result.imageStyle = ast.imageStyle;
  }

  // Omitted entirely when there are none, so a story without characters
  // compiles to the same bytes it always did.
  if (ast.characters.length > 0) {
    result.characters = ast.characters;
  }

  return result;
}
