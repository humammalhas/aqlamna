# Canvas — deferred work (Phase 3)

These are confirmed NOT DONE as of the Phase 2 editor. Do not start these until
Phase 3; they are tracked here so they are not silently forgotten.

## Subsection nodes

Subsections are parsed but no nodes are created for them.

- **`canvas-parser.ts:56`** — `const subsections: Array<{...}> = []` is declared
- **`canvas-parser.ts:83`** — populated with `subsections.push({ parent, name, fullPath })` inside the passage loop
- The `subsections` array is never read after being populated. No subsection nodes are ever pushed to the `nodes` array.
- Subsection names are tracked in `passageNames` (line 84) so ghost nodes appear for dangling diverts to subsections, but the actual subsection nodes with their content never render.

## Thread edges (`<-` syntax)

The `<-` syntax (design §3.2, "thread") is not parsed.

- **`canvas-parser.ts:41`** — `DIVERT_RE = /^->\s+(\S+)/gm` handles forward diverts only
- **`canvas-parser.ts:42`** — `TUNNEL_RE = /^~>\s+(\S+)/gm` handles tunnel diverts
- No regex or logic exists for `<-` (thread). Thread edges never appear on the canvas.

## Canvas interactions

These interactive features of the canvas view are not implemented:

- **click→cursor** — clicking a node does not move the text cursor to the corresponding passage in the editor
- **drag→edge** — dragging from a node handle does not create a new connecting edge (`onConnect` callback is not wired in `CanvasPane.tsx`)
- **double-click→new passage** — double-clicking empty canvas space does not create a new passage node
- **delete card** — `deleteKeyCode={null}` at `CanvasPane.tsx:152` explicitly disables deletion; pressing Delete on a selected node does nothing
- **rename propagation** — renaming a node does not update the passage name in the .qalam source text

## Missing Playwright tests

Two visual/behavioural tests are called out as needed but not written:

- `tests/visual.spec.ts` — **drag persistence**: drag a node, switch to text view and back, verify the position is preserved
- `tests/visual.spec.ts` — **no-corruption guard**: make edits in text mode, switch to canvas and back, verify the editor content is byte-identical (not just "contains اليداية")
