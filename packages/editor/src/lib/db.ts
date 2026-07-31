// ---------------------------------------------------------------------------
// IndexedDB persistence — saves/loads the editor source text.
//
// ONE DATABASE, ONE VERSION, ONE OPENER. `canvas-db.ts` and `image-db.ts` both
// import `openEditorDB` from here; none of them may call `indexedDB.open`
// itself, and there is no second version number anywhere.
//
// It was three openers on one database name and they disagreed:
//
//   db.ts        indexedDB.open("aqlamna-editor", 3)
//   canvas-db.ts indexedDB.open("aqlamna-editor", 2)
//   image-db.ts  indexedDB.open("aqlamna-editor")     // no version at all
//
// store.ts calls getViewMode() at MODULE level, so canvas-db won the race on a
// fresh profile, created the database at v2 and kept its connection open. App
// then mounted, called loadSource(), and asked for v3 — an upgrade, blocked by
// that live v2 connection. `onblocked` had no handler, so the request never
// fired an event, and IndexedDB queues everything behind a pending version
// change: EVERY later open in the tab hung too, forever.
//
// Measured on a clean profile, on the deployed build: `indexedDB.databases()`
// reported version 2, and both a versioned and an unversioned open sat 4s
// without firing success, error, blocked OR upgradeneeded. So the source text
// was never restored (the editor opens blank every time — nothing you write is
// kept), the canvas sat on "جاري تحميل المخطّط..." forever, and no image could
// be read or written. No console error, no rejected promise, nothing to see:
// three promises that simply never settle.
//
// Found because the visual suite was reconnected to `npm test`. It is the bug
// those tests are for.
// ---------------------------------------------------------------------------

const DB_NAME = "aqlamna-editor";

/**
 * The ONLY version number for this database.
 * v1 "projects" · v2 adds "canvas" · v3 adds "images".
 * Bumping it means adding the new store to `upgrade()` below and nowhere else.
 */
const DB_VERSION = 3;

const STORES = ["projects", "canvas", "images"] as const;

const STORE_NAME = "projects";

/**
 * Open the editor database. Every store lives in one schema, created together,
 * so no caller can ever be the one that opens it at the wrong version.
 */
export function openEditorDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      for (const store of STORES) {
        if (!req.result.objectStoreNames.contains(store)) {
          req.result.createObjectStore(store);
        }
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    // A blocked upgrade fires no success and no error. Left unhandled it is an
    // unsettled promise — a hang that looks exactly like a slow disk. Say so.
    req.onblocked = () =>
      reject(
        new Error(
          "IndexedDB upgrade blocked: another tab has aqlamna-editor open at an " +
            "older version. Close the other tabs and reload.",
        ),
      );
  });
}

const SOURCE_KEY = "current-source";

export async function saveSource(source: string): Promise<void> {
  const db = await openEditorDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).put(source, SOURCE_KEY);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function loadSource(): Promise<string | null> {
  const db = await openEditorDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const req = tx.objectStore(STORE_NAME).get(SOURCE_KEY);
    req.onsuccess = () => resolve((req.result as string) ?? null);
    req.onerror = () => reject(req.error);
  });
}
