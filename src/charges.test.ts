import { describe, expect, it } from 'vitest';
import writeXlsxFile from 'write-excel-file/node';
import readXlsxFile from 'read-excel-file/node';
import type { BarcodeSettings, Item } from '@/types';
import { normalizeCharge, valuate } from '@/features/calculator/calculate';
import { parseRupees } from '@/lib/money';
import { resolveBarcode } from '@/services/barcode/resolver';
import { parseInventoryRows, type RawCell } from '@/services/storage/inventorySheet';

describe('fixed charges on top of metal value', () => {
  it('adds only the charges that apply', () => {
    // 8.42 g × ₹10,500 = ₹88,410, then + making + diamond (no stone).
    const v = valuate(10500 * (24 / 22), '22K', 8.42, 0, { makingCharges: 2500, diamondCharges: 45000 });
    expect(v.value).toBe(88410);
    expect(v.charges.map((c) => [c.label, c.amount])).toEqual([
      ['Making charges', 2500],
      ['Diamond charges', 45000],
    ]);
    expect(v.chargesTotal).toBe(47500);
    expect(v.total).toBe(135910);
  });

  it('total equals metal value when nothing applies', () => {
    const v = valuate(12000, '24K', 1, 0, { makingCharges: undefined, stoneCharges: 0 });
    expect(v.charges).toEqual([]);
    expect(v.total).toBe(v.value);
  });

  it('charges do not move with the metal rate', () => {
    const a = valuate(10000, '22K', 10, 0, { stoneCharges: 1200 });
    const b = valuate(14000, '22K', 10, 0, { stoneCharges: 1200 });
    expect(b.total - b.value).toBe(1200);
    expect(a.total - a.value).toBe(1200);
  });

  it('normalises amounts to whole rupees and drops blanks', () => {
    expect(normalizeCharge(2500.4)).toBe(2500);
    expect(normalizeCharge('1800')).toBe(1800);
    expect(normalizeCharge('')).toBeUndefined();
    expect(normalizeCharge(0)).toBeUndefined();
    expect(normalizeCharge(-5)).toBeUndefined();
    expect(normalizeCharge(undefined)).toBeUndefined();
  });

  it('parses rupee amounts as people type them', () => {
    expect(parseRupees('2500')).toBe(2500);
    expect(parseRupees('2,500')).toBe(2500);
    expect(parseRupees('₹1,25,000')).toBe(125000);
    expect(parseRupees('Rs. 2,500/-')).toBe(2500);
    expect(parseRupees('INR 99.5')).toBe(99.5);
    expect(parseRupees(3200)).toBe(3200);
    expect(parseRupees('')).toBeUndefined();
    expect(parseRupees(null)).toBeUndefined();
    expect(parseRupees('abc')).toBeNull();
    expect(parseRupees(-10)).toBeNull();
  });
});

describe('resolver carries charges from the saved item', () => {
  const settings: BarcodeSettings = {
    encoded: { enabled: true, separator: '-' },
    numeric: { enabled: false, prefix: '29', itemCodeLength: 5, weightLength: 5, weightDecimals: 2, hasCheckDigit: true },
  };
  const saved: Item = {
    id: 'a',
    barcode: '890000000001',
    metal: 'gold',
    purity: '22K',
    weightGrams: 8.42,
    makingCharges: 2500,
    stoneCharges: 1200,
    createdAt: '',
    updatedAt: '',
  };
  const db = { findByBarcode: (c: string) => (c === saved.barcode ? saved : undefined) };

  it('for database items', () => {
    const r = resolveBarcode('890000000001', settings, db);
    expect(r).toMatchObject({ status: 'found', item: { makingCharges: 2500, stoneCharges: 1200 } });
    expect(r.status === 'found' && r.item.diamondCharges).toBeFalsy();
  });

  it('not for encoded codes with no saved item', () => {
    const r = resolveBarcode('GOLD-22-1-5', settings, db);
    expect(r.status === 'found' && r.item.makingCharges).toBeFalsy();
  });
});

describe('spreadsheet charges columns', () => {
  const HEADER = ['Barcode', 'Metal', 'Purity', 'Net Weight (g)', 'Item Name', 'Making Charges (₹)', 'Stone Charges (₹)', 'Diamond Charges (₹)'];

  it('reads optional charges and reports bad amounts', () => {
    const r = parseInventoryRows([
      HEADER,
      ['1', 'Gold', '22K', '8.42', 'Ring', '2,500', '', ''],
      ['2', 'Gold', '18K', '3.1', 'Pendant', '1800', null, '₹45,000'],
      ['3', 'Silver', '925', '50', 'Anklet', '', '', ''],
      ['4', 'Gold', '22K', '5', 'Bad', 'free', '', ''],
    ]);
    expect(r.items).toEqual([
      { barcode: '1', metal: 'gold', purity: '22K', weightGrams: 8.42, name: 'Ring', makingCharges: 2500 },
      { barcode: '2', metal: 'gold', purity: '18K', weightGrams: 3.1, name: 'Pendant', makingCharges: 1800, diamondCharges: 45000 },
      { barcode: '3', metal: 'silver', purity: '925', weightGrams: 50, name: 'Anklet' },
    ]);
    expect(r.errors).toEqual([{ row: 5, message: expect.stringMatching(/Making charges “free” isn’t a rupee amount/) }]);
  });

  it('recognises common charge headers but not a plain "Stone" description column', () => {
    const r = parseInventoryRows([
      ['Tag No', 'Karat', 'Net Wt', 'Type', 'Stone', 'Labour', 'Stone Value', 'Diamond Amount'],
      ['9', '22', '4', 'Gold', 'Ruby', '900', '1500', '0'],
    ]);
    expect(r.errors).toEqual([]);
    expect(r.items[0]).toMatchObject({ makingCharges: 900, stoneCharges: 1500 });
    expect(r.items[0]!.diamondCharges).toBeUndefined();
  });

  it('round-trips charges through a real .xlsx', async () => {
    const buffer = await writeXlsxFile([
      HEADER.map((value) => ({ value })),
      ['7', 'Gold', '22K', 12.6, 'Bangle', 4200, 3500, null],
    ]).toBuffer();
    const [sheet] = await readXlsxFile(buffer, { parseNumber: (s: string) => s });
    const r = parseInventoryRows(sheet!.data as RawCell[][]);
    expect(r.items).toEqual([
      { barcode: '7', metal: 'gold', purity: '22K', weightGrams: 12.6, name: 'Bangle', makingCharges: 4200, stoneCharges: 3500 },
    ]);
  });
});
