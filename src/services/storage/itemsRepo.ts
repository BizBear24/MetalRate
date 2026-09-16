import type { Item, ItemDraft } from '@/types';
import { newId, readJSON, removeKey, writeJSON } from '@/lib/storage';
import { isValidPurity } from '@/features/calculator/purity';
import { DEMO_ITEMS } from './demoData';

const ITEMS_KEY = 'items';
const SEEDED_KEY = 'demo-seeded';

type Listener = () => void;
const listeners = new Set<Listener>();
let cache: Item[] | null = null;

function load(): Item[] {
  if (cache) return cache;
  cache = readJSON<Item[]>(ITEMS_KEY, []);
  if (!readJSON<boolean>(SEEDED_KEY, false) && import.meta.env.VITE_SEED_DEMO_DATA !== 'false') {
    const now = new Date().toISOString();
    const existing = new Set(cache.map((i) => i.barcode));
    const seeds = DEMO_ITEMS.filter((d) => !existing.has(d.barcode)).map<Item>((d) => ({
      ...d,
      id: newId(),
      isDemo: true,
      createdAt: now,
      updatedAt: now,
    }));
    cache = [...seeds, ...cache];
    writeJSON(ITEMS_KEY, cache);
    writeJSON(SEEDED_KEY, true);
  }
  return cache;
}

function commit(next: Item[]): void {
  cache = next;
  if (!writeJSON(ITEMS_KEY, next)) throw new Error('Could not save to this device’s storage.');
  listeners.forEach((l) => l());
}

export function normalizeBarcode(code: string): string {
  return code.trim();
}

export const itemsRepo = {
  subscribe(listener: Listener): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },

  all(): Item[] {
    return load();
  },

  get(id: string): Item | undefined {
    return load().find((i) => i.id === id);
  },

  findByBarcode(code: string): Item | undefined {
    const c = normalizeBarcode(code);
    return load().find((i) => i.barcode === c);
  },

  /** Creates or updates. Throws with a user-facing message on conflict. */
  save(draft: ItemDraft, id?: string): Item {
    const items = load();
    const barcode = normalizeBarcode(draft.barcode);
    const clash = items.find((i) => i.barcode === barcode && i.id !== id);
    if (clash) throw new Error(`Barcode already saved as “${clash.name || 'another item'}”.`);

    const now = new Date().toISOString();
    const clean = {
      barcode,
      name: draft.name?.trim() || undefined,
      metal: draft.metal,
      purity: draft.purity,
      weightGrams: Math.round(draft.weightGrams * 1000) / 1000,
    };

    if (id) {
      const existing = items.find((i) => i.id === id);
      if (!existing) throw new Error('This item no longer exists.');
      const updated: Item = { ...existing, ...clean, isDemo: existing.isDemo, updatedAt: now };
      commit(items.map((i) => (i.id === id ? updated : i)));
      return updated;
    }
    const created: Item = { ...clean, id: newId(), createdAt: now, updatedAt: now };
    commit([created, ...items]);
    return created;
  },

  remove(id: string): void {
    commit(load().filter((i) => i.id !== id));
  },

  removeDemo(): number {
    const items = load();
    const kept = items.filter((i) => !i.isDemo);
    commit(kept);
    return items.length - kept.length;
  },

  clearAll(): void {
    commit([]);
  },

  export(): string {
    return JSON.stringify({ app: 'GoldCalc', version: 1, exportedAt: new Date().toISOString(), items: load() }, null, 2);
  },

  /** How many of these barcodes already exist (for import previews). */
  countExisting(barcodes: string[]): number {
    const existing = new Set(load().map((i) => i.barcode));
    return barcodes.filter((b) => existing.has(normalizeBarcode(b))).length;
  },

  /** Bulk add-or-update by barcode (spreadsheet import). Drafts must already be validated. */
  upsertMany(drafts: ItemDraft[]): { added: number; updated: number } {
    const byBarcode = new Map(load().map((i) => [i.barcode, i]));
    const now = new Date().toISOString();
    const freshIds = new Set<string>();
    let updated = 0;
    for (const d of drafts) {
      const barcode = normalizeBarcode(d.barcode);
      const prev = byBarcode.get(barcode);
      const id = prev?.id ?? newId();
      if (!prev) freshIds.add(id);
      else updated++;
      byBarcode.set(barcode, {
        id,
        barcode,
        name: d.name?.trim() || undefined,
        metal: d.metal,
        purity: d.purity,
        weightGrams: Math.round(d.weightGrams * 1000) / 1000,
        createdAt: prev?.createdAt ?? now,
        updatedAt: now,
      });
    }
    // Newly added rows first, like manual adds.
    const all = [...byBarcode.values()];
    commit([...all.filter((i) => freshIds.has(i.id)), ...all.filter((i) => !freshIds.has(i.id))]);
    return { added: freshIds.size, updated };
  },

  /** Merges by barcode (imported rows win). Returns counts. */
  import(json: string): { added: number; updated: number; skipped: number } {
    let parsed: unknown;
    try {
      parsed = JSON.parse(json);
    } catch {
      throw new Error('That file isn’t valid JSON.');
    }
    const rows = Array.isArray(parsed) ? parsed : (parsed as { items?: unknown })?.items;
    if (!Array.isArray(rows)) throw new Error('No items found in this file.');

    const byBarcode = new Map(load().map((i) => [i.barcode, i]));
    let added = 0;
    let updated = 0;
    let skipped = 0;
    const now = new Date().toISOString();

    for (const r of rows as Partial<Item>[]) {
      const barcode = typeof r.barcode === 'string' ? normalizeBarcode(r.barcode) : '';
      const weight = Number(r.weightGrams);
      if (
        !barcode ||
        (r.metal !== 'gold' && r.metal !== 'silver') ||
        typeof r.purity !== 'string' ||
        !isValidPurity(r.metal, r.purity) ||
        !(weight > 0)
      ) {
        skipped++;
        continue;
      }
      const prev = byBarcode.get(barcode);
      byBarcode.set(barcode, {
        id: prev?.id ?? newId(),
        barcode,
        name: typeof r.name === 'string' && r.name.trim() ? r.name.trim() : undefined,
        metal: r.metal,
        purity: r.purity,
        weightGrams: weight,
        isDemo: r.isDemo === true || undefined,
        createdAt: prev?.createdAt ?? (typeof r.createdAt === 'string' ? r.createdAt : now),
        updatedAt: now,
      });
      if (prev) updated++;
      else added++;
    }
    commit([...byBarcode.values()]);
    return { added, updated, skipped };
  },

  /** Wipes items and allows demo data to be re-seeded on next load. */
  resetStorage(): void {
    removeKey(ITEMS_KEY);
    removeKey(SEEDED_KEY);
    cache = null;
    listeners.forEach((l) => l());
  },
};
