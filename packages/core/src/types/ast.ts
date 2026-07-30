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
}

export interface DivertTunnelNode {
  type: "divert_tunnel";
  target: string;
}

export interface DivertReturnNode {
  type: "divert_return";
}

export interface ThreadNode {
  type: "thread";
  target: string;
}

export interface ChoicesNode {
  type: "choices";
  items: ChoiceItem[];
}

export interface ChoiceItem {
  label: string;
  sticky: boolean;
  condition: Condition | null;
  content: ContentNode[];
  divert: string | null;
}

export interface ConditionalNode {
  type: "conditional";
  condition: Condition;
  then: ContentNode[];
  else: ContentNode[];
}

export interface InterpolationNode {
  type: "interpolation";
  var: string;
}

export interface SetNode {
  type: "set";
  var: string;
  op: "=" | "+=" | "-=" | "*=" | "/=" | "%=";
  value: number | string | boolean;
}

// ---- Condition ------------------------------------------------------------

export interface Condition {
  var: string;
  /** Absent for truthiness checks (e.g. `{وجد: ...}`). */
  op?: "==" | "!=" | "<" | ">" | "<=" | ">=";
  value?: number | string | boolean;
}
