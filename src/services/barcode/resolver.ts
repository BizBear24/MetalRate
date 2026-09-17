import type { BarcodeSettings, Item, Resolution } from '@/types';
import { normalizeCharges } from '@/features/calculator/calculate';
import { parseBarcode } from './parser';

export interface ItemLookup {
  findByBarcode(code: string): Item | undefined;
}

/**
 * Scanned code → item.
 *   1. Weight encoded in the code itself (text format)
 *   2. Weight-embedded numeric code; metal/purity from the item saved under its item code
 *   3. Local item database by exact barcode
 *   4. Not found
 * Fixed charges (making / stone / diamond) always come from the matching saved item.
 */
export function resolveBarcode(raw: string, settings: BarcodeSettings, db: ItemLookup): Resolution {
  const barcode = raw.trim();
  const parsed = parseBarcode(barcode, settings);
  const saved = db.findByBarcode(barcode);

  if (parsed?.kind === 'encoded') {
    return {
      status: 'found',
      item: {
        barcode,
        name: saved?.name,
        ...(saved ? normalizeCharges(saved) : {}),
        metal: parsed.metal,
        purity: parsed.purity,
        weightGrams: parsed.weightGrams,
        source: 'encoded',
        itemId: saved?.id,
        hasPhoto: saved?.hasPhoto,
      },
    };
  }

  if (parsed?.kind === 'weight-embedded') {
    const base = db.findByBarcode(parsed.itemCode);
    if (base) {
      return {
        status: 'found',
        item: {
          barcode,
          name: base.name,
          ...normalizeCharges(base),
          metal: base.metal,
          purity: base.purity,
          weightGrams: parsed.weightGrams,
          source: 'weight-embedded',
          itemId: base.id,
          hasPhoto: base.hasPhoto,
        },
      };
    }
    return {
      status: 'not-found',
      barcode: parsed.itemCode,
      scannedCode: barcode,
      hint: { barcode: parsed.itemCode, weightGrams: parsed.weightGrams },
    };
  }

  if (saved) {
    return {
      status: 'found',
      item: {
        barcode,
        name: saved.name,
        ...normalizeCharges(saved),
        metal: saved.metal,
        purity: saved.purity,
        weightGrams: saved.weightGrams,
        source: 'database',
        itemId: saved.id,
        hasPhoto: saved.hasPhoto,
      },
    };
  }

  return { status: 'not-found', barcode, hint: { barcode } };
}
