// ---------------------------------------------------------------------------
// Linter types — shared between the linter and its consumers.
// ---------------------------------------------------------------------------

/** Severity of a linter diagnostic. */
export type Severity = "error" | "warning" | "info";

/** A single diagnostic produced by the linter. */
export interface Diagnostic {
  /** Rule identifier, e.g. "1b.2.1" or "2.2-mashakil" */
  ruleId: string;
  /** Severity level */
  severity: Severity;
  /** Arabic message explaining the issue */
  messageAr: string;
  /** 1-based line number */
  line: number;
  /** 1-based column number (byte offset from line start) */
  column: number;
  /** Length of the flagged token in bytes */
  length: number;
  /** Suggested replacement text, if the rule offers one */
  suggestion?: string;
}

/** A linter rule as stored in rules.json */
export interface LintRule {
  id: string;
  kind: "pair" | "pattern" | "advisory";
  severity: Severity;
  messageAr: string;
  section: string;
  /** For pair rules: the bad pattern to match */
  bad?: string;
  /** For pair rules: the suggested replacement */
  good?: string;
  /** For pattern rules: regex pattern string */
  pattern?: string;
  /** For pattern rules: suggested replacement */
  suggestion?: string | null;
  /** Developer note / example for extra pattern rules */
  note?: string;
}

/** The full rules.json structure */
export interface RulesFile {
  _meta: {
    source: string;
    lastModified: string;
    generatedAt: string;
    counts: {
      pair: number;
      pattern: number;
      advisory: number;
      total: number;
    };
  };
  rules: LintRule[];
}
