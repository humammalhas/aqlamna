// ---------------------------------------------------------------------------
// Aqlamna runtime engine — state machine
// Zero dependencies. Consumes compiled story JSON.
// ---------------------------------------------------------------------------

import type {
  StoryJSON,
  StoryState,
  StoryScene,
  OutputNode,
  AvailableChoice,
  ContentNode,
  ChoiceItem,
  Condition,
  VarCondition,
  NotCondition,
  AndCondition,
  OrCondition,
} from "./types.js";

// ---- content result --------------------------------------------------------

/** What processContent signals when it stops. */
type ContentResult =
  | { kind: "divert"; target: string }
  | { kind: "choices"; items: AvailableChoice[] }
  | { kind: "done" };

// ---- engine ----------------------------------------------------------------

export class Engine {
  private story: StoryJSON;
  private state: StoryState;

  constructor(story: StoryJSON) {
    this.story = story;

    // Initialise variables from declarations
    const variables: Record<string, number | string | boolean> = {};
    for (const [name, decl] of Object.entries(story.variables)) {
      variables[name] = decl.initial;
    }

    // Initialise lists from declarations
    const lists: Record<string, string> = {};
    for (const [name, decl] of Object.entries(story.lists)) {
      lists[name] = decl.initial;
    }

    this.state = {
      passage: story.start ?? "",
      variables,
      lists,
      visited: {},
      consumed: {},
      ended: false,
    };
  }

  // ---- public API ----------------------------------------------------------

  /** Start the story from the current passage (or the declared start passage initially). */
  start(): StoryScene {
    if (this.state.ended) {
      return this.makeScene([], []);
    }
    return this.advance(this.state.passage);
  }

  /**
   * Select a choice by ID. The choice must be available at the current scene.
   * Processes the choice's content, applies side effects, then follows its divert
   * (or stays in the current passage if none).
   */
  choose(choiceId: string): StoryScene {
    if (this.state.ended) {
      return this.makeScene([], []);
    }

    // Find the choice in the current passage content tree
    const passage = this.story.passages[this.state.passage];
    if (!passage) {
      this.state.ended = true;
      return this.makeScene([], []);
    }

    const item = this.findChoice(passage.content, choiceId);
    if (!item) {
      return this.makeScene([], []);
    }

    // Consume the choice (sticky choices are never consumed).
    // Keyed by (passage, choiceId) per PHASE1_SPEC.md §1.4.
    if (!item.sticky) {
      const passageConsumed = this.state.consumed[this.state.passage] ?? [];
      if (!passageConsumed.includes(choiceId)) {
        passageConsumed.push(choiceId);
        this.state.consumed[this.state.passage] = passageConsumed;
      }
    }

    // Process the choice's content
    const choiceOutput: OutputNode[] = [];
    const contentResult = this.processContent(item.content, choiceOutput);

    // If choice content itself contains choices (nested choices),
    // return immediately with the content output + those choices.
    if (contentResult.kind === "choices") {
      return this.makeScene(choiceOutput, contentResult.items);
    }

    // Determine the next passage:
    //   1. Content contains a divert node → follow it
    //   2. Choice has a divert field → follow it
    //   3. Neither → stay in current passage
    let nextPassage: string;
    if (contentResult.kind === "divert") {
      nextPassage = contentResult.target;
    } else if (item.divert !== null) {
      nextPassage = item.divert;
    } else {
      nextPassage = this.state.passage;
    }

    // Advance to the next passage, carrying choice content output as prefix
    return this.advance(nextPassage, choiceOutput);
  }

  /** Return a serialisable snapshot of the current engine state. */
  getState(): StoryState {
    return {
      save_version: 2,
      passage: this.state.passage,
      variables: { ...this.state.variables },
      lists: { ...this.state.lists },
      visited: { ...this.state.visited },
      consumed: deepCloneConsumed(this.state.consumed),
      ended: this.state.ended,
    };
  }

  /** Restore the engine from a previously saved state. */
  loadState(state: StoryState): void {
    // Handle old v1 format: consumed was a flat string[].
    // Discard it gracefully — no real users yet.
    let consumed: Record<string, string[]>;
    if (Array.isArray(state.consumed)) {
      console.warn(
        "تنسيق الحفظ قديم — جارٍ تجاهل الخيارات المستهلكة." +
        " القديم: مصفوفة، الجديد: لكل مقطع خياراته.",
      );
      consumed = {};
    } else {
      consumed = deepCloneConsumed(
        (state.consumed as Record<string, string[]>) ?? {},
      );
    }

    this.state = {
      save_version: 2,
      passage: state.passage,
      variables: { ...state.variables },
      lists: { ...state.lists },
      visited: { ...state.visited },
      consumed,
      ended: state.ended,
    };
  }

  // ---- advance loop --------------------------------------------------------

  /**
   * Process passages starting from `fromPassage`.
   * Follows diverts automatically. Pauses when choices are found or the story ends.
   */
  private advance(fromPassage: string, prefixOutput?: OutputNode[]): StoryScene {
    const output: OutputNode[] = prefixOutput ? [...prefixOutput] : [];
    let current: string = fromPassage;

    for (;;) {
      // Terminal targets
      if (current === "END") {
        this.state.passage = "END";
        this.state.ended = true;
        return this.makeScene(output, []);
      }

      if (current === "DONE") {
        this.state.passage = "DONE";
        this.state.ended = true;
        return this.makeScene(output, []);
      }

      const passage = this.story.passages[current];
      if (!passage) {
        this.state.passage = current;
        this.state.ended = true;
        return this.makeScene(output, []);
      }

      this.state.passage = current;
      this.state.visited[current] = (this.state.visited[current] ?? 0) + 1;

      const result = this.processContent(passage.content, output);

      switch (result.kind) {
        case "divert":
          current = result.target;
          continue;
        case "choices":
          return this.makeScene(output, result.items);
        case "done":
          // Passage ended naturally with no divert and no choices.
          // Just stay here.
          return this.makeScene(output, []);
      }
    }
  }

  // ---- content processing --------------------------------------------------

  /**
   * Process an array of content nodes sequentially.
   * Returns:
   *   - { kind: "divert", target } when a divert/tunnel is hit
   *   - { kind: "choices", items } when choices are available
   *   - { kind: "done" } when all nodes are processed with no divert/choices
   */
  private processContent(
    content: ContentNode[],
    output: OutputNode[],
  ): ContentResult {
    for (const node of content) {
      switch (node.type) {
        case "text":
          output.push({ type: "text", value: node.value });
          break;

        case "interpolation":
          output.push({
            type: "text",
            value: String(this.resolveVar(node.var)),
          });
          break;

        case "set":
          this.applySet(node);
          break;

        case "divert":
          return { kind: "divert", target: node.target };

        case "tunnel":
          return { kind: "divert", target: node.target };

        case "divert_return":
          // End of tunnel — signal done. The caller (advance loop)
          // treats this as end-of-passage.
          return { kind: "done" };

        case "thread": {
          const tp = this.story.passages[node.target];
          if (tp) {
            const sub = this.processContent(tp.content, output);
            if (sub.kind !== "done") return sub;
          }
          break;
        }

        case "conditional": {
          const branch = this.evalCondition(node.condition)
            ? node.then
            : node.else;
          const sub = this.processContent(branch, output);
          if (sub.kind !== "done") return sub;
          break;
        }

        case "choices": {
          const available = node.items.filter((item) =>
            this.isChoiceAvailable(item),
          );
          if (available.length > 0) {
            return {
              kind: "choices",
              items: available.map((item) => ({
                id: item.id,
                label: item.label,
                sticky: item.sticky,
              })),
            };
          }
          // No available choices — continue processing
          break;
        }
      }
    }

    return { kind: "done" };
  }

  // ---- condition evaluation ------------------------------------------------

  private isChoiceAvailable(item: ChoiceItem): boolean {
    // Per-passage consumed check: look up consumed IDs for the current passage
    if (!item.sticky) {
      const passageConsumed = this.state.consumed[this.state.passage] ?? [];
      if (passageConsumed.includes(item.id)) {
        return false;
      }
    }
    if (item.condition !== null && !this.evalCondition(item.condition)) {
      return false;
    }
    return true;
  }

  private evalCondition(cond: Condition): boolean {
    if ("var" in cond) {
      return this.evalVar(cond as VarCondition);
    }
    if ("not" in cond) {
      return !this.evalCondition((cond as NotCondition).not);
    }
    if ("and" in cond) {
      return (cond as AndCondition).and.every((c) => this.evalCondition(c));
    }
    if ("or" in cond) {
      return (cond as OrCondition).or.some((c) => this.evalCondition(c));
    }
    return false;
  }

  private evalVar(cond: VarCondition): boolean {
    const value = this.state.variables[cond.var];

    if (cond.op === undefined && cond.value === undefined) {
      return Boolean(value);
    }

    const op = cond.op;
    const expected = cond.value;

    switch (op) {
      case "==": return value === expected;
      case "!=": return value !== expected;
      case "<":  return (value as number) < (expected as number);
      case ">":  return (value as number) > (expected as number);
      case "<=": return (value as number) <= (expected as number);
      case ">=": return (value as number) >= (expected as number);
      default:   return false;
    }
  }

  // ---- variable operations -------------------------------------------------

  private resolveVar(name: string): number | string | boolean {
    if (name in this.state.variables) return this.state.variables[name]!;
    if (name in this.state.lists) return this.state.lists[name]!;
    return 0;
  }

  private applySet(node: ContentNode & { type: "set" }): void {
    const varName = node.var;
    const op = node.op ?? "=";
    const rhs = node.value;

    // Lists
    if (varName in this.state.lists) {
      if (op === "=") this.state.lists[varName] = String(rhs);
      return;
    }

    // Ensure variable exists (auto-create if referenced without declare)
    if (!(varName in this.state.variables)) {
      this.state.variables[varName] = 0;
    }

    const current = this.state.variables[varName]!;

    switch (op) {
      case "=":
        this.state.variables[varName] = rhs;
        break;
      case "+=":
        this.state.variables[varName] = (current as number) + (rhs as number);
        break;
      case "-=":
        this.state.variables[varName] = (current as number) - (rhs as number);
        break;
      case "*=":
        this.state.variables[varName] = (current as number) * (rhs as number);
        break;
      case "/=":
        this.state.variables[varName] = Math.trunc(
          (current as number) / (rhs as number),
        );
        break;
    }
  }

  // ---- helpers -------------------------------------------------------------

  private makeScene(
    output: OutputNode[],
    choices: AvailableChoice[],
  ): StoryScene {
    return {
      passage: this.state.passage,
      output,
      choices,
      ended: this.state.ended,
    };
  }

  /** Recursively find a choice by ID anywhere in the content tree. */
  private findChoice(
    content: ContentNode[],
    choiceId: string,
  ): ChoiceItem | null {
    for (const node of content) {
      if (node.type === "choices") {
        for (const item of node.items) {
          if (item.id === choiceId) return item;
          const nested = this.findChoice(item.content, choiceId);
          if (nested) return nested;
        }
      }
      if (node.type === "conditional") {
        const inThen = this.findChoice(node.then, choiceId);
        if (inThen) return inThen;
        const inElse = this.findChoice(node.else, choiceId);
        if (inElse) return inElse;
      }
      if (node.type === "thread") {
        const tp = this.story.passages[node.target];
        if (tp) {
          const inThread = this.findChoice(tp.content, choiceId);
          if (inThread) return inThread;
        }
      }
    }
    return null;
  }
}

// ---- helpers (module-level) ------------------------------------------------

/** Deep-clone the per-passage consumed map. */
function deepCloneConsumed(
  consumed: Record<string, string[]>,
): Record<string, string[]> {
  const clone: Record<string, string[]> = {};
  for (const [key, ids] of Object.entries(consumed)) {
    clone[key] = [...ids];
  }
  return clone;
}
