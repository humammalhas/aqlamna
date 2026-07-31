// ---------------------------------------------------------------------------
// IndexedDB persistence — saves/loads the editor source text.
// ---------------------------------------------------------------------------

const DB_NAME = "aqlamna-editor";
const DB_VERSION = 3; // v1 had "projects", v2 adds "canvas", v3 adds "images"
const STORE_NAME = "projects";

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
  req.onupgradeneeded = () => {
    if (!req.result.objectStoreNames.contains(STORE_NAME)) {
      req.result.createObjectStore(STORE_NAME);
    }
    if (!req.result.objectStoreNames.contains("canvas")) {
      req.result.createObjectStore("canvas");
    }
    if (!req.result.objectStoreNames.contains("images")) {
      req.result.createObjectStore("images");
    }
  };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

const SOURCE_KEY = "current-source";

export async function saveSource(source: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).put(source, SOURCE_KEY);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function loadSource(): Promise<string | null> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const req = tx.objectStore(STORE_NAME).get(SOURCE_KEY);
    req.onsuccess = () => resolve((req.result as string) ?? null);
    req.onerror = () => reject(req.error);
  });
}
