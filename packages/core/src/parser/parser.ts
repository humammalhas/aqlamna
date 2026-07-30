// ---------------------------------------------------------------------------
// Aqlamna .qalam recursive-descent parser
// ---------------------------------------------------------------------------

import { tokenize, TokenKind, stripTashkeel, type Token } from "./tokenizer.js";
import { qalamError } from "./errors.js";
import type {
  StoryAST, VariableDecl, ListDecl,
  PassageNode, SubsectionNode, ContentNode,
  TextNode, DivertNode, DivertTunnelNode, DivertReturnNode, ThreadNode,
  ChoicesNode, ChoiceItem, ConditionalNode, InterpolationNode, SetNode,
  Condition,
} from "../types/ast.js";

const K = TokenKind;

// ---- Helpers --------------------------------------------------------------

function inferType(value: number | string | boolean): "number" | "string" | "boolean" {
  if (typeof value === "number") return "number";
  if (typeof value === "string") return "string";
  return "boolean";
}

function boolValue(token: Token): boolean {
  return token.kind === K.KEYWORD_TRUE;
}

function numValue(token: Token): number {
  return Number(token.value);
}

// ---- Parser state ---------------------------------------------------------

class ParserState {
  tokens: Token[];
  pos: number;

  title: string | null = null;
  author: string | null = null;
  language: string = "ar";
  variables: Record<string, VariableDecl> = {};
  lists: Record<string, ListDecl> = {};
  passages: PassageNode[] = [];
  passageNames: Set<string> = new Set();
  inPassage: boolean = false;

  constructor(tokens: Token[]) {
    this.tokens = tokens;
    this.pos = 0;
  }

  // ---- navigation ---------------------------------------------------------

  cur(): Token { return this.tokens[Math.min(this.pos, this.tokens.length - 1)]!; }
  isEOF(): boolean { return this.pos >= this.tokens.length || this.cur().kind === K.EOF; }
  is(k: string): boolean { return this.pos < this.tokens.length && this.cur().kind === k; }

  advance(): Token { return this.tokens[this.pos++]!; }

  expect(kind: string): Token {
    const t = this.advance();
    if (t.kind !== kind) {
      throw qalamError("E000", t.line, t.column, {
        _msg: `Expected ${kind} but got ${t.kind} at ${t.line}:${t.column}`,
      });
    }
    return t;
  }

  skip(kind: string): boolean {
    if (this.is(kind)) { this.advance(); return true; }
    return false;
  }

  // ---- main entry ---------------------------------------------------------

  parseStory(filename: string): StoryAST {
    // Pre-passage: front matter + declarations
    while (!this.isEOF() && !this.is(K.PASSAGE_MARKER)) {
      const t = this.cur();
      if (t.kind === K.TITLE_KEY || t.kind === K.AUTHOR_KEY || t.kind === K.LANGUAGE_KEY) {
        this.parseFrontMatter();
      } else if (t.kind === K.KEYWORD_VAR || t.kind === K.KEYWORD_LIST) {
        this.parseDeclaration();
      } else if (t.kind === K.CHOICE_STAR || t.kind === K.CHOICE_PLUS) {
        throw qalamError("E104", t.line, t.column, {});
      } else {
        this.advance(); // skip unexpected
      }
    }

    // Passages
    while (!this.isEOF()) {
      if (this.is(K.PASSAGE_MARKER)) {
        this.passages.push(this.parsePassage());
      } else if (this.is(K.CHOICE_STAR) || this.is(K.CHOICE_PLUS)) {
        const t = this.cur();
        throw qalamError("E104", t.line, t.column, {});
      } else {
        this.advance();
      }
    }

    const start = this.passages[0]?.name ?? null;
    const title = this.title ?? this.basename(filename);

    return {
      version: "0.1",
      title,
      author: this.author,
      language: this.language,
      direction: "rtl",
      start,
      variables: this.variables,
      lists: this.lists,
      passages: this.passages,
    };
  }

  // ---- front matter -------------------------------------------------------

  parseFrontMatter(): void {
    const key = this.advance();
    this.expect(K.COLON);
    const val = this.expect(K.STRING);
    if (key.kind === K.TITLE_KEY) this.title = val.value;
    else if (key.kind === K.AUTHOR_KEY) this.author = val.value;
    else if (key.kind === K.LANGUAGE_KEY) this.language = val.value;
  }

  // ---- declarations -------------------------------------------------------

  parseDeclaration(): void {
    const kw = this.advance();
    if (kw.kind === K.KEYWORD_VAR) {
      const name = this.expect(K.IDENTIFIER);
      this.expect(K.OPERATOR);
      const val = this.parseLiteral();
      this.variables[name.value] = {
        type: inferType(val.value),
        initial: val.value,
      };
    } else {
      // KEYWORD_LIST
      const name = this.expect(K.IDENTIFIER);
      this.expect(K.OPERATOR);
      let entries: string[] = [];
      let initial = "";
      if (this.is(K.PAREN_OPEN)) {
        this.advance();
        initial = this.expect(K.IDENTIFIER).value;
        this.expect(K.PAREN_CLOSE);
      }
      while (this.is(K.COMMA)) {
        this.advance();
        entries.push(this.expect(K.IDENTIFIER).value);
      }
      if (initial) entries.unshift(initial);
      this.lists[name.value] = { entries, initial };
    }
  }

  // ---- passage ------------------------------------------------------------

  parsePassage(): PassageNode {
    this.expect(K.PASSAGE_MARKER);
    const nameTok = this.cur();
    if (nameTok.kind !== K.IDENTIFIER) {
      // Missing passage name — the header is malformed.
      // But the closing === is the real issue: E103.
      throw qalamError("E103", nameTok.line, nameTok.column, {});
    }
    this.advance(); // consume IDENTIFIER

    // E102: duplicate passage name
    if (this.passageNames.has(nameTok.value)) {
      throw qalamError("E102", nameTok.line, nameTok.column, { name: nameTok.value });
    }
    this.passageNames.add(nameTok.value);

    // E103: expect closing ===
    const closeTok = this.cur();
    if (closeTok.kind !== K.PASSAGE_MARKER) {
      if (this.isEOF()) {
        throw qalamError("E103", nameTok.line, nameTok.column, {});
      }
      throw qalamError("E103", closeTok.line, closeTok.column, {});
    }
    this.advance(); // consume ===

    const tags: string[] = [];
    while (!this.isEOF() && this.cur().line === nameTok.line && this.is(K.TAG)) {
      tags.push(this.advance().value);
    }

    this.inPassage = true;
    const subsections: SubsectionNode[] = [];
    const content: ContentNode[] = [];
    this.parseBody(content, subsections);
    this.inPassage = false;

    return { name: nameTok.value, tags, subsections, content };
  }

  parseBody(content: ContentNode[], subsections: SubsectionNode[], allowSubsections = true): void {
    while (!this.isEOF()) {
      if (this.is(K.PASSAGE_MARKER)) break;
      if (!allowSubsections && this.is(K.SUBSECTION_MARKER)) break;
      if (allowSubsections && this.is(K.SUBSECTION_MARKER)) { subsections.push(this.parseSubsection()); continue; }

      const t = this.cur();

      if (t.kind === K.CHOICE_STAR || t.kind === K.CHOICE_PLUS) {
        content.push(this.parseChoices());
      } else if (t.kind === K.DIVERT || t.kind === K.DIVERT_RETURN) {
        content.push(...this.parseDivertLine());
      } else if (t.kind === K.THREAD) {
        this.advance();
        const tgt = this.expectTokenKind([K.IDENTIFIER, K.KEYWORD_END, K.KEYWORD_DONE]);
        content.push({ type: "thread", target: tgt.value, line: tgt.line, column: tgt.column } as ThreadNode);
      } else if (t.kind === K.ASSIGN) {
        content.push(this.parseAssignment());
      } else {
        content.push(...this.parseTextOrConditional());
      }
    }
  }

  parseSubsection(): SubsectionNode {
    this.expect(K.SUBSECTION_MARKER);
    const name = this.expect(K.IDENTIFIER);
    const subsections: SubsectionNode[] = [];
    const content: ContentNode[] = [];
    this.parseBody(content, subsections, false);
    return { name: name.value, content };
  }

  // ---- choices ------------------------------------------------------------

  parseChoices(expectedDepth = 1): ChoicesNode {
    const items: ChoiceItem[] = [];

    while (!this.isEOF()) {
      const head = this.cur();
      if (head.kind === K.CHOICE_STAR) {
        if (head.value.length < expectedDepth) break;
        if (head.value.length > expectedDepth) break;
      } else if (head.kind === K.CHOICE_PLUS) {
        if (expectedDepth > 1) break;
      } else { break; }
      const sticky = head.kind === K.CHOICE_PLUS;
      this.advance();

      // Optional condition
      let condition: Condition | null = null;
      if (this.is(K.BRACE_OPEN)) {
        this.advance();
        condition = this.parseCondition();
        if (this.is(K.COLON)) { this.advance(); this.skipToBraceClose(); }
        this.expect(K.BRACE_CLOSE);
      }

      // Label
      this.expect(K.BRACKET_OPEN);
      const label = this.expect(K.TEXT).value;
      this.expect(K.BRACKET_CLOSE);

      // Body: text, assignments, then divert
      const body: ContentNode[] = [];
      let divert: string | null = null;

      while (!this.isEOF()) {
        const c = this.cur();
        if (c.kind === K.CHOICE_STAR) {
          if (c.value.length <= expectedDepth) break;
          // Nested choices: depth > expectedDepth → parse recursively (§1.13)
          body.push(this.parseChoices(c.value.length));
          continue;
        }
        if (c.kind === K.CHOICE_PLUS ||
            c.kind === K.PASSAGE_MARKER || c.kind === K.SUBSECTION_MARKER) break;

        if (c.kind === K.DIVERT) {
          this.advance();
          if (this.is(K.DIVERT) || this.is(K.DIVERT_RETURN)) {
            this.advance();
            divert = "RETURN";
          } else {
            divert = this.expectTokenKind([K.IDENTIFIER, K.KEYWORD_END, K.KEYWORD_DONE]).value;
          }
          break;
        }

        if (c.kind === K.DIVERT_RETURN) {
          this.advance();
          divert = "RETURN";
          break;
        }

        if (c.kind === K.ASSIGN) {
          body.push(this.parseAssignment());
          continue;
        }

        if (c.kind === K.TEXT) {
          const txt = this.advance().value.trim(); // §1.10: trim choice result text
          if (txt.length > 0) body.push({ type: "text", value: txt } as TextNode);
          continue;
        }

        // Skip stray tokens
        this.advance();
      }

      items.push({ label, sticky, condition, line: head.line, column: head.column, content: body, divert });
    }

    return { type: "choices", items };
  }

  // ---- diverts ------------------------------------------------------------

  parseDivertLine(): ContentNode[] {
    if (this.is(K.DIVERT_RETURN)) {
      this.advance();
      return [{ type: "divert_return" } as DivertReturnNode];
    }

    this.advance(); // DIVERT
    if (this.is(K.DIVERT)) { this.advance(); return [{ type: "divert_return" } as DivertReturnNode]; }
    if (this.is(K.DIVERT_RETURN)) { this.advance(); return [{ type: "divert_return" } as DivertReturnNode]; }

    const tgt = this.expectTokenKind([K.IDENTIFIER, K.KEYWORD_END, K.KEYWORD_DONE]);
    if (this.is(K.DIVERT)) {
      this.advance();
      return [{ type: "divert_tunnel", target: tgt.value, line: tgt.line, column: tgt.column } as DivertTunnelNode];
    }

    return [{ type: "divert", target: tgt.value, line: tgt.line, column: tgt.column } as DivertNode];
  }

  // ---- assignment ---------------------------------------------------------

  parseAssignment(): SetNode {
    this.expect(K.ASSIGN);
    const varName = this.expect(K.IDENTIFIER);
    this.expect(K.OPERATOR); // =

    // Shorthand: ~ x = x + 2
    if (this.is(K.IDENTIFIER) && this.cur().value === varName.value) {
      this.advance(); // consume same-name ident
      if (this.is(K.OPERATOR) && ["+", "-", "*", "/", "%"].includes(this.cur().value)) {
        const opTok = this.advance();
        const val = this.parseLiteral();
        return { type: "set", var: varName.value, op: (opTok.value + "=") as SetNode["op"], line: varName.line, column: varName.column, value: val.value };
      }
      // Same-name ident without valid operator — fall through to E201 below
    }

    // List value assignment: ~ حالة_الباب = مكسور (§1.6b)
    // Peek first — don't consume yet, so we can use the token for E201 if needed
    if (this.is(K.IDENTIFIER)) {
      const peeked = this.cur();
      const list = this.lists[varName.value];
      if (list && list.entries.includes(peeked.value)) {
        this.advance(); // consume the list value identifier
        return { type: "set", var: varName.value, op: "=", line: varName.line, column: varName.column, value: peeked.value };
      }
      // Not a valid list value — E201
      const expr = this.collectExpr(peeked);
      throw qalamError("E201", peeked.line, peeked.column, { expr });
    }

    // Plain assignment: must be a literal
    const rhsToken = this.cur();
    if (rhsToken.kind === K.NUMBER || rhsToken.kind === K.KEYWORD_TRUE ||
        rhsToken.kind === K.KEYWORD_FALSE || rhsToken.kind === K.STRING) {
      const val = this.parseLiteral();
      return { type: "set", var: varName.value, op: "=", line: varName.line, column: varName.column, value: val.value };
    }

    // E201: unsupported expression
    const expr = this.collectExpr(rhsToken);
    throw qalamError("E201", rhsToken.line, rhsToken.column, { expr });
  }

  /** Collect a few tokens for an E201 error expression string. */
  collectExpr(startToken: Token): string {
    let expr = startToken.value;
    let p = this.pos + 1;
    const endLine = startToken.line;
    while (p < this.tokens.length) {
      const t = this.tokens[p]!;
      if (t.line !== endLine) break;
      if (t.kind === K.PASSAGE_MARKER || t.kind === K.DIVERT || t.kind === K.THREAD ||
          t.kind === K.ASSIGN || t.kind === K.CHOICE_STAR || t.kind === K.CHOICE_PLUS ||
          t.kind === K.BRACE_OPEN || t.kind === K.BRACE_CLOSE || t.kind === K.SUBSECTION_MARKER) break;
      expr += " " + t.value;
      p++;
    }
    return expr;
  }

  // ---- text / conditional / interpolation ---------------------------------

  parseTextOrConditional(): ContentNode[] {
    const result: ContentNode[] = [];
    const startLine = this.cur().line;

    // Collect tokens belonging to this logical line (may span lines for conditionals)
    const buf: Token[] = [];
    let braceDepth = 0;
    let i = this.pos;
    let seenInterpolation = false;
    let firstBraceOpenLine = 0;
    let firstBraceOpenCol = 0;

    collect:
    while (i < this.tokens.length) {
      const t = this.tokens[i]!;
      // Stop at structural boundaries (only when braceDepth is 0)
      if (braceDepth === 0 && (
        t.kind === K.PASSAGE_MARKER || t.kind === K.CHOICE_STAR || t.kind === K.CHOICE_PLUS ||
        t.kind === K.DIVERT || t.kind === K.DIVERT_RETURN || t.kind === K.THREAD ||
        t.kind === K.ASSIGN || t.kind === K.SUBSECTION_MARKER
      )) break collect;

      if (t.kind === K.BRACE_OPEN) {
        if (braceDepth === 0) { firstBraceOpenLine = t.line; firstBraceOpenCol = t.column; }
        braceDepth++;
      }
      if (t.kind === K.BRACE_CLOSE) braceDepth--;

      // Detect interpolation patterns: BRACE_OPEN IDENTIFIER BRACE_CLOSE (no colon)
      if (t.kind === K.BRACE_OPEN) {
        let j = i + 1;
        let d = 1;
        let hasColon = false;
        while (j < this.tokens.length && d > 0) {
          const tj = this.tokens[j]!;
          if (tj.kind === K.BRACE_OPEN) d++;
          if (tj.kind === K.BRACE_CLOSE) d--;
          if (tj.kind === K.COLON && d === 1) { hasColon = true; break; }
          j++;
        }
        if (!hasColon) seenInterpolation = true;
      }

      buf.push(t);
      i++;

      // Stop after closing brace at depth 0, unless same-line text continues
      if (braceDepth === 0 && t.kind === K.BRACE_CLOSE) {
        if (i < this.tokens.length) {
          const next = this.tokens[i]!;
          if (next.line !== t.line) break collect;
          if (next.kind === K.DIVERT || next.kind === K.CHOICE_STAR || next.kind === K.CHOICE_PLUS ||
              next.kind === K.THREAD || next.kind === K.ASSIGN) break collect;
        }
      }
    }

    // E105: unclosed brace in conditional
    if (braceDepth > 0) {
      throw qalamError("E105", firstBraceOpenLine || startLine, firstBraceOpenCol || 1, {});
    }

    // Process the buffer
    let ti = 0;
    let textBuf = "";

    const flushText = () => {
      if (textBuf.length === 0) return;
      const trimmed = seenInterpolation ? textBuf : textBuf.trim(); // §1.10
      if (trimmed.length > 0) result.push({ type: "text", value: trimmed } as TextNode);
      textBuf = "";
    };

    while (ti < buf.length) {
      const t = buf[ti]!;

      if (t.kind === K.BRACE_OPEN) {
        flushText();

        // Does this brace have a colon?
        let hasColon = false;
        let j = ti + 1;
        let d = 1;
        while (j < buf.length && d > 0) {
          if (buf[j]!.kind === K.BRACE_OPEN) d++;
          if (buf[j]!.kind === K.BRACE_CLOSE) d--;
          if (buf[j]!.kind === K.COLON && d === 1) { hasColon = true; break; }
          j++;
        }

        if (hasColon) {
          // Conditional: { cond: text } or multi-branch (§1.12)
          ti++; // skip {
          // Capture position of the variable in the condition
          let condVarTok = buf[ti]!;
          if (condVarTok.kind === K.KEYWORD_NOT && ti + 1 < buf.length) {
            condVarTok = buf[ti + 1]!;
          }
          const condLine = condVarTok.line;
          const condCol = condVarTok.column;
          const cond = this.parseConditionFromSlice(buf, ti);
          while (ti < buf.length && buf[ti]!.kind !== K.COLON) ti++;
          const colonLine = buf[ti]!.line; // save COLON line for multi-branch check
          ti++; // skip :

          // Collect body TEXT tokens individually to detect branch patterns
          const bodyTexts: string[] = [];
          let firstBodyTextLine: number | undefined;
          let bodyDepth = 1;
          while (ti < buf.length && bodyDepth > 0) {
            const ct = buf[ti]!;
            if (ct.kind === K.BRACE_OPEN) bodyDepth++;
            if (ct.kind === K.BRACE_CLOSE) { bodyDepth--; if (bodyDepth === 0) { ti++; break; } }
            if (ct.kind === K.TEXT) { bodyTexts.push(ct.value); if (firstBodyTextLine === undefined) firstBodyTextLine = ct.line; }
            ti++;
          }

          // Multi-branch: must be on a new line after the colon, and every TEXT starts with "- " (§1.12)
          const allBranches = bodyTexts.length > 0 &&
            firstBodyTextLine !== undefined && firstBodyTextLine !== colonLine &&
            bodyTexts.every(t => t.trimStart().startsWith("- "));

          if (allBranches) {
            result.push(...this.compileMultiBranch(bodyTexts, condLine, condCol));
          } else {
            // Single-branch conditional (original behaviour)
            const bodyText = bodyTexts.join("");
            const thenContent: ContentNode[] = [];
            const trimmedBody = bodyText.trim(); // §1.10: trim conditional body
            if (trimmedBody.length > 0) thenContent.push({ type: "text", value: trimmedBody } as TextNode);

            result.push({
              type: "conditional",
              condition: cond,
              line: condLine,
              column: condCol,
              then: thenContent,
              else: [],
            } as ConditionalNode);
          }
        } else {
          // Interpolation: { var }
          ti++; // skip {
          const varTok = buf[ti]!;
          ti++; // IDENTIFIER
          ti++; // skip }
          result.push({ type: "interpolation", var: varTok.value, line: varTok.line, column: varTok.column } as InterpolationNode);
        }
        continue;
      }

      if (t.kind === K.TEXT) {
        textBuf += t.value;
        ti++;
        continue;
      }

      ti++; // skip unexpected
    }

    flushText();

    // Advance main token position
    while (this.pos < i) this.advance();

    return result;
  }

  // ---- condition parsing --------------------------------------------------

  /** Parse a condition from the main token stream (with leading { consumed). */
  parseCondition(): Condition {
    let negated = false;
    if (this.is(K.KEYWORD_NOT)) { this.advance(); negated = true; }
    const varName = this.expect(K.IDENTIFIER);

    if (this.is(K.OPERATOR) && ["==", "!=", "<", ">", "<=", ">="].includes(this.cur().value)) {
      const op = this.advance().value;
      const val = this.parseLiteral();
      let actualOp = op;
      if (negated) {
        const inv: Record<string, string> = { "==": "!=", "!=": "==", "<": ">=", ">": "<=", "<=": ">", ">=": "<" };
        actualOp = inv[op] ?? op;
      }
      return { var: varName.value, op: actualOp as Condition["op"], value: val.value };
    }
    return { var: varName.value };
  }

  /** Parses a condition from a token slice starting at ti (does NOT consume {). */
  parseConditionFromSlice(buf: Token[], ti: number): Condition {
    if (buf[ti]!.kind === K.KEYWORD_NOT) ti++;
    const varTok = buf[ti]!;
    if (ti + 1 < buf.length && buf[ti + 1]!.kind === K.OPERATOR) {
      const op = buf[ti + 1]!.value;
      if (["==", "!=", "<", ">", "<=", ">="].includes(op)) {
        const valTok = buf[ti + 2]!;
        let value: number | string | boolean;
        if (valTok.kind === K.NUMBER) value = numValue(valTok);
        else if (valTok.kind === K.KEYWORD_TRUE || valTok.kind === K.KEYWORD_FALSE) value = boolValue(valTok);
        else value = valTok.value;
        return { var: varTok.value, op: op as Condition["op"], value };
      }
    }
    return { var: varTok.value };
  }

  // ---- multi-branch conditional (§1.12) ------------------------------------

  /** Parse an inline condition expression (e.g. "الشجاعة < 3") into a Condition object. */
  parseInlineCondition(condExpr: string): Condition {
    const match = condExpr.match(/^(\S+)\s+([<>=!]+)\s+(.+)$/);
    if (match) {
      const varName = stripTashkeel(match[1]!);
      const op = match[2]!;
      const valueStr = match[3]!;
      let value: number | string | boolean;
      if (/^\d+$/.test(valueStr)) {
        value = Number(valueStr);
      } else if (valueStr === "صح" || valueStr === "true") {
        value = true;
      } else if (valueStr === "خطأ" || valueStr === "false") {
        value = false;
      } else {
        value = valueStr;
      }
      return { var: varName, op: op as Condition["op"], value };
    }
    // Truthiness form — also strip tashkeel from the bare variable name
    return { var: stripTashkeel(condExpr) };
  }

  /**
   * Compile multi-branch conditional body texts into a chain of nested
   * ConditionalNodes. Each branch text is a line like `- cond: body`.
   * The last branch may be `- غير_ذلك: body` (the else).
   */
  compileMultiBranch(bodyTexts: string[], condLine: number, condCol: number): ContentNode[] {
    // Parse each branch: strip "- ", split at first ":", trim both sides
    const branches = bodyTexts.map((t) => {
      const trimmed = t.trimStart().substring(2); // strip "- "
      const colonIdx = trimmed.indexOf(":");
      if (colonIdx === -1) {
        return { condPart: trimmed.trim(), bodyPart: "" };
      }
      return {
        condPart: trimmed.substring(0, colonIdx).trim(),
        bodyPart: trimmed.substring(colonIdx + 1).trim(),
      };
    });

    // Build nested chain from bottom up
    let elseContent: ContentNode[] = [];

    for (let i = branches.length - 1; i >= 0; i--) {
      const br = branches[i]!;
      const thenContent: ContentNode[] =
        br.bodyPart.length > 0
          ? [{ type: "text", value: br.bodyPart } as TextNode]
          : [];

      if (br.condPart === "غير_ذلك" || br.condPart === "else") {
        elseContent = thenContent;
      } else {
        const cond = this.parseInlineCondition(br.condPart);
        elseContent = [
          { type: "conditional", condition: cond, line: condLine, column: condCol, then: thenContent, else: elseContent } as ConditionalNode,
        ];
      }
    }

    return elseContent;
  }

  skipToBraceClose(): void {
    while (!this.isEOF() && !this.is(K.BRACE_CLOSE)) this.advance();
  }

  // ---- literal ------------------------------------------------------------

  parseLiteral(): Token {
    const t = this.advance();
    if (t.kind === K.NUMBER || t.kind === K.KEYWORD_TRUE || t.kind === K.KEYWORD_FALSE || t.kind === K.STRING) {
      let value: number | string | boolean;
      if (t.kind === K.NUMBER) value = numValue(t);
      else if (t.kind === K.KEYWORD_TRUE) value = true;
      else if (t.kind === K.KEYWORD_FALSE) value = false;
      else value = t.value;
      return { kind: t.kind, value, line: t.line, column: t.column } as Token;
    }
    throw qalamError("E000", t.line, t.column, {
      _msg: `Expected literal at ${t.line}:${t.column}`,
    });
  }

  // ---- helpers ------------------------------------------------------------

  expectTokenKind(kinds: string[]): Token {
    const t = this.advance();
    if (!kinds.includes(t.kind)) {
      throw qalamError("E000", t.line, t.column, {
        _msg: `Expected one of ${kinds.join(",")} but got ${t.kind} at ${t.line}:${t.column}`,
      });
    }
    return t;
  }

  basename(filename: string): string {
    const m = filename.match(/([^/\\]+?)(?:\.[^.]+)?$/);
    return m ? m[1]! : filename;
  }
}

// ---- public API -----------------------------------------------------------

export function parse(source: string, filename: string): StoryAST {
  const tokens = tokenize(source);
  const p = new ParserState(tokens);
  return p.parseStory(filename);
}
