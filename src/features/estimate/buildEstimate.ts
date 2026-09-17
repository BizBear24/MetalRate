import type { Metal, ResolvedItem, Resolution } from '@/types';
import { valuate, type Valuation } from '@/features/calculator/calculate';

export interface EstimateLine {
  code: string;
  item?: ResolvedItem;
  valuation?: Valuation;
  problem?: 'not-found' | 'no-price';
}

export interface EstimateTotals {
  lines: EstimateLine[];
  /** Sum of line totals (metal value + charges). */
  subtotal: number;
  gstPct: number;
  gst: number;
  total: number;
  /** Every line could be valued. */
  complete: boolean;
  /** Purity rates used, for the "rates applied" box. */
  rates: { metal: Metal; purity: string; ratePerGram: number }[];
}

export function buildEstimate(
  codes: string[],
  resolve: (code: string) => Resolution,
  purePrice: (metal: Metal) => number | undefined,
  opts: { adjustmentPct: number; gstPct: number },
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

  const subtotal = lines.reduce((s, l) => s + (l.valuation?.total ?? 0), 0);
  const gstPct = Math.max(0, opts.gstPct || 0);
  const gst = Math.round((subtotal * gstPct) / 100);

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
    subtotal,
    gstPct,
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
