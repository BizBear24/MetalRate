import { describe, expect, it } from 'vitest';
import writeXlsxFile from 'write-excel-file/node';
import readXlsxFile from 'read-excel-file/node';
import {
  parseBarcodeCell,
  parseCsv,
  parseInventoryRows,
  parsePurityCell,
  parseWeightCell,
  type RawCell,
} from '@/services/storage/inventorySheet';

const HEADER = ['Barcode', 'Metal', 'Purity', 'Net Weight (g)', 'Item Name'];

describe('cell parsing', () => {
  it('reads purity in shop notations', () => {
    expect(parsePurityCell('gold', '22KT')).toBe('22K');
    expect(parsePurityCell('gold', '22 ct')).toBe('22K');
    expect(parsePurityCell('gold', '916')).toBe('22K');
    expect(parsePurityCell('gold', '91.6')).toBe('22K');
    expect(parsePurityCell('gold', '0.750')).toBe('18K');
    expect(parsePurityCell('gold', '22.0')).toBe('22K');
    expect(parsePurityCell('silver', '92.5')).toBe('925');
    expect(parsePurityCell('silver', 'Sterling')).toBe('925');
    expect(parsePurityCell('gold', '925')).toBeNull();
  });
  it('reads weights', () => {
    expect(parseWeightCell('8.42')).toBe(8.42);
    expect(parseWeightCell('8.42 g')).toBe(8.42);
    expect(parseWeightCell('8,42')).toBe(8.42);
    expect(parseWeightCell('1,250.5 gms')).toBe(1250.5);
    expect(parseWeightCell(3.1)).toBe(3.1);
    expect(parseWeightCell('abc')).toBeNull();
  });
  it('keeps barcodes intact', () => {
    expect(parseBarcodeCell('00125')).toBe('00125');
    expect(parseBarcodeCell('8.90123456789E12')).toBe('8901234567890');
    expect(parseBarcodeCell('12345.0')).toBe('12345');
    expect(parseBarcodeCell(' ABC-1 ')).toBe('ABC-1');
  });
});

describe('parseInventoryRows', () => {
  it('parses valid rows and reports problems with Excel row numbers', () => {
    const rows: RawCell[][] = [
      HEADER,
      ['890100000001', 'Gold', '22K', '8.42', 'Gold Ring'],
      [null, null, null, null, null],
      ['890100000002', 'silver', '925', '52.3', ''],
      ['', 'Gold', '22K', '1', 'no code'],
      ['890100000004', 'Platinum', '950', '2', ''],
      ['890100000005', 'Gold', '21K', '0', ''],
      ['890100000006', '', '925', '10', 'metal inferred'],
      ['890100000007', '', '999', '10', 'ambiguous'],
      ['890100000001', 'Gold', '18K', '9', 'duplicate wins'],
    ];
    const r = parseInventoryRows(rows);
    expect(r.rowCount).toBe(8);
    expect(r.items).toEqual([
      { barcode: '890100000001', metal: 'gold', purity: '18K', weightGrams: 9, name: 'duplicate wins' },
      { barcode: '890100000002', metal: 'silver', purity: '925', weightGrams: 52.3, name: undefined },
      { barcode: '890100000006', metal: 'silver', purity: '925', weightGrams: 10, name: 'metal inferred' },
    ]);
    expect(r.errors.map((e) => e.row)).toEqual([5, 6, 7, 9]);
    expect(r.errors[0]!.message).toMatch(/barcode is missing/i);
    expect(r.errors[1]!.message).toMatch(/Gold or Silver/);
    expect(r.errors[2]!.message).toMatch(/purity “21K”.*weight must be greater than 0/i);
    expect(r.errors[3]!.message).toMatch(/metal is missing/i);
    expect(r.warnings).toEqual([{ row: 10, message: expect.stringMatching(/also on row 2/) }]);
  });

  it('finds the header under title rows and accepts alias column names', () => {
    const r = parseInventoryRows([
      ['My shop stock'],
      [],
      ['Item', 'Tag No', 'Karat', 'Gross Wt', 'Net Wt', 'Type'],
      ['Bangle', '77', '22', '12', '11.5', 'Gold'],
    ]);
    expect(r.items).toEqual([{ barcode: '77', metal: 'gold', purity: '22K', weightGrams: 11.5, name: 'Bangle' }]);
  });

  it('explains a missing header', () => {
    const r = parseInventoryRows([['foo', 'bar'], ['1', '2']]);
    expect(r.items).toEqual([]);
    expect(r.errors[0]!.message).toMatch(/header row/);
  });
});

describe('file formats', () => {
  it('parses CSV with quotes, semicolons and BOM', () => {
    expect(parseCsv('\uFEFFa,b\r\n"x, y","he said ""hi"""\n')).toEqual([
      ['a', 'b'],
      ['x, y', 'he said "hi"'],
    ]);
    expect(parseCsv('Barcode;Metal\n001;Gold')).toEqual([
      ['Barcode', 'Metal'],
      ['001', 'Gold'],
    ]);
  });

  it('round-trips a real .xlsx with text barcodes and numeric weights', async () => {
    const buffer = await writeXlsxFile([
      HEADER.map((value) => ({ value })),
      [{ type: String, value: '000125', format: '@' }, 'Gold', '22K', 8.42, 'Ring'],
      [8901234567890, 'Silver', 925, 31.1, null],
    ]).toBuffer();
    const [sheet] = await readXlsxFile(buffer, { parseNumber: (s: string) => s });
    const r = parseInventoryRows(sheet!.data as RawCell[][]);
    expect(r.errors).toEqual([]);
    expect(r.items).toEqual([
      { barcode: '000125', metal: 'gold', purity: '22K', weightGrams: 8.42, name: 'Ring' },
      { barcode: '8901234567890', metal: 'silver', purity: '925', weightGrams: 31.1, name: undefined },
    ]);
  });
});

describe('pickInventorySheet', () => {
  it('never imports the example rows from the template’s Instructions sheet', async () => {
    const { pickInventorySheet } = await import('@/services/storage/inventorySheet');
    const r = pickInventorySheet([
      { sheet: 'Inventory', data: [HEADER] },
      { sheet: 'Instructions', data: [HEADER, ['890100000001', 'Gold', '22K', '8.42', 'Gold Ring']] },
    ]);
    expect(r).toMatchObject({ hasHeader: true, rowCount: 0, items: [] });
  });
  it('falls back to another sheet with a header', async () => {
    const { pickInventorySheet } = await import('@/services/storage/inventorySheet');
    const r = pickInventorySheet([
      { sheet: 'Cover', data: [['Stock list']] },
      { sheet: 'Stock', data: [HEADER, ['1', 'Gold', '22K', '2', '']] },
    ]);
    expect(r.items).toHaveLength(1);
  });
});
