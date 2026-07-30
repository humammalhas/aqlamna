// ---------------------------------------------------------------------------
// Canvas parser — extracts nodes and edges from .qalam source text.
// Read-only: parses the text, never modifies it. The .qalam is the source of
// truth; the canvas is just a view.
// ---------------------------------------------------------------------------

import type { Node, Edge } from "@xyflow/react";

// ---- Graph types -----------------------------------------------------------

export interface ParsedCanvas {
  nodes: Node[];
  edges: Edge[];
}

export type PassageColour = "green" | "red" | "orange" | "blue";

export interface PassageNodeData {
  /** Passage name (displayed in card title). */
  title: string;
  /** Subsection path if this is a dotted subsection, e.g. "المنزل.غرفة_النوم". */
  subsectionOf: string | null;
  /** First ~50 chars of prose. */
  preview: string;
  /** Number of choice items in this passage. */
  choiceCount: number;
  /** Whether this is the start passage (first `===` in the file). */
  isStart: boolean;
  /** Whether this passage contains a divert to END. */
  hasEndDivert: boolean;
  /** Whether this passage contains conditionals. */
  hasConditions: boolean;
  /** Border colour. */
  colour: PassageColour;
}

// ---- Parser ----------------------------------------------------------------

const PASSAGE_RE = /^===\s+(.+?)\s+===/gm;
const SUBSECTION_RE = /^=\s+(.+?)\s*$/gm;
const DIVERT_RE = /^->\s+(\S+)/gm;
const TUNNEL_RE = /^~>\s+(\S+)/gm;
const THREAD_RE = /^<-\s+(\S+)/gm;
const CHOICE_RE = /^[*+]\s+/gm;
const CONDITIONAL_RE = /\{\S+[:}]/g;
const END_RE = /->\s+(?:نهاية|END)\b/g;

const END_KEYWORDS = new Set(["نهاية", "END"]);

/**
 * Parse .qalam source text into a React Flow node/edge graph.
 */
export function parseCanvas(source: string): ParsedCanvas {
  const nodes: Node[] = [];
  const edges: Edge[] = [];
  const passageNames = new Set<string>();
  const subsections: Array<{ parent: string; name: string; fullPath: string }> = [];

  // --- Step 1: Find all passages (=== header ===) ---
  const passageMatches = [...source.matchAll(PASSAGE_RE)];
  let currentParent: string | null = null;
  let startPassage: string | null = null;

  for (let pi = 0; pi < passageMatches.length; pi++) {
    const m = passageMatches[pi]!;
    const name = m[1]!.trim();
    passageNames.add(name);
    if (startPassage === null) startPassage = name;

    const startIdx = m.index! + m[0].length;
    const nextPassageIdx =
      pi + 1 < passageMatches.length
        ? passageMatches[pi + 1]!.index!
        : source.length;
    const body = source.slice(startIdx, nextPassageIdx);

    // --- Subsections within this passage ---
    currentParent = name;
    const sectionRE = new RegExp(SUBSECTION_RE.source, "gm");
    const sectionMatches = [...body.matchAll(sectionRE)];
    for (const sm of sectionMatches) {
      const sName = sm[1]!.trim();
      const fullPath = `${currentParent}.${sName}`;
      subsections.push({ parent: currentParent, name: sName, fullPath });
      passageNames.add(fullPath);
    }

    // --- Extract data for the node ---
    const preview = extractPreview(body);
    const choiceCount = (body.match(CHOICE_RE) ?? []).length;
    const hasEndDivert = END_RE.test(body);
    const hasConditions = body !== name && CONDITIONAL_RE.test(body);

    const colour: PassageColour = hasEndDivert
      ? "red"
      : hasConditions
        ? "orange"
        : name === startPassage
          ? "green"
          : "blue";

    nodes.push({
      id: name,
      type: "passage",
      position: { x: 0, y: 0 }, // auto-layout will set real positions
      data: {
        title: name,
        subsectionOf: null,
        preview,
        choiceCount,
        isStart: name === startPassage,
        hasEndDivert,
        hasConditions,
        colour,
      } satisfies PassageNodeData,
    });

    // --- Subsection nodes for this passage ---
    for (const sm of sectionMatches) {
      const sName = sm[1]!.trim();
      const fullPath = `${name}.${sName}`;
      nodes.push({
        id: fullPath,
        type: "passage",
        position: { x: 0, y: 0 },
        data: {
          title: fullPath,
          subsectionOf: name,
          preview: "(مقطع فرعي)",
          choiceCount: 0,
          isStart: false,
          hasEndDivert: false,
          hasConditions: false,
          colour: "blue",
        } satisfies PassageNodeData,
      });
      edges.push({
        id: `${name}->${fullPath}-subsection`,
        source: name,
        target: fullPath,
        type: "smoothstep",
      });
    }

    // --- Diverts from this passage ---
    const divertRe = new RegExp(DIVERT_RE.source, "gm");
    const tunnelRe = new RegExp(TUNNEL_RE.source, "gm");

    for (const dm of body.matchAll(divertRe)) {
      const target = dm[1]!.trim();
      // Skip END diverts — they don't go to a passage
      if (END_KEYWORDS.has(target)) continue;
      edges.push({
        id: `${name}->${target}-${edges.length}`,
        source: name,
        target: target,
        type: name === target ? "default" : "smoothstep",
      });
      if (!passageNames.has(target)) {
        passageNames.add(target); // track so ghost node can be created
      }
    }

    for (const tm of body.matchAll(tunnelRe)) {
      const target = tm[1]!.trim();
      edges.push({
        id: `${name}~>${target}-${edges.length}`,
        source: name,
        target: target,
        type: "smoothstep",
        label: "نفق",
        style: { strokeDasharray: "5 5" },
      });
      if (!passageNames.has(target)) {
        passageNames.add(target);
      }
    }

    // --- Thread pulls from this passage (-> pulled content) ---
    const threadRe = new RegExp(THREAD_RE.source, "gm");
    for (const thm of body.matchAll(threadRe)) {
      const target = thm[1]!.trim();
      // Thread edge goes FROM the thread source TO this passage
      edges.push({
        id: `${target}<-${name}-${edges.length}`,
        source: target,
        target: name,
        type: "smoothstep",
        style: { strokeDasharray: "3 3" },
      });
      if (!passageNames.has(target)) {
        passageNames.add(target);
      }
    }
  }

  // --- Step 2: Add ghost nodes for dangling divert targets ---
  for (const edge of edges) {
    const target = edge.target;
    if (END_KEYWORDS.has(target)) continue; // END is special
    const targetExists = nodes.some((n) => n.id === target);
    if (!targetExists) {
      nodes.push({
        id: target,
        type: "passage",
        position: { x: 0, y: 0 },
        data: {
          title: target,
          subsectionOf: null,
          preview: "⚠️ مقطع غير موجود",
          choiceCount: 0,
          isStart: false,
          hasEndDivert: false,
          hasConditions: false,
          colour: "blue",
        } satisfies PassageNodeData,
        style: {
          border: "2px dashed #c06050",
          opacity: 0.7,
        },
      });
    }
  }

  return { nodes, edges };
}

// ---- Auto-layout -----------------------------------------------------------

/**
 * Simple layered left-to-right auto-layout for nodes with no saved position.
 * Nodes are arranged by BFS depth from the start passage.
 */
export function autoLayout(nodes: Node[], edges: Edge[], startPassageId: string): Node[] {
  const depthMap = new Map<string, number>();
  const queue: string[] = [startPassageId];
  depthMap.set(startPassageId, 0);

  // BFS to assign depths
  while (queue.length > 0) {
    const current = queue.shift()!;
    const depth = depthMap.get(current)!;
    for (const edge of edges) {
      if (edge.source === current && !depthMap.has(edge.target)) {
        depthMap.set(edge.target, depth + 1);
        queue.push(edge.target);
      }
    }
  }

  // Assign any unvisited nodes to depth 0
  for (const node of nodes) {
    if (!depthMap.has(node.id)) {
      depthMap.set(node.id, 0);
    }
  }

  // Group nodes by depth, assign positions
  const depthNodes = new Map<number, Node[]>();
  for (const node of nodes) {
    const d = depthMap.get(node.id) ?? 0;
    if (!depthNodes.has(d)) depthNodes.set(d, []);
    depthNodes.get(d)!.push(node);
  }

  const H_SPACING = 280;
  const V_SPACING = 140;

  const positioned = nodes.map((node) => {
    if (node.position.x !== 0 || node.position.y !== 0) return node; // already positioned
    const d = depthMap.get(node.id) ?? 0;
    const siblings = depthNodes.get(d) ?? [node];
    const idx = siblings.indexOf(node);
    return {
      ...node,
      position: {
        x: d * H_SPACING,
        y: idx >= 0 ? idx * V_SPACING : 0,
      },
    };
  });

  return positioned;
}

// ---- Helpers ---------------------------------------------------------------

function extractPreview(body: string): string {
  // Strip header lines, choices markup, diverts, variable operations
  const cleaned = body
    .replace(/^=.*$/gm, "")
    .replace(/^[*+]\s+.*$/gm, "")
    .replace(/^->\s+.*$/gm, "")
    .replace(/^~>\s+.*$/gm, "")
    .replace(/^<-\s+.*$/gm, "")
    .replace(/^~\s+.*$/gm, "")
    .replace(/^[ \t]*$/gm, "")
    .replace(/[\{\}]/g, "")
    .replace(/^\s*[-–—]\s*/gm, "")
    .trim();

  // Take first ~50 characters
  if (cleaned.length === 0) return "(فارغ)";
  return cleaned.length > 55 ? cleaned.slice(0, 50) + "…" : cleaned;
}
