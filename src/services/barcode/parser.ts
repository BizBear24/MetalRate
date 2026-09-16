import type { BarcodeSettings, Metal, Purity } from '@/types';
import { normalizePurity } from '@/features/calculator/purity';

export interface EncodedPayload {
  kind: 'encoded';
  metal: Metal;
  purity: Purity;
  itemId: string;
  weightGrams: number;
}

export interface WeightEmbeddedPayload {
  kind: 'weight-embedded';
  itemCode: string;
  weightGrams: number;
}

export type ParsedBarcode = EncodedPayload | WeightEmbeddedPayload;

const METAL_ALIASES: Record<string, Metal> = {
  GOLD: 'gold', AU: 'gold', G: 'gold',
  SILVER: 'silver', AG: 'silver', S: 'silver',
};

/**
 * Text format: METAL<sep>PURITY<sep>ITEMID<sep>WEIGHT
 *   GOLD-24-000125-8.42    SILVER-925-A17-31.10    AU-22K-77-4.2
 */
export function parseEncoded(raw: string, cfg: BarcodeSettings['encoded']): EncodedPayload | null {
  if (!cfg.enabled || !cfg.separator) return null;
  const parts = raw.trim().split(cfg.separator);
  if (parts.length !== 4) return null;
  const [metalRaw, purityRaw, itemId, weightRaw] = parts as [string, string, string, string];

  const metal = METAL_ALIASES[metalRaw.trim().toUpperCase()];
  if (!metal) return null;
  const purity = normalizePurity(metal, purityRaw);
  if (!purity) return null;
  if (!/^\d+(\.\d+)?$/.test(weightRaw.trim())) return null;
  const weightGrams = Number(weightRaw);
  if (!(weightGrams > 0) || !itemId.trim()) return null;

  return { kind: 'encoded', metal, purity, itemId: itemId.trim(), weightGrams };
}

/**
 * Numeric variable-measure format: PREFIX + ITEMCODE + WEIGHT [+ CHECK]
 * With prefix "29", 5-digit item code and 5-digit weight at 2 decimals:
 *   29 00125 00842 7  →  item 00125, 8.42 g
 */
export function parseWeightEmbedded(
  raw: string,
  cfg: BarcodeSettings['numeric'],
): WeightEmbeddedPayload | null {
  if (!cfg.enabled) return null;
  const code = raw.trim();
  const expected =
    cfg.prefix.length + cfg.itemCodeLength + cfg.weightLength + (cfg.hasCheckDigit ? 1 : 0);
  if (!/^\d+$/.test(code) || code.length !== expected || !code.startsWith(cfg.prefix)) return null;
  if (cfg.hasCheckDigit && code.length === 13 && !isValidEan13(code)) return null;

  let i = cfg.prefix.length;
  const itemCode = code.slice(i, (i += cfg.itemCodeLength));
  const weightDigits = code.slice(i, i + cfg.weightLength);
  const weightGrams = Number(weightDigits) / 10 ** cfg.weightDecimals;
  if (!(weightGrams > 0)) return null;
  return { kind: 'weight-embedded', itemCode, weightGrams };
}

export function isValidEan13(code: string): boolean {
  if (!/^\d{13}$/.test(code)) return false;
  const digits = [...code].map(Number);
  const sum = digits.slice(0, 12).reduce((acc, d, idx) => acc + d * (idx % 2 ? 3 : 1), 0);
  return (10 - (sum % 10)) % 10 === digits[12];
}

export function parseBarcode(raw: string, settings: BarcodeSettings): ParsedBarcode | null {
  return parseEncoded(raw, settings.encoded) ?? parseWeightEmbedded(raw, settings.numeric);
}
