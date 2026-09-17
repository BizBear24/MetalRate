import { useMemo } from 'react';
import type { Resolution } from '@/types';
import { resolveBarcode } from '@/services/barcode/resolver';
import { itemsRepo } from '@/services/storage/itemsRepo';
import { useItems } from '@/hooks/useItems';
import { useSettings } from '@/hooks/useSettings';
import { useMetalPrice } from '@/features/pricing/usePrices';
import { valuate } from './calculate';

/** Resolves a code and values it against the current price; re-runs when items, settings or prices change. */
export function useValuation(code: string) {
  const { settings } = useSettings();
  const items = useItems();
  const resolution = useMemo<Resolution>(
    () => resolveBarcode(code, settings.barcode, itemsRepo),
    // `items` changes identity whenever the database changes.
    [code, settings.barcode, items],
  );
  const item = resolution.status === 'found' ? resolution.item : null;
  const price = useMetalPrice(item?.metal ?? 'gold');
  const valuation = useMemo(
    () =>
      item && price.price
        ? valuate(price.price.pricePerGramINR, item.purity, item.weightGrams, settings.marketAdjustmentPct, item)
        : null,
    [item, price.price, settings.marketAdjustmentPct],
  );
  return { resolution, item, price, valuation, adjustmentPct: settings.marketAdjustmentPct };
}
