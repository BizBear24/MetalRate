import type { GstMode, Metal, ResolvedItem, Resolution } from '@/types';
import { valuate, type Valuation } from '@/features/calculator/calculate';

export interface EstimateLine {
  code: string;
  item?: ResolvedItem;
  valuation?: Valuation;
  problem?: 'not-found' | 'no-price';
}

export interface TaxLine {
  label: string;
  pct: number;
  amount: number;
}

/** Column totals for the full breakdown. */
export interface BreakdownTotals {
  weightGrams: number;
  metalValue: number;
  making: number;
  stone: number;
  diamond: number;
}

export interface EstimateTotals {
  lines: EstimateLine[];
  breakdown: BreakdownTotals;
  /** Sum of line totals (metal value + charges) — the taxable value. */
  subtotal: number;
  gstPct: number;
  gstMode: GstMode;
  taxes: TaxLine[];
  gst: number;
  total: number;
  /** Every line could be valued. */
  complete: boolean;
  /** Purity rates used, for the "rates applied" box. */
  rates: { metal: Metal; purity: string; ratePerGram: number }[];
}

/**
 * CGST + SGST split the GST equally; each half is rounded to the rupee so the printed
 * lines always add up to the total.
 */
export function gstLines(subtotal: number, gstPct: number, mode: GstMode): TaxLine[] {
  const pct = Math.max(0, gstPct || 0);
  if (!pct) return [];
  if (mode === 'inter') return [{ label: 'IGST', pct, amount: Math.round((subtotal * pct) / 100) }];
  const half = Math.round((subtotal * pct) / 200);
  return [
    { label: 'CGST', pct: pct / 2, amount: half },
    { label: 'SGST', pct: pct / 2, amount: half },
  ];
}

export function buildEstimate(
  codes: string[],
  resolve: (code: string) => Resolution,
  purePrice: (metal: Metal) => number | undefined,
  opts: { adjustmentPct: number; gstPct: number; gstMode?: GstMode },
): EstimateTotals {
  const lines: EstimateLine[] = codes.map((code) => {
    const r = resolve(code);
    if (r.status !== 'found') return { code, problem: 'not-found' };
    const price = purePrice(r.item.metal);
    if (price === undefined) return { code, item: r.item, problem: 'no-price' };
    return {
      code,
      item: r.item,
      valuation: valuate(price, r.item.purity, r.item.weightGrams, opts.adjustmentPct, r.item),
    };
  });

  const breakdown: BreakdownTotals = { weightGrams: 0, metalValue: 0, making: 0, stone: 0, diamond: 0 };
  for (const l of lines) {
    if (!l.item || !l.valuation) continue;
    breakdown.weightGrams = Math.round((breakdown.weightGrams + l.item.weightGrams) * 1000) / 1000;
    breakdown.metalValue += l.valuation.value;
    breakdown.making += l.item.makingCharges ?? 0;
    breakdown.stone += l.item.stoneCharges ?? 0;
    breakdown.diamond += l.item.diamondCharges ?? 0;
  }

  const subtotal = lines.reduce((s, l) => s + (l.valuation?.total ?? 0), 0);
  const gstPct = Math.max(0, opts.gstPct || 0);
  const gstMode = opts.gstMode ?? 'intra';
  const taxes = gstLines(subtotal, gstPct, gstMode);
  const gst = taxes.reduce((s, t) => s + t.amount, 0);

  const seen = new Set<string>();
  const rates: EstimateTotals['rates'] = [];
  for (const l of lines) {
    if (!l.item || !l.valuation) continue;
    const key = `${l.item.metal}-${l.item.purity}`;
    if (seen.has(key)) continue;
    seen.add(key);
    rates.push({ metal: l.item.metal, purity: l.item.purity, ratePerGram: l.valuation.ratePerGram });
  }

  return {
    lines,
    breakdown,
    subtotal,
    gstPct,
    gstMode,
    taxes,
    gst,
    total: subtotal + gst,
    complete: lines.length > 0 && lines.every((l) => l.valuation),
    rates,
  };
}

const ONES = [
  '', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten',
  'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen',
];
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

function belowHundred(n: number): string {
  return n < 20 ? ONES[n]! : `${TENS[Math.floor(n / 10)]}${n % 10 ? ` ${ONES[n % 10]}` : ''}`;
}

function belowThousand(n: number): string {
  const h = Math.floor(n / 100);
  const rest = n % 100;
  return [h ? `${ONES[h]} Hundred` : '', rest ? belowHundred(rest) : ''].filter(Boolean).join(' ');
}

/** 125430 → "One Lakh Twenty Five Thousand Four Hundred Thirty" (Indian system). */
export function rupeesInWords(amount: number): string {
  let n = Math.round(Math.abs(amount));
  if (n === 0) return 'Zero';
  const parts: string[] = [];
  const crore = Math.floor(n / 1_00_00_000);
  n %= 1_00_00_000;
  const lakh = Math.floor(n / 1_00_000);
  n %= 1_00_000;
  const thousand = Math.floor(n / 1000);
  n %= 1000;
  if (crore) parts.push(`${crore >= 1000 ? rupeesInWords(crore) : belowThousand(crore)} Crore`);
  if (lakh) parts.push(`${belowHundred(lakh)} Lakh`);
  if (thousand) parts.push(`${belowHundred(thousand)} Thousand`);
  if (n) parts.push(belowThousand(n));
  return parts.join(' ');
}
