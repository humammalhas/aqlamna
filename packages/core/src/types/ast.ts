// ---------------------------------------------------------------------------
// Aqlamna AST (Abstract Syntax Tree) types
// ---------------------------------------------------------------------------

/** Top-level story AST produced by the parser. */
export interface StoryAST {
  version: string;
  title: string | null;
  author: string | null;
  language: string;
  direction: "rtl";
  start: string | null;
  variables: Record<string, VariableDecl>;
  lists: Record<string, ListDecl>;
  passages: PassageNode[];
}

// ---- Declarations ---------------------------------------------------------

export interface VariableDecl {
  type: "number" | "string" | "boolean";
  initial: number | string | boolean;
}

export interface ListDecl {
  entries: string[];
  initial: string;
}

// ---- Passages and subsections ---------------------------------------------

export interface PassageNode {
  name: string;
  tags: string[];
  subsections: SubsectionNode[];
  content: ContentNode[];
}

export interface SubsectionNode {
  name: string;
  content: ContentNode[];
}

// ---- Content nodes --------------------------------------------------------

export type ContentNode =
  | TextNode
  | DivertNode
  | DivertTunnelNode
  | DivertReturnNode
  | ThreadNode
  | ChoicesNode
  | ConditionalNode
  | InterpolationNode
  | SetNode;

export interface TextNode {
  type: "text";
  value: string;
}

export interface DivertNode {
  type: "divert";
  target: string;
  line: number;
  column: number;
}

export interface DivertTunnelNode {
  type: "divert_tunnel";
  target: string;
  line: number;
  column: number;
}

export interface DivertReturnNode {
  type: "divert_return";
}

export interface ThreadNode {
  type: "thread";
  target: string;
  line: number;
  column: number;
}

export interface ChoicesNode {
  type: "choices";
  items: ChoiceItem[];
}

export interface ChoiceItem {
  label: string;
  sticky: boolean;
  condition: Condition | null;
  line: number;
  column: number;
  content: ContentNode[];
  divert: string | null;
}

export interface ConditionalNode {
  type: "conditional";
  condition: Condition;
  line: number;
  column: number;
  then: ContentNode[];
  else: ContentNode[];
}

export interface InterpolationNode {
  type: "interpolation";
  var: string;
  line: number;
  column: number;
}

export interface SetNode {
  type: "set";
  var: string;
  op: "=" | "+=" | "-=" | "*=" | "/=" | "%=";
  line: number;
  column: number;
  value: number | string | boolean;
}

// ---- Condition ------------------------------------------------------------

export interface Condition {
  var: string;
  /** Absent for truthiness checks (e.g. `{وجد: ...}`). */
  op?: "==" | "!=" | "<" | ">" | "<=" | ">=";
  value?: number | string | boolean;
  /** True when the condition is negated with لا (e.g. `{لا وجد}`). */
  negated?: boolean;
}
