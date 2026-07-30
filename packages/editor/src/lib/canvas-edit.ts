// ---------------------------------------------------------------------------
// Canvas edit utilities — surgical text edits on .qalam source.
// Every function here takes the current source and returns a modified copy.
// The .qalam text IS the source of truth; these are text operations, never
// AST-based regeneration. NEVER regenerate the full document.
// ---------------------------------------------------------------------------

/**
 * Locate the byte range of a passage block identified by `passageName`.
 * Returns `{ start, headerEnd, end }` where:
 *   - `start` is the index of the first character of the `===` header
 *   - `headerEnd` is the index right after the `===` header line (including \n)
 *   - `end` is the index right after the block (start of next `===` or EOF)
 *
 * Returns null if no passage with the given name exists.
 */
export function findPassageRange(
  source: string,
  passageName: string,
): { start: number; headerEnd: number; end: number } | null {
  const escaped = escapeRegex(passageName);
  const headerRe = new RegExp(`^===\\s+${escaped}\\s+===`, "gm");
  const match = headerRe.exec(source);
  if (!match) return null;

  const start = match.index;
  const headerEnd = match.index + match[0].length;

  // Find the next `===` header after this one
  const nextHeaderRe = /^===/gm;
  nextHeaderRe.lastIndex = headerEnd;
  const nextMatch = nextHeaderRe.exec(source);
  const end = nextMatch ? nextMatch.index : source.length;

  return { start, headerEnd, end };
}

/**
 * Append a `-> target` divert line at the end of the source passage's block.
 * Inserts right before the blank-line gap that precedes the next passage.
 */
export function appendDivert(
  source: string,
  fromPassage: string,
  toPassage: string,
): string {
  const range = findPassageRange(source, fromPassage);
  if (!range) return source;

  const block = source.slice(range.headerEnd, range.end);

  // Find trailing blank lines
  const trailingMatch = block.match(/(\n\s*)$/);
  const trailingLen = trailingMatch ? trailingMatch[1]!.length : 0;

  const insertPos = range.end - trailingLen;

  // Insert divert line, then preserve the trailing blank lines
  const divertLine = `-> ${toPassage}`;
  // Ensure there's at least one newline before the divert
  const prefix = insertPos > 0 && source[insertPos - 1] !== "\n" ? "\n" : "";

  return (
    source.slice(0, insertPos) +
    prefix +
    divertLine +
    source.slice(insertPos)
  );
}

/**
 * Append a new empty passage block at the very end of the source.
 */
export function appendNewPassage(
  source: string,
  passageName: string,
): string {
  const trimmed = source.trimEnd();
  const suffix = source.slice(trimmed.length); // trailing whitespace after trimmed
  return trimmed + `\n\n=== ${passageName} ===\n\n` + suffix;
}

/**
 * Surgically remove an entire passage block (header + content).
 * Returns source unchanged if the passage is not found or is the only
 * passage in the source.
 */
export function deletePassage(
  source: string,
  passageName: string,
): string {
  const range = findPassageRange(source, passageName);
  if (!range) return source;

  // Don't delete if it's the only passage
  const otherPassages = source.match(/^===/gm);
  if (otherPassages && otherPassages.length <= 1) return source;

  // Remove the block and clean up excess blank lines at the boundary
  let before = source.slice(0, range.start);
  let after = source.slice(range.end);

  // Trim trailing whitespace from before
  before = before.trimEnd();
  // Trim leading whitespace from after
  after = after.replace(/^\s+/, "");

  // Ensure exactly one blank line between adjacent passages
  if (before.length > 0 && after.startsWith("===")) {
    return before + "\n\n" + after;
  }
  if (before.length === 0 && after.startsWith("===")) {
    return after;
  }
  return before + after;
}

/**
 * Rename a passage: update the `=== header ===` AND every reference to it
 * in diverts (`->`, `~>`, `<-`), tunnel destinations, thread sources, and
 * dotted subsection prefixes (`oldName.`).
 *
 * Returns source unchanged if the old name is not found as a passage header.
 */
export function renamePassage(
  source: string,
  oldName: string,
  newName: string,
): string {
  const range = findPassageRange(source, oldName);
  if (!range) return source;

  // 1. Replace the header line
  const headerLine = source.slice(range.start, range.headerEnd);
  const newHeaderLine = headerLine.replace(
    new RegExp(`===\\s+${escapeRegex(oldName)}\\s+===`),
    `=== ${newName} ===`,
  );

  let result =
    source.slice(0, range.start) + newHeaderLine + source.slice(range.headerEnd);

  // 2. Replace all diver/tunnel/thread references
  // Match oldName when it appears as a target after ->, ~>, or <- (with optional
  // whitespace between the arrow and the name), and as a dotted prefix (oldName.subsection).
  // We use word-boundary on the right to avoid partial matches like "باب" matching "باب_الحديقة".
  const escaped = escapeRegex(oldName);

  // Divert target: `-> oldName` (possibly with spaces, at end of line)
  const divertRe = new RegExp(
    `(->\\s+)${escaped}(\\s*)$`,
    "gm",
  );
  result = result.replace(divertRe, `$1${newName}$2`);

  // Tunnel divert: `~> oldName`
  const tunnelRe = new RegExp(
    `(~>\\s+)${escaped}(\\s*)$`,
    "gm",
  );
  result = result.replace(tunnelRe, `$1${newName}$2`);

  // Thread pull: `<- oldName`
  const threadRe = new RegExp(
    `(<\-\\s+)${escaped}(\\s*)$`,
    "gm",
  );
  result = result.replace(threadRe, `$1${newName}$2`);

  // Dotted subsection prefix: `oldName.subsection` (not preceded by arrow)
  // Match oldName followed by a dot and another identifier.
  // Use lookbehind to avoid matching after arrows (those are already handled above).
  const dottedRe = new RegExp(
    `(?<![>~\\-]\\s)${escaped}(\\.\\S+)`,
    "gm",
  );
  result = result.replace(dottedRe, `${newName}$1`);

  return result;
}

/**
 * Escape a string for safe use in a RegExp.
 */
function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
