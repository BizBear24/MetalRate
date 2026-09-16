import { describe, expect, it } from 'vitest';
import type { BarcodeSettings, Item } from '@/types';
import { parseEncoded, parseWeightEmbedded, isValidEan13 } from '@/services/barcode/parser';
import { resolveBarcode } from '@/services/barcode/resolver';
import { valuate, purityRate } from '@/features/calculator/calculate';
import { marketToPerGram, GRAMS_PER_TROY_OUNCE, toPerGram } from '@/services/price/conversion';
import { priceStatus } from '@/services/price/priceService';
import { formatINR, formatRate, timeAgo } from '@/lib/format';

const settings: BarcodeSettings = {
  encoded: { enabled: true, separator: '-' },
  numeric: { enabled: true, prefix: '29', itemCodeLength: 5, weightLength: 5, weightDecimals: 2, hasCheckDigit: true },
};

function ean13(first12: string) {
  const sum = [...first12].reduce((a, d, i) => a + Number(d) * (i % 2 ? 3 : 1), 0);
  return first12 + ((10 - (sum % 10)) % 10);
}

const item = (over: Partial<Item>): Item => ({
  id: 'x',
  barcode: '890000000001',
  metal: 'gold',
  purity: '22K',
  weightGrams: 8.42,
  createdAt: '',
  updatedAt: '',
  ...over,
});

describe('encoded barcodes', () => {
  it('parses GOLD-24-000125-8.42', () => {
    expect(parseEncoded('GOLD-24-000125-8.42', settings.encoded)).toEqual({
      kind: 'encoded', metal: 'gold', purity: '24K', itemId: '000125', weightGrams: 8.42,
    });
  });
  it('accepts silver and karat aliases', () => {
    expect(parseEncoded('SILVER-925-A1-31.10', settings.encoded)?.purity).toBe('925');
    expect(parseEncoded('au-916-7-4.2', settings.encoded)?.purity).toBe('22K');
  });
  it('rejects bad data', () => {
    expect(parseEncoded('GOLD-21-1-8', settings.encoded)).toBeNull();
    expect(parseEncoded('GOLD-22-1-0', settings.encoded)).toBeNull();
    expect(parseEncoded('GOLD-22-1-abc', settings.encoded)).toBeNull();
    expect(parseEncoded('PLATINUM-22-1-2', settings.encoded)).toBeNull();
    expect(parseEncoded('890000000001', settings.encoded)).toBeNull();
  });
});

describe('weight-embedded barcodes', () => {
  const code = ean13('290012500842');
  it('validates the check digit', () => {
    expect(isValidEan13(code)).toBe(true);
    expect(parseWeightEmbedded(code.slice(0, 12) + ((Number(code[12]) + 1) % 10), settings.numeric)).toBeNull();
  });
  it('extracts item code and weight', () => {
    expect(parseWeightEmbedded(code, settings.numeric)).toEqual({ kind: 'weight-embedded', itemCode: '00125', weightGrams: 8.42 });
  });
  it('is ignored when disabled', () => {
    expect(parseWeightEmbedded(code, { ...settings.numeric, enabled: false })).toBeNull();
  });
});

describe('resolver', () => {
  const db = (items: Item[]) => ({ findByBarcode: (c: string) => items.find((i) => i.barcode === c) });

  it('uses weight from encoded code', () => {
    const r = resolveBarcode('GOLD-18-9-2.5', settings, db([]));
    expect(r).toMatchObject({ status: 'found', item: { metal: 'gold', purity: '18K', weightGrams: 2.5, source: 'encoded' } });
  });
  it('looks up ordinary barcodes locally', () => {
    const r = resolveBarcode(' 890000000001 ', settings, db([item({})]));
    expect(r).toMatchObject({ status: 'found', item: { weightGrams: 8.42, source: 'database', itemId: 'x' } });
  });
  it('combines embedded weight with the saved item code', () => {
    const r = resolveBarcode(ean13('290012501000'), settings, db([item({ barcode: '00125', metal: 'silver', purity: '925', weightGrams: 1 })]));
    expect(r).toMatchObject({ status: 'found', item: { metal: 'silver', purity: '925', weightGrams: 10, source: 'weight-embedded' } });
  });
  it('reports not found with hints', () => {
    expect(resolveBarcode('8901234567890', settings, db([]))).toEqual({
      status: 'not-found', barcode: '8901234567890', hint: { barcode: '8901234567890' },
    });
    const code = ean13('290012500842');
    expect(resolveBarcode(code, settings, db([]))).toMatchObject({
      status: 'not-found', barcode: '00125', scannedCode: code, hint: { weightGrams: 8.42 },
    });
  });
});

describe('pricing', () => {
  it('converts USD/troy oz to INR/g', () => {
    expect(marketToPerGram(GRAMS_PER_TROY_OUNCE, 'troy_ounce', 90)).toBeCloseTo(90);
    expect(toPerGram(1000, 'kilogram')).toBe(1);
  });
  it('applies purity factors', () => {
    expect(purityRate(12000, '24K')).toBe(12000);
    expect(purityRate(12000, '22K')).toBe(11000);
    expect(purityRate(12000, '18K')).toBe(9000);
    expect(purityRate(12000, '14K')).toBe(7000);
    expect(purityRate(100, '999')).toBe(99.9);
    expect(purityRate(195.318, '999')).toBe(195.12);
    expect(purityRate(1000, '925')).toBe(925);
    expect(purityRate(10000, '24K', 6)).toBe(10600);
  });
  it('matches the spec example: 8.42 g × ₹10,500 = ₹88,410', () => {
    const v = valuate(10500 * (24 / 22), '22K', 8.42);
    expect(v.ratePerGram).toBe(10500);
    expect(v.value).toBe(88410);
  });
  it('never calls stale or failed prices live', () => {
    const now = Date.now();
    const p = { metal: 'gold' as const, pricePerGramINR: 1, source: 's', isLive: true, timestamp: new Date(now).toISOString(), fetchedAt: new Date(now).toISOString() };
    const base = { failed: false, loading: false, fromCache: false, now };
    expect(priceStatus(p, base)).toBe('live');
    expect(priceStatus(p, { ...base, failed: true })).toBe('offline');
    expect(priceStatus(p, { ...base, fromCache: true })).toBe('offline');
    expect(priceStatus(p, { ...base, now: now + 10 * 60_000 })).toBe('delayed');
    expect(priceStatus({ ...p, isLive: false }, base)).toBe('delayed');
    expect(priceStatus(undefined, { ...base, failed: true })).toBe('unavailable');
  });
});

describe('formatting', () => {
  it('uses Indian digit grouping', () => {
    expect(formatINR(125430)).toBe('₹1,25,430');
    expect(formatINR(88410)).toBe('₹88,410');
    expect(formatRate(195.1)).toBe('₹195.10');
    expect(formatRate(12087.6)).toBe('₹12,088');
  });
  it('formats relative time', () => {
    const now = Date.now();
    expect(timeAgo(new Date(now - 42_000).toISOString(), now)).toBe('42 sec ago');
    expect(timeAgo(new Date(now - 12 * 60_000).toISOString(), now)).toBe('12 min ago');
  });
});
