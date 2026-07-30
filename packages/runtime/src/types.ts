// ---------------------------------------------------------------------------
// Aqlamna runtime types — the story JSON shape the engine consumes
// ---------------------------------------------------------------------------

/** Top-level compiled story JSON (design doc §4). */
export interface StoryJSON {
  qalam_version: string;
  title: string | null;
  author: string | null;
  language: string;
  direction: "rtl" | "ltr";
  start: string | null;
  variables: Record<string, VariableDecl>;
  lists: Record<string, ListDecl>;
  passages: Record<string, Passage>;
  metadata?: Record<string, unknown>;
}

export interface VariableDecl {
  type: "number" | "string" | "boolean";
  initial: number | string | boolean;
}

export interface ListDecl {
  values: string[];
  initial: string;
}

export interface Passage {
  tags: string[];
  content: ContentNode[];
}

// ---- Content nodes (§4.2) -------------------------------------------------

export type ContentNode =
  | TextNode
  | ChoicesNode
  | ConditionalNode
  | SetNode
  | DivertNode
  | TunnelNode
  | DivertReturnNode
  | ThreadNode
  | InterpolationNode;

export interface TextNode {
  type: "text";
  value: string;
}

export interface ChoicesNode {
  type: "choices";
  items: ChoiceItem[];
}

export interface ChoiceItem {
  id: string;
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

export interface SetNode {
  type: "set";
  var: string;
  op?: "=" | "+=" | "-=" | "*=" | "/=";
  value: number | string | boolean;
}

export interface DivertNode {
  type: "divert";
  target: string;
}

export interface TunnelNode {
  type: "tunnel";
  target: string;
}

export interface DivertReturnNode {
  type: "divert_return";
}

export interface ThreadNode {
  type: "thread";
  target: string;
}

export interface InterpolationNode {
  type: "interpolation";
  var: string;
}

// ---- Condition (§4.1) -----------------------------------------------------

export interface VarCondition {
  var: string;
  op?: "==" | "!=" | "<" | ">" | "<=" | ">=";
  value?: number | string | boolean;
}

export interface NotCondition {
  not: Condition;
}

export interface AndCondition {
  and: Condition[];
}

export interface OrCondition {
  or: Condition[];
}

export type Condition = VarCondition | NotCondition | AndCondition | OrCondition;

// ---- Engine state (serialisable) ------------------------------------------

/** Full story state — can be serialised to JSON for save/restore. */
export interface StoryState {
  passage: string;
  variables: Record<string, number | string | boolean>;
  lists: Record<string, string>;
  visited: Record<string, number>;
  consumed: string[];
  ended: boolean;
}

// ---- Scene: what the engine yields when it pauses -------------------------

export interface StoryScene {
  /** The name of the current passage. */
  passage: string;
  /** Resolved output nodes — text and interpolation values. */
  output: OutputNode[];
  /** Available choices at this point (filtered by conditions and consumed). */
  choices: AvailableChoice[];
  /** True when the story has ended (hit END or a terminal state). */
  ended: boolean;
}

export type OutputNode =
  | { type: "text"; value: string }
  | { type: "linebreak" };

export interface AvailableChoice {
  id: string;
  label: string;
  sticky: boolean;
}
