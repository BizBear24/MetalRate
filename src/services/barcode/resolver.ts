import type { BarcodeSettings, Item, Resolution } from '@/types';
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
        metal: parsed.metal,
        purity: parsed.purity,
        weightGrams: parsed.weightGrams,
        source: 'encoded',
        itemId: saved?.id,
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
          metal: base.metal,
          purity: base.purity,
          weightGrams: parsed.weightGrams,
          source: 'weight-embedded',
          itemId: base.id,
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
        metal: saved.metal,
        purity: saved.purity,
        weightGrams: saved.weightGrams,
        source: 'database',
        itemId: saved.id,
      },
    };
  }

  return { status: 'not-found', barcode, hint: { barcode } };
}
