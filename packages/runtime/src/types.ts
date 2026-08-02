// ---------------------------------------------------------------------------
// Aqlamna runtime types — the story JSON shape the engine consumes
// ---------------------------------------------------------------------------

/** Player theme identifier. */
export type PlayerTheme = "dark" | "light" | "book";

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
  images?: Record<string, ImageAsset>;
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

export interface ImageAsset {
  alt: string;
  data?: string; // absent when not yet generated
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
  | ImageContentNode
  | InterpolationNode;

export interface TextNode {
  type: "text";
  /**
   * `null` is the line-break sentinel of PHASE1_SPEC §1.16 — it joins two
   * consecutive prose lines inside one paragraph. Real prose is a string.
   */
  value: string | null;
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

export interface ImageContentNode {
  type: "image";
  name: string;
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
  /** Save format version. v1 had consumed: string[] (global). v2 uses per-passage map. */
  save_version?: number;
  passage: string;
  variables: Record<string, number | string | boolean>;
  lists: Record<string, string>;
  visited: Record<string, number>;
  /** Per-passage consumed choice IDs. Key is passage name, value is array of choice IDs consumed in that passage. */
  consumed: Record<string, string[]>;
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
  | ImageOutputNode
  | TextOutputNode
  | LineBreakOutputNode
  | ParagraphOutputNode;

/**
 * Set on every node produced by a choice's own content.
 *
 * The engine hands that content to advance() as a prefix of the NEXT passage's
 * output, so without a mark the renderer cannot tell "what your click did" from
 * "where you now are" — they arrive as one flat array. The renderer needs the
 * difference twice: to let the destination's own opening image stay at the top
 * of the passage, and to give the beat a paragraph and a style of its own.
 */
interface AfterChoiceMark {
  afterChoice?: true;
}

export interface TextOutputNode extends AfterChoiceMark {
  type: "text";
  value: string;
  /**
   * True when this run came from an interpolation (`{متغير}`) rather than a
   * prose line. Two adjacent prose runs mean a paragraph boundary (PHASE1_SPEC
   * §1.16); an interpolation sits *inside* a line and must never break it.
   */
  inline?: boolean;
}

export interface ImageOutputNode extends AfterChoiceMark {
  type: "image";
  alt: string;
  data?: string;
}

export interface LineBreakOutputNode extends AfterChoiceMark {
  type: "linebreak";
}

export interface ParagraphOutputNode extends AfterChoiceMark {
  type: "paragraph";
}

export interface AvailableChoice {
  id: string;
  label: string;
  sticky: boolean;
}
