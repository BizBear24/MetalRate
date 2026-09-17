export type Metal = 'gold' | 'silver';

export type GoldPurity = '24K' | '22K' | '18K' | '14K';
export type SilverPurity = '999' | '925';
export type Purity = GoldPurity | SilverPurity;

/**
 * Fixed rupee amounts added on top of the metal value. They don't change with the
 * metal rate. Omitted (or 0) when a charge doesn't apply to the item.
 */
export interface ItemCharges {
  makingCharges?: number;
  stoneCharges?: number;
  diamondCharges?: number;
}

export const CHARGE_FIELDS = ['makingCharges', 'stoneCharges', 'diamondCharges'] as const;
export type ChargeField = (typeof CHARGE_FIELDS)[number];

export interface Item extends ItemCharges {
  id: string;
  barcode: string;
  name?: string;
  metal: Metal;
  purity: Purity;
  weightGrams: number;
  /** Seeded development data — removable from Settings. */
  isDemo?: boolean;
  createdAt: string;
  updatedAt: string;
}

export type ItemDraft = Pick<Item, 'barcode' | 'name' | 'metal' | 'purity' | 'weightGrams'> & ItemCharges;

/** Price of the pure metal (24K gold / fine silver) in INR per gram. */
export interface MetalPrice {
  metal: Metal;
  pricePerGramINR: number;
  source: string;
  /** When the market quote was published by the provider. */
  timestamp: string;
  /** When GoldCalc fetched it. */
  fetchedAt: string;
  isLive: boolean;
}

export type PriceStatus =
  /** Fetched successfully and the quote is fresh. */
  | 'live'
  /** Fetched successfully but the market quote is old (e.g. market closed). */
  | 'delayed'
  /** Network/API failed; showing the last cached price. */
  | 'offline'
  | 'loading'
  /** No price has ever been fetched and the network failed. */
  | 'unavailable';

/** How a scanned code was resolved to an item. */
export type ResolutionSource = 'encoded' | 'weight-embedded' | 'database';

export interface ResolvedItem extends ItemCharges {
  barcode: string;
  name?: string;
  metal: Metal;
  purity: Purity;
  weightGrams: number;
  source: ResolutionSource;
  /** Local database item, when one matched. */
  itemId?: string;
}

export type Resolution =
  | { status: 'found'; item: ResolvedItem }
  | {
      status: 'not-found';
      barcode: string;
      /** The full code as scanned, when it differs from `barcode` (weight-embedded codes). */
      scannedCode?: string;
      /** Partial data recovered from the code (e.g. weight from a weight-embedded code). */
      hint?: Partial<ItemDraft>;
    };

export type ThemePreference = 'dark' | 'light' | 'system';

export interface BarcodeSettings {
  /** Text format METAL<sep>PURITY<sep>ITEMID<sep>WEIGHT, e.g. GOLD-22-000125-8.42 */
  encoded: {
    enabled: boolean;
    separator: string;
  };
  /**
   * Numeric weight-embedded codes (like in-store EAN-13 "variable measure"):
   * PREFIX + ITEM CODE + WEIGHT (+ optional check digit).
   * Metal and purity come from the local item whose barcode equals the item code.
   */
  numeric: {
    enabled: boolean;
    prefix: string;
    itemCodeLength: number;
    weightLength: number;
    weightDecimals: number;
    hasCheckDigit: boolean;
  };
}

export interface AppSettings {
  theme: ThemePreference;
  priceProviderId: string;
  /**
   * Optional % added to the converted international spot price to approximate the
   * Indian domestic rate (import duty etc.). 0 = pure spot conversion.
   */
  marketAdjustmentPct: number;
  barcode: BarcodeSettings;
}
