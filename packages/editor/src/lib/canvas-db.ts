// ---------------------------------------------------------------------------
// Canvas IndexedDB — stores node positions and view mode.
// Separate from the source-text DB so positions never leak into .qalam files.
// ---------------------------------------------------------------------------

import { openEditorDB } from "./db.js";

const STORE_NAME = "canvas";

/** View mode persisted across sessions. */
export type ViewMode = "text" | "canvas" | "split";

const VIEW_MODE_KEY = "view-mode";

// ---- Open DB ---------------------------------------------------------------
//
// This file used to carry its own `indexedDB.open("aqlamna-editor", 2)` while
// db.ts asked for 3. store.ts calls getViewMode() at module level, so THIS
// opener won the race, created the database at v2 and held the connection —
// which blocked db.ts's upgrade and deadlocked every IndexedDB call in the tab.
// See the header of db.ts. There is one opener now and one version number.

const openCanvasStore = openEditorDB;

// ---- View mode -------------------------------------------------------------

export async function getViewMode(): Promise<ViewMode> {
  const db = await openCanvasStore();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const req = tx.objectStore(STORE_NAME).get(VIEW_MODE_KEY);
    req.onsuccess = () => resolve((req.result as ViewMode) ?? "text");
    req.onerror = () => reject(req.error);
  });
}

export async function setViewMode(mode: ViewMode): Promise<void> {
  const db = await openCanvasStore();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).put(mode, VIEW_MODE_KEY);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

// ---- Node positions --------------------------------------------------------

export interface NodePosition {
  x: number;
  y: number;
}

/**
 * Get saved positions for all known nodes. Returns a map of node id → position.
 */
export async function getNodePositions(): Promise<Record<string, NodePosition>> {
  const db = await openCanvasStore();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const req = tx.objectStore(STORE_NAME).get("positions");
    req.onsuccess = () => resolve((req.result as Record<string, NodePosition>) ?? {});
    req.onerror = () => reject(req.error);
  });
}

/**
 * Save all node positions at once.
 */
export async function saveAllPositions(
  positions: Record<string, NodePosition>,
): Promise<void> {
  const db = await openCanvasStore();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).put(positions, "positions");
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
