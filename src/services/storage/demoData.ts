import type { ItemDraft } from '@/types';

/**
 * Development demo items. Seeded once on first launch when VITE_SEED_DEMO_DATA
 * isn't "false"; removable any time from Settings → Data.
 */
export const DEMO_ITEMS: readonly ItemDraft[] = [
  { barcode: '890000000001', name: 'Demo Gold Ring', metal: 'gold', purity: '22K', weightGrams: 8.42, makingCharges: 2500 },
  {
    barcode: '890000000002',
    name: 'Demo Gold Necklace',
    metal: 'gold',
    purity: '22K',
    weightGrams: 24.75,
    makingCharges: 6000,
    stoneCharges: 1500,
  },
  { barcode: '890000000003', name: 'Demo Silver Coin', metal: 'silver', purity: '999', weightGrams: 31.1 },
];
