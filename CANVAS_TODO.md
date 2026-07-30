# Canvas — deferred work (Phase 3)

These are confirmed NOT DONE as of the Phase 2 editor. Do not start these until
Phase 3; they are tracked here so they are not silently forgotten.

## ✅ Subsection nodes

**DONE.** Subsections are parsed and pushed as child nodes with dotted IDs
(e.g. `المنزل.غرفة_النوم`). Each subsection gets an edge from its parent
passage. Implemented in `canvas-parser.ts`.

## ✅ Thread edges (`<-` syntax)

**DONE.** `THREAD_RE = /^<-\s+(\S+)/gm` added to `canvas-parser.ts`. Thread
edges appear as dashed edges FROM the thread source TO the passage that
references it with `<-`.

## ✅ Canvas interactions

These interactive features of the canvas view are now implemented:

- ✅ **click→cursor** — clicking a node moves the text cursor to the
  corresponding passage in CodeMirror (via `store.requestCursorJump`)
- ✅ **drag→edge** — dragging from a node's source handle to another node's
  target handle appends a `-> target` divert at the end of the source passage
  (via `CanvasPane.handleConnect` + `canvas-edit.appendDivert`)
- ✅ **double-click→new passage** — double-clicking empty canvas space shows
  an Arabic prompt (`window.prompt`) and appends a new `=== name ===` block
  at the end of the source (via `canvas-edit.appendNewPassage`)
- ✅ **delete card** — pressing Delete/Backspace on a selected node shows an
  Arabic confirmation dialog (`window.confirm`), then surgically removes the
  passage block (via `canvas-edit.deletePassage`)
- ✅ **rename propagation** — double-clicking a passage title opens an inline
  input. Renaming updates the `=== header ===` AND every reference: `->`,
  `~>`, `<-` targets, and dotted subsection prefixes (via
  `canvas-edit.renamePassage`)
- ✅ **undo** — all canvas edits go through `store.setSource()`, which
  triggers a CodeMirror dispatch that creates a history entry. Ctrl+Z works
  through CodeMirror's existing undo stack — no separate canvas undo needed.

## ✅ Playwright tests

Four new tests added to `tests/visual.spec.ts`:

- `canvas view loads without errors for the seeded fixture`
- `rename a passage — every reference updates and the story still compiles`
- `canvas round-trip preserves divert syntax and passage structure`
- `NO-CORRUPTION GUARD: comment, blank lines, and conditional survive canvas edit`

All 22 tests pass (18 original + 4 new). Run: `npm run test:visual -w @aqlamna/editor`

## Implementation files

- `packages/editor/src/lib/canvas-edit.ts` — surgical text edit functions
- `packages/editor/src/lib/canvas-parser.ts` — subsection nodes + thread edges
- `packages/editor/src/store.ts` — `cursorJump`, `requestCursorJump`, `clearCursorJump`
- `packages/editor/src/components/CanvasPane.tsx` — click, connect, double-click, delete handlers
- `packages/editor/src/components/PassageNode.tsx` — inline rename on double-click title
- `packages/editor/src/components/CodeEditorPane.tsx` — cursor jump response
- `packages/editor/tests/visual.spec.ts` — 4 new canvas interaction tests
- `packages/editor/playwright.config.ts` — clipboard permissions
