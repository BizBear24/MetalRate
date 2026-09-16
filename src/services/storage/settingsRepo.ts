import type { AppSettings } from '@/types';
import { readJSON, writeJSON } from '@/lib/storage';

const KEY = 'settings';

export const DEFAULT_SETTINGS: AppSettings = {
  theme: 'dark',
  priceProviderId: 'gold-api',
  marketAdjustmentPct: 0,
  barcode: {
    encoded: { enabled: true, separator: '-' },
    numeric: {
      enabled: false,
      prefix: '29',
      itemCodeLength: 5,
      weightLength: 5,
      weightDecimals: 2,
      hasCheckDigit: true,
    },
  },
};

export function loadSettings(): AppSettings {
  const s = readJSON<Partial<AppSettings>>(KEY, {});
  return {
    ...DEFAULT_SETTINGS,
    ...s,
    barcode: {
      encoded: { ...DEFAULT_SETTINGS.barcode.encoded, ...s.barcode?.encoded },
      numeric: { ...DEFAULT_SETTINGS.barcode.numeric, ...s.barcode?.numeric },
    },
  };
}

export function saveSettings(settings: AppSettings): void {
  writeJSON(KEY, settings);
}
