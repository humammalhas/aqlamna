// ---------------------------------------------------------------------------
// Image storage — IndexedDB keyed by project + image name.
// Downscales to 768px long side, encodes to WebP, discards the original.
// ---------------------------------------------------------------------------

const DB_NAME = "aqlamna-editor";
const STORE_NAME = "images";

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export interface StoredImage {
  /** The WebP data URL (data:image/webp;base64,...). */
  dataUrl: string;
  width: number;
  height: number;
  bytes: number;
  generatedAt: number;
}

function imageKey(projectId: string, imageName: string): string {
  return `${projectId}:${imageName}`;
}

// ---- Public API ------------------------------------------------------------

export async function saveImage(
  projectId: string,
  imageName: string,
  dataUrl: string,
): Promise<StoredImage> {
  const processed = await downscaleToWebP(dataUrl);
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).put(processed, imageKey(projectId, imageName));
    tx.oncomplete = () => resolve(processed);
    tx.onerror = () => reject(tx.error);
  });
}

export async function loadImage(
  projectId: string,
  imageName: string,
): Promise<StoredImage | null> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const req = tx.objectStore(STORE_NAME).get(imageKey(projectId, imageName));
    req.onsuccess = () => resolve((req.result as StoredImage) ?? null);
    req.onerror = () => reject(req.error);
  });
}

export async function deleteImage(
  projectId: string,
  imageName: string,
): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).delete(imageKey(projectId, imageName));
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/** List all image names stored for a given project. */
export async function listImageNames(projectId: string): Promise<string[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const req = tx.objectStore(STORE_NAME).getAllKeys();
    const prefix = `${projectId}:`;
    req.onsuccess = () => {
      const keys = (req.result as string[]).filter((k) => k.startsWith(prefix));
      resolve(keys.map((k) => k.slice(prefix.length)));
    };
    req.onerror = () => reject(req.error);
  });
}

// ---- Processing ------------------------------------------------------------

const MAX_DIM = 768;

/**
 * Load an image from a data URL, downscale to MAX_DIM on the long side,
 * and re-encode as WebP at quality 0.85. Returns the new data URL + dimensions.
 */
function downscaleToWebP(dataUrl: string): Promise<StoredImage> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      let { width, height } = img;
      const longSide = Math.max(width, height);
      if (longSide > MAX_DIM) {
        const scale = MAX_DIM / longSide;
        width = Math.round(width * scale);
        height = Math.round(height * scale);
      }

      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(img, 0, 0, width, height);

      canvas.toBlob(
        (blob) => {
          if (!blob) {
            reject(new Error("فشل ترميز الصورة إلى WebP."));
            return;
          }
          const reader = new FileReader();
          reader.onload = () => {
            const webpUrl = reader.result as string;
            resolve({
              dataUrl: webpUrl,
              width,
              height,
              bytes: blob.size,
              generatedAt: Date.now(),
            });
          };
          reader.onerror = () => reject(new Error("فشل قراءة الصورة."));
          reader.readAsDataURL(blob);
        },
        "image/webp",
        0.85,
      );
    };
    img.onerror = () => reject(new Error("فشل تحميل الصورة."));
    img.src = dataUrl;
  });
}

/**
 * Convert a stored image to the compiled output format
 * (`data:image/webp;base64,...` for the story JSON `data` field).
 */
export function toImageAsset(stored: StoredImage): string {
  return stored.dataUrl;
}

// ---- Budget -----------------------------------------------------------------

const BUDGET_WARN = 1_000_000;
const BUDGET_MAX = 2_000_000;

export interface BudgetStatus {
  totalBytes: number;
  isWarning: boolean;
  isBlocked: boolean;
  largest: Array<{ name: string; bytes: number }>;
}

export function formatBytes(bytes: number): string {
  if (bytes < 100_000) return `${Math.round(bytes / 1_000)} ك.ب`;
  return `${(bytes / 1_000_000).toFixed(1)} م.ب`;
}

export function formatBudget(used: number): string {
  return `${formatBytes(used)} / ${formatBytes(BUDGET_MAX)}`;
}

/** Sum the bytes of all stored images for a project. */
export async function getBudgetStatus(projectId: string): Promise<BudgetStatus> {
  const names = await listImageNames(projectId);
  const items: Array<{ name: string; bytes: number }> = [];

  for (const name of names) {
    const stored = await loadImage(projectId, name);
    if (stored) {
      items.push({ name, bytes: stored.bytes });
    }
  }

  items.sort((a, b) => b.bytes - a.bytes);
  const totalBytes = items.reduce((sum, i) => sum + i.bytes, 0);

  return {
    totalBytes,
    isWarning: totalBytes >= BUDGET_WARN,
    isBlocked: totalBytes >= BUDGET_MAX,
    largest: items.slice(0, 5),
  };
}
