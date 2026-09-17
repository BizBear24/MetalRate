/**
 * Item photos, stored as compressed JPEG blobs in IndexedDB (keyed by item id).
 * localStorage is far too small for images; IndexedDB also works offline.
 */

const DB_NAME = 'goldcalc';
const STORE = 'photos';

type Listener = (itemId: string) => void;
const listeners = new Set<Listener>();
const urlCache = new Map<string, string>();
let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') return reject(new Error('Photos aren’t supported in this browser.'));
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('Couldn’t open photo storage.'));
  });
  dbPromise.catch(() => (dbPromise = null));
  return dbPromise;
}

async function run<T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    const req = fn(tx.objectStore(STORE));
    tx.oncomplete = () => resolve(req.result);
    tx.onerror = () => reject(tx.error ?? new Error('Photo storage error.'));
    tx.onabort = () => reject(tx.error ?? new Error('Photo storage is full.'));
  });
}

function invalidate(itemId: string) {
  const url = urlCache.get(itemId);
  if (url) URL.revokeObjectURL(url);
  urlCache.delete(itemId);
  listeners.forEach((l) => l(itemId));
}

export const photoStore = {
  subscribe(l: Listener): () => void {
    listeners.add(l);
    return () => listeners.delete(l);
  },

  async get(itemId: string): Promise<Blob | undefined> {
    return run<Blob | undefined>('readonly', (s) => s.get(itemId) as IDBRequest<Blob | undefined>);
  },

  /** Object URL for display; cached until the photo changes. */
  async url(itemId: string): Promise<string | undefined> {
    const cached = urlCache.get(itemId);
    if (cached) return cached;
    const blob = await this.get(itemId).catch(() => undefined);
    if (!blob) return undefined;
    const url = URL.createObjectURL(blob);
    urlCache.set(itemId, url);
    return url;
  },

  async put(itemId: string, blob: Blob): Promise<void> {
    await run('readwrite', (s) => s.put(blob, itemId));
    invalidate(itemId);
  },

  async remove(itemId: string): Promise<void> {
    await run('readwrite', (s) => s.delete(itemId)).catch(() => undefined);
    invalidate(itemId);
  },

  async clear(): Promise<void> {
    await run('readwrite', (s) => s.clear()).catch(() => undefined);
    [...urlCache.keys()].forEach(invalidate);
  },

  /** Reads a photo as a data: URL (used for printing, where object URLs may not load in time). */
  async dataUrl(itemId: string): Promise<string | undefined> {
    const blob = await this.get(itemId).catch(() => undefined);
    if (!blob) return undefined;
    return new Promise((resolve) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result as string);
      r.onerror = () => resolve(undefined);
      r.readAsDataURL(blob);
    });
  },
};
