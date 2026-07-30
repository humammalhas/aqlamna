// ---------------------------------------------------------------------------
// Canvas IndexedDB — stores node positions and view mode.
// Separate from the source-text DB so positions never leak into .qalam files.
// ---------------------------------------------------------------------------

const DB_NAME = "aqlamna-editor";
const DB_VERSION = 2; // v1 had "projects" store, v2 adds "canvas"
const STORE_NAME = "canvas";

/** View mode persisted across sessions. */
export type ViewMode = "text" | "canvas" | "split";

const VIEW_MODE_KEY = "view-mode";

// ---- Open DB with store migration ------------------------------------------

function openCanvasStore(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      // Create "projects" store if not exists (v1)
      if (!db.objectStoreNames.contains("projects")) {
        db.createObjectStore("projects");
      }
      // Create "canvas" store for our data (v2)
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

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
