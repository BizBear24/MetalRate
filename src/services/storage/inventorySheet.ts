import { CHARGE_FIELDS, type ChargeField, type ItemCharges, type ItemDraft, type Metal } from '@/types';
import { normalizePurity } from '@/features/calculator/purity';
import { CHARGE_LABELS, normalizeCharge } from '@/features/calculator/calculate';
import { parseRupees } from '@/lib/money';

/**
 * Spreadsheet import/export of the item list (Excel .xlsx or CSV).
 * Parsing is pure; the Excel libraries are loaded only when a file is read or written.
 */

export type RawCell = string | number | boolean | Date | null | undefined;

export interface SheetIssue {
  /** 1-based row number as shown in Excel. */
  row: number;
  message: string;
}

export interface ParsedInventory {
  items: ItemDraft[];
  errors: SheetIssue[];
  warnings: SheetIssue[];
  /** Non-empty data rows found. */
  rowCount: number;
  /** A header row with at least Barcode and Weight columns was found. */
  hasHeader: boolean;
}

type Field = 'barcode' | 'metal' | 'purity' | 'weight' | 'name' | ChargeField;

export const TEMPLATE_HEADERS: Record<Field, string> = {
  barcode: 'Barcode',
  metal: 'Metal',
  purity: 'Purity',
  weight: 'Net Weight (g)',
  name: 'Item Name',
  makingCharges: 'Making Charges (₹)',
  stoneCharges: 'Stone Charges (₹)',
  diamondCharges: 'Diamond Charges (₹)',
};
const FIELD_ORDER: Field[] = ['barcode', 'metal', 'purity', 'weight', 'name', ...CHARGE_FIELDS];

// Header aliases after normalisation (lowercase, letters/digits only). Earlier = preferred.
const HEADER_ALIASES: Record<Field, string[]> = {
  barcode: ['barcode', 'barcodeno', 'barcodenumber', 'code', 'itemcode', 'sku', 'tag', 'tagno', 'tagnumber', 'huid', 'ean'],
  metal: ['metal', 'metaltype', 'type'],
  purity: ['purity', 'karat', 'carat', 'kt', 'ct', 'fineness', 'touch'],
  weight: ['netweightg', 'netweight', 'netwt', 'netwtg', 'weightg', 'weight', 'weightgrams', 'grams', 'gram', 'gms', 'gm', 'wt', 'grossweightg', 'grossweight', 'grosswt'],
  name: ['itemname', 'name', 'item', 'description', 'productname', 'product', 'design'],
  makingCharges: ['makingcharges', 'makingchargesrs', 'makingchargesinr', 'makingcharge', 'making', 'mc', 'labourcharges', 'labour', 'laborcharges', 'labor'],
  stoneCharges: ['stonecharges', 'stonechargesrs', 'stonechargesinr', 'stonecharge', 'stonevalue', 'stoneamount', 'stoneprice'],
  diamondCharges: ['diamondcharges', 'diamondchargesrs', 'diamondchargesinr', 'diamondcharge', 'diamondvalue', 'diamondamount', 'diamondprice'],
};

const MAX_WEIGHT = 100000;

const normHeader = (v: RawCell) => cellText(v).toLowerCase().replace(/[^a-z0-9]/g, '');

export function cellText(v: RawCell): string {
  if (v == null) return '';
  if (v instanceof Date) return v.toISOString();
  return String(v).trim();
}

function mapHeader(row: RawCell[]): Partial<Record<Field, number>> | null {
  const cols = row.map(normHeader);
  const map: Partial<Record<Field, number>> = {};
  for (const field of FIELD_ORDER) {
    for (const alias of HEADER_ALIASES[field]) {
      const idx = cols.indexOf(alias);
      if (idx !== -1 && !Object.values(map).includes(idx)) {
        map[field] = idx;
        break;
      }
    }
  }
  return map.barcode !== undefined && map.weight !== undefined ? map : null;
}

/** Excel may hand back long numeric barcodes as "8.90123456789E12". */
export function parseBarcodeCell(v: RawCell): string {
  const s = cellText(v);
  if (/^\d+(\.\d+)?e\+?\d+$/i.test(s)) {
    const n = Number(s);
    if (Number.isSafeInteger(n)) return String(n);
  }
  // A numeric cell like 12345.0 is the barcode 12345.
  return /^\d+\.0+$/.test(s) ? s.replace(/\.0+$/, '') : s;
}

export function parseMetalCell(v: RawCell): Metal | null {
  const s = cellText(v).toLowerCase();
  if (/^(gold|au\b|g\b)/.test(s)) return 'gold';
  if (/^(silver|ag\b|s\b)/.test(s)) return 'silver';
  return null;
}

/** Accepts 22, 22K, 22KT, "22 ct", 916, 0.916, 91.6, 925, 92.5, 999, Sterling… */
export function parsePurityCell(metal: Metal, v: RawCell): ReturnType<typeof normalizePurity> {
  let s = cellText(v).toUpperCase().replace(/\s+/g, '');
  s = s.replace(/(KARAT|CARAT|KT|CT)$/, 'K');
  if (/^\d+\.0+$/.test(s)) s = s.replace(/\.0+$/, ''); // 22.0 → 22
  if (/^\d{2}\.\d$/.test(s)) s = s.replace('.', ''); // 91.6 → 916, 92.5 → 925
  return normalizePurity(metal, s);
}

/** Guess metal from purity when the Metal column is blank (999 stays ambiguous). */
function inferMetal(v: RawCell): Metal | null {
  const s = cellText(v).toUpperCase().replace(/\s+/g, '');
  if (!s) return null;
  const gold = parsePurityCell('gold', v);
  const silver = parsePurityCell('silver', v);
  if (gold && !silver) return 'gold';
  if (silver && !gold) return 'silver';
  return null;
}

export function parseWeightCell(v: RawCell): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  let s = cellText(v).toLowerCase().replace(/\s+/g, '').replace(/(grams|gram|gms|gm|g)$/, '');
  if (!s) return null;
  if (s.includes(',') && s.includes('.')) s = s.replace(/,/g, '');
  else if (s.includes(',')) s = s.replace(',', '.');
  if (!/^\d*\.?\d+$/.test(s)) return null;
  return Number(s);
}

export function parseInventoryRows(rows: RawCell[][]): ParsedInventory {
  const result: ParsedInventory = { items: [], errors: [], warnings: [], rowCount: 0, hasHeader: false };

  let headerIdx = -1;
  let cols: Partial<Record<Field, number>> | null = null;
  for (let i = 0; i < Math.min(rows.length, 15); i++) {
    cols = mapHeader(rows[i] ?? []);
    if (cols) {
      headerIdx = i;
      break;
    }
  }
  if (!cols) {
    result.errors.push({
      row: 1,
      message: 'Couldn’t find the header row. It needs at least “Barcode” and “Net Weight (g)” columns — use the template.',
    });
    return result;
  }
  result.hasHeader = true;

  const byBarcode = new Map<string, { draft: ItemDraft; row: number }>();
  const get = (row: RawCell[], f: Field) => (cols![f] === undefined ? undefined : row[cols![f]!]);

  for (let i = headerIdx + 1; i < rows.length; i++) {
    const row = rows[i] ?? [];
    const excelRow = i + 1;
    if (row.every((c) => cellText(c) === '')) continue;
    result.rowCount++;

    const problems: string[] = [];
    const barcode = parseBarcodeCell(get(row, 'barcode'));
    if (!barcode) problems.push('barcode is missing');
    else if (barcode.length > 64) problems.push('barcode is too long');

    const metalCell = get(row, 'metal');
    const purityCell = get(row, 'purity');
    let metal = parseMetalCell(metalCell);
    if (!metal && cellText(metalCell)) problems.push(`metal “${cellText(metalCell)}” should be Gold or Silver`);
    else if (!metal) metal = inferMetal(purityCell);
    if (!metal && !cellText(metalCell)) problems.push('metal is missing');

    const purity = metal ? parsePurityCell(metal, purityCell) : null;
    if (metal && !purity) {
      problems.push(
        cellText(purityCell)
          ? `purity “${cellText(purityCell)}” isn’t valid for ${metal} (${metal === 'gold' ? '24K, 22K, 18K, 14K' : '999, 925'})`
          : 'purity is missing',
      );
    }

    const weightCell = get(row, 'weight');
    const weight = parseWeightCell(weightCell);
    if (weight === null) problems.push(cellText(weightCell) ? `weight “${cellText(weightCell)}” isn’t a number` : 'weight is missing');
    else if (weight <= 0) problems.push('weight must be greater than 0 g');
    else if (weight > MAX_WEIGHT) problems.push('weight looks too large');

    const charges: ItemCharges = {};
    for (const f of CHARGE_FIELDS) {
      const cell = get(row, f);
      const amount = parseRupees(cell);
      if (amount === null) problems.push(`${CHARGE_LABELS[f].toLowerCase()} “${cellText(cell)}” isn’t a rupee amount`);
      else charges[f] = normalizeCharge(amount);
    }

    if (problems.length || !metal || !purity || weight === null) {
      result.errors.push({ row: excelRow, message: capitalize(problems.join('; ')) });
      continue;
    }

    const name = cellText(get(row, 'name')).slice(0, 60) || undefined;
    const draft: ItemDraft = { barcode, metal, purity, weightGrams: Math.round(weight * 1000) / 1000, name, ...charges };
    const prev = byBarcode.get(barcode);
    if (prev) result.warnings.push({ row: excelRow, message: `Barcode ${barcode} also on row ${prev.row} — this row is used.` });
    byBarcode.set(barcode, { draft, row: excelRow });
  }

  result.items = [...byBarcode.values()].map((v) => v.draft);
  return result;
}

function capitalize(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Minimal RFC 4180 CSV parser; detects comma, semicolon or tab delimiters. */
export function parseCsv(text: string): string[][] {
  const src = text.replace(/^\uFEFF/, '');
  const firstLine = src.split(/\r?\n/, 1)[0] ?? '';
  const delim = [',', ';', '\t'].reduce((best, d) => (firstLine.split(d).length > firstLine.split(best).length ? d : best), ',');
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < src.length; i++) {
    const c = src[i]!;
    if (quoted) {
      if (c === '"' && src[i + 1] === '"') {
        field += '"';
        i++;
      } else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"' && field === '') quoted = true;
    else if (c === delim) {
      row.push(field);
      field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && src[i + 1] === '\n') i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else field += c;
  }
  if (field !== '' || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

// ── File I/O (browser) ────────────────────────────────────────────────

export async function readInventoryFile(file: File): Promise<ParsedInventory> {
  const name = file.name.toLowerCase();
  if (name.endsWith('.csv') || name.endsWith('.txt') || file.type === 'text/csv') {
    return parseInventoryRows(parseCsv(await file.text()));
  }
  if (name.endsWith('.xls')) {
    throw new Error('Old .xls files aren’t supported. In Excel, use File → Save As → Excel Workbook (.xlsx).');
  }
  const { default: readXlsxFile } = await import('read-excel-file/browser');
  let sheets: { sheet: string; data: RawCell[][] }[];
  try {
    // Keep numbers as their original text so long barcodes don't lose digits.
    sheets = (await readXlsxFile(file, { parseNumber: (s: string) => s })) as typeof sheets;
  } catch {
    throw new Error('Couldn’t read this file. Save it as .xlsx or .csv and try again.');
  }
  return pickInventorySheet(sheets);
}

/**
 * Uses the template's "Inventory" sheet when present, otherwise the first sheet with a
 * recognisable header. The template's "Instructions" sheet (with example rows) is never read.
 */
export function pickInventorySheet(sheets: { sheet: string; data: RawCell[][] }[]): ParsedInventory {
  const candidates = sheets
    .filter((s) => s.sheet !== 'Instructions')
    .sort((a, b) => Number(b.sheet === 'Inventory') - Number(a.sheet === 'Inventory'));
  let first: ParsedInventory | null = null;
  for (const s of candidates) {
    const parsed = parseInventoryRows(s.data);
    if (parsed.hasHeader) return parsed;
    first ??= parsed;
  }
  return first ?? parseInventoryRows([]);
}

const HEADER_STYLE = {
  fontWeight: 'bold' as const,
  backgroundColor: '#D2B06A',
  textColor: '#17120A',
  borderStyle: 'thin' as const,
  borderColor: '#9C7A3C',
};
const TEXT = '@';
const RUPEES = '#,##0';
const COLUMN_WIDTHS = [{ width: 22 }, { width: 10 }, { width: 10 }, { width: 16 }, { width: 28 }, { width: 20 }, { width: 19 }, { width: 21 }];

function headerRow() {
  return FIELD_ORDER.map((f) => ({ value: TEMPLATE_HEADERS[f], ...HEADER_STYLE }));
}

type OutRow = ({ value?: string | number; type?: StringConstructor | NumberConstructor; format?: string } | null)[];

function itemRow(i?: ItemDraft): OutRow {
  return [
    // Barcode as text so leading zeros survive.
    { type: String, value: i?.barcode ?? '', format: TEXT },
    { type: String, value: i ? (i.metal === 'gold' ? 'Gold' : 'Silver') : '', format: TEXT },
    { type: String, value: i?.purity ?? '', format: TEXT },
    i ? { type: Number, value: i.weightGrams, format: '0.00#' } : { type: Number, format: '0.00#' },
    { type: String, value: i?.name ?? '', format: TEXT },
    ...CHARGE_FIELDS.map((f) => (i?.[f] ? { type: Number, value: i[f], format: RUPEES } : { type: Number, format: RUPEES })),
  ];
}

const INSTRUCTIONS: (string | null)[][] = [
  ['GoldCalc inventory template'],
  [null],
  ['Fill in the “Inventory” sheet — one row per item — then upload it in GoldCalc (Items → Import).'],
  ['Rows with the same barcode as an existing item update that item. Blank rows are ignored.'],
  [null],
  ['Column', 'Required', 'Allowed values'],
  ['Barcode', 'Yes', 'The code printed on the tag. Keep this column formatted as Text so leading zeros are kept.'],
  ['Metal', 'Yes', 'Gold or Silver'],
  ['Purity', 'Yes', 'Gold: 24K, 22K, 18K, 14K (916, 750, 585 also accepted). Silver: 999 or 925.'],
  ['Net Weight (g)', 'Yes', 'Metal weight in grams, e.g. 8.42. Must be greater than 0.'],
  ['Item Name', 'No', 'Optional, e.g. Gold Ring'],
  ['Making Charges (₹)', 'No', 'Fixed rupee amount for this item, added on top of the metal value. Leave blank if none.'],
  ['Stone Charges (₹)', 'No', 'Fixed rupee amount for stones. Leave blank if the item has no stones.'],
  ['Diamond Charges (₹)', 'No', 'Fixed rupee amount for diamonds. Leave blank if the item has no diamonds.'],
  [null],
  ['Total shown in GoldCalc = Net Weight × live rate for the purity + Making + Stone + Diamond charges (GST not included).'],
  [null],
  ['Example rows (do not paste these into your inventory):'],
  ['Barcode', 'Metal', 'Purity', 'Net Weight (g)', 'Item Name', 'Making Charges (₹)', 'Stone Charges (₹)', 'Diamond Charges (₹)'],
  ['890100000001', 'Gold', '22K', '8.42', 'Gold Ring', '2500', '', ''],
  ['890100000002', 'Gold', '18K', '3.105', 'Diamond Pendant', '1800', '', '45000'],
  ['890100000003', 'Gold', '22K', '12.6', 'Ruby Studded Bangle', '4200', '3500', ''],
  ['890100000004', 'Silver', '925', '52.30', 'Silver Anklet Pair', '', '', ''],
];

async function buildWorkbook(inventoryRows: OutRow[]): Promise<Blob> {
  const { default: writeXlsxFile } = await import('write-excel-file/browser');
  const isTableHeader = (r: (string | null)[]) => r[0] === 'Column' || (r[0] === 'Barcode' && r[1] === 'Metal');
  const instructions = INSTRUCTIONS.map((r, i) =>
    r.map((v) =>
      v == null
        ? null
        : {
            value: v,
            type: String,
            ...(i === 0 ? { fontWeight: 'bold' as const, fontSize: 14 } : isTableHeader(r) ? { fontWeight: 'bold' as const } : {}),
          },
    ),
  );
  const sheets = [
    { sheet: 'Inventory', stickyRowsCount: 1, columns: COLUMN_WIDTHS, data: [headerRow(), ...inventoryRows] },
    { sheet: 'Instructions', columns: [{ width: 18 }, { width: 12 }, { width: 90 }], data: instructions },
  ];
  // The library's overloads don't narrow our literal cell objects; the shapes match its Sheet type.
  return writeXlsxFile(sheets as unknown as Parameters<typeof writeXlsxFile>[0] & unknown[]).toBlob();
}

function saveBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  Object.assign(document.createElement('a'), { href: url, download: fileName }).click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/** Blank template: header plus 500 rows pre-formatted so barcodes stay text. */
export function buildInventoryTemplate(): Promise<Blob> {
  return buildWorkbook(Array.from({ length: 500 }, () => itemRow()));
}

export async function downloadInventoryTemplate(): Promise<void> {
  saveBlob(await buildInventoryTemplate(), 'GoldCalc-inventory-template.xlsx');
}

/** Current items in the same layout, so the sheet can be edited and re-uploaded. */
export function buildInventoryExport(items: ItemDraft[]): Promise<Blob> {
  return buildWorkbook(items.map((i) => itemRow(i)));
}

export async function exportInventoryWorkbook(items: ItemDraft[]): Promise<void> {
  saveBlob(await buildInventoryExport(items), `GoldCalc-items-${new Date().toISOString().slice(0, 10)}.xlsx`);
}
