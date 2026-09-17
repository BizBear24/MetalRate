import { strFromU8, unzipSync } from 'fflate';

/**
 * Pulls pictures out of an .xlsx and works out which row each belongs to. Supports:
 *  - pictures pasted / inserted over the sheet (Insert → Pictures → Place over Cells)
 *  - Excel 365 "Place in Cell" pictures (stored as rich values)
 *  - WPS Office cell images (=DISPIMG("ID_…",1))
 * The XML written by these apps is regular, so light regex parsing is enough and keeps
 * this usable outside the browser (tests).
 */

export interface SheetImage {
  /** 1-based row number, as shown in Excel. */
  row: number;
  data: Uint8Array;
  mime: string;
}

const MIME: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  bmp: 'image/bmp',
  webp: 'image/webp',
};

type Zip = Record<string, Uint8Array>;

const attrs = (tag: string): Record<string, string> => {
  const out: Record<string, string> = {};
  for (const m of tag.matchAll(/([\w:.-]+)\s*=\s*"([^"]*)"/g)) out[m[1]!] = unescapeXml(m[2]!);
  return out;
};

/** Attribute lookup ignoring the namespace prefix (r:id, x:name…). */
const attr = (a: Record<string, string>, local: string) =>
  a[local] ?? Object.entries(a).find(([k]) => k.endsWith(`:${local}`))?.[1];

function unescapeXml(s: string): string {
  return s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

function text(zip: Zip, path: string): string | undefined {
  const f = zip[path];
  return f ? strFromU8(f) : undefined;
}

function dirname(path: string): string {
  const i = path.lastIndexOf('/');
  return i === -1 ? '' : path.slice(0, i);
}

function resolvePath(base: string, target: string): string {
  if (target.startsWith('/')) return target.slice(1);
  const parts = (base ? `${base}/${target}` : target).split('/');
  const out: string[] = [];
  for (const p of parts) {
    if (p === '..') out.pop();
    else if (p && p !== '.') out.push(p);
  }
  return out.join('/');
}

/** Relationship id → resolved part path, for the part at `partPath`. */
function relsOf(zip: Zip, partPath: string): Map<string, string> {
  const relsPath = `${dirname(partPath) ? `${dirname(partPath)}/` : ''}_rels/${partPath.split('/').pop()}.rels`;
  const xml = text(zip, relsPath);
  const map = new Map<string, string>();
  if (!xml) return map;
  for (const m of xml.matchAll(/<(?:\w+:)?Relationship\b[^>]*>/g)) {
    const a = attrs(m[0]);
    if (a.Id && a.Target && a.TargetMode !== 'External') map.set(a.Id, resolvePath(dirname(partPath), a.Target));
  }
  return map;
}

function image(zip: Zip, path: string | undefined, row: number): SheetImage | null {
  if (!path) return null;
  const data = zip[path];
  const mime = MIME[path.split('.').pop()?.toLowerCase() ?? ''];
  return data && mime ? { row, data, mime } : null;
}

const rowOfRef = (ref: string | undefined) => Number(ref?.match(/\d+/)?.[0] ?? NaN);

/** Floating pictures in the sheet's drawing layer, by the row of their top-left corner. */
function drawingImages(zip: Zip, sheetRels: Map<string, string>): SheetImage[] {
  const out: SheetImage[] = [];
  for (const target of sheetRels.values()) {
    if (!/drawings\/[^/]+\.xml$/.test(target)) continue;
    const xml = text(zip, target);
    if (!xml) continue;
    const rels = relsOf(zip, target);
    for (const m of xml.matchAll(/<(\w+:)?(twoCellAnchor|oneCellAnchor)\b[\s\S]*?<\/\1?\2>/g)) {
      const anchor = m[0];
      const fromRow = anchor.match(/<(?:\w+:)?from>[\s\S]*?<(?:\w+:)?row>(\d+)</)?.[1];
      const embed = anchor.match(/<(?:\w+:)?blip\b[^>]*?(?:\w+:)?embed="([^"]+)"/)?.[1];
      if (fromRow === undefined || !embed) continue;
      const img = image(zip, rels.get(embed), Number(fromRow) + 1);
      if (img) out.push(img);
    }
  }
  return out;
}

/** Excel 365 "Place in Cell" pictures: cell vm → metadata → rich value → image relationship. */
function richValueImages(zip: Zip, sheetXml: string): SheetImage[] {
  const metadata = text(zip, 'xl/metadata.xml');
  const rv = text(zip, 'xl/richData/rdrichvalue.xml');
  const relXml = text(zip, 'xl/richData/richValueRel.xml');
  if (!metadata || !rv || !relXml) return [];

  const valueMeta = metadata.match(/<(?:\w+:)?valueMetadata\b[^>]*>([\s\S]*?)<\/(?:\w+:)?valueMetadata>/)?.[1] ?? '';
  const vmToFuture = [...valueMeta.matchAll(/<(?:\w+:)?bk\b[^>]*>([\s\S]*?)<\/(?:\w+:)?bk>/g)].map((b) =>
    Number(b[1]!.match(/<(?:\w+:)?rc\b[^>]*\bv="(\d+)"/)?.[1] ?? NaN),
  );
  const future = metadata.match(/<(?:\w+:)?futureMetadata\b[^>]*name="XLRICHVALUE"[^>]*>([\s\S]*?)<\/(?:\w+:)?futureMetadata>/)?.[1] ?? '';
  const futureToRv = [...future.matchAll(/<(?:\w+:)?bk\b[^>]*>([\s\S]*?)<\/(?:\w+:)?bk>/g)].map((b) =>
    Number(b[1]!.match(/<(?:\w+:)?rvb\b[^>]*\bi="(\d+)"/)?.[1] ?? NaN),
  );

  const structures = [...(text(zip, 'xl/richData/rdrichvaluestructure.xml') ?? '').matchAll(/<(?:\w+:)?s\b[^>]*>([\s\S]*?)<\/(?:\w+:)?s>/g)].map((s) =>
    [...s[1]!.matchAll(/<(?:\w+:)?k\b[^>]*\bn="([^"]+)"/g)].map((k) => k[1]!),
  );
  const values = [...rv.matchAll(/<(?:\w+:)?rv\b([^>]*)>([\s\S]*?)<\/(?:\w+:)?rv>/g)].map((m) => ({
    s: Number(attrs(m[1]!).s ?? 0),
    v: [...m[2]!.matchAll(/<(?:\w+:)?v\b[^>]*>([^<]*)<\/(?:\w+:)?v>/g)].map((x) => x[1]!),
  }));
  const relIds = [...relXml.matchAll(/<(?:\w+:)?rel\b[^>]*>/g)].map((m) => attr(attrs(m[0]), 'id'));
  const relTargets = relsOf(zip, 'xl/richData/richValueRel.xml');

  const out: SheetImage[] = [];
  for (const m of sheetXml.matchAll(/<(?:\w+:)?c\b([^>]*\bvm="\d+"[^>]*)>/g)) {
    const a = attrs(m[1]!);
    const future = vmToFuture[Number(a.vm) - 1];
    const rvIndex = future === undefined ? undefined : futureToRv[future];
    const value = rvIndex === undefined ? undefined : values[rvIndex];
    if (!value) continue;
    const keyIndex = (structures[value.s] ?? []).indexOf('_rvRel:LocalImageIdentifier');
    const relIndex = Number(value.v[keyIndex < 0 ? 0 : keyIndex]);
    const relId = relIds[relIndex];
    const img = image(zip, relId ? relTargets.get(relId) : undefined, rowOfRef(a.r));
    if (img) out.push(img);
  }
  return out;
}

/** WPS Office: =DISPIMG("ID_…",1) with the pictures listed in xl/cellimages.xml. */
function wpsImages(zip: Zip, sheetXml: string): SheetImage[] {
  const cellImages = text(zip, 'xl/cellimages.xml');
  if (!cellImages || !sheetXml.includes('DISPIMG')) return [];
  const rels = relsOf(zip, 'xl/cellimages.xml');
  const byName = new Map<string, string>();
  for (const m of cellImages.matchAll(/<(\w+:)?cellImage\b[\s\S]*?<\/\1?cellImage>/g)) {
    const name = m[0].match(/<(?:\w+:)?cNvPr\b[^>]*\bname="([^"]+)"/)?.[1];
    const embed = m[0].match(/(?:\w+:)?embed="([^"]+)"/)?.[1];
    const path = embed ? rels.get(embed) : undefined;
    if (name && path) byName.set(name, path);
  }
  const out: SheetImage[] = [];
  // Opening tag must not be self-closing, or an empty cell would swallow the next one.
  for (const m of sheetXml.matchAll(/<(?:\w+:)?c\b((?:[^>/]|\/(?!>))*)>([\s\S]*?)<\/(?:\w+:)?c>/g)) {
    const id = unescapeXml(m[2]!).match(/DISPIMG\(\s*"([^"]+)"/)?.[1];
    if (!id) continue;
    const img = image(zip, byName.get(id), rowOfRef(attrs(m[1]!).r));
    if (img) out.push(img);
  }
  return out;
}

/** All pictures per sheet name; the first picture on a row wins. */
export function extractSheetImages(bytes: Uint8Array): Map<string, Map<number, SheetImage>> {
  const zip = unzipSync(bytes);
  const result = new Map<string, Map<number, SheetImage>>();
  const workbook = text(zip, 'xl/workbook.xml');
  if (!workbook) return result;
  const wbRels = relsOf(zip, 'xl/workbook.xml');

  for (const m of workbook.matchAll(/<(?:\w+:)?sheet\b[^>]*>/g)) {
    const a = attrs(m[0]);
    const name = a.name;
    const path = wbRels.get(attr(a, 'id') ?? '');
    const sheetXml = path ? text(zip, path) : undefined;
    if (!name || !path || !sheetXml) continue;

    const rows = new Map<number, SheetImage>();
    const all = [...drawingImages(zip, relsOf(zip, path)), ...richValueImages(zip, sheetXml), ...wpsImages(zip, sheetXml)];
    for (const img of all) if (Number.isFinite(img.row) && !rows.has(img.row)) rows.set(img.row, img);
    if (rows.size) result.set(name, rows);
  }
  return result;
}
