import { describe, expect, it } from 'vitest';
import type { Resolution, ResolvedItem } from '@/types';
import { buildEstimate, gstLines, rupeesInWords } from '@/features/estimate/buildEstimate';

const ring: ResolvedItem = {
  barcode: 'R1', name: 'Ring', metal: 'gold', purity: '22K', weightGrams: 8.42,
  source: 'database', itemId: 'r', makingCharges: 2500,
};
const coin: ResolvedItem = {
  barcode: 'C1', name: 'Coin', metal: 'silver', purity: '999', weightGrams: 10, source: 'database', itemId: 'c',
};
const pendant: ResolvedItem = {
  barcode: 'P1', name: 'Pendant', metal: 'gold', purity: '18K', weightGrams: 2, source: 'database', itemId: 'p',
  diamondCharges: 40000,
};
const db: Record<string, ResolvedItem> = { R1: ring, C1: coin, P1: pendant };
const resolve = (code: string): Resolution =>
  db[code] ? { status: 'found', item: db[code]! } : { status: 'not-found', barcode: code };

// 24K gold ₹12,000/g → 22K ₹11,000, 18K ₹9,000; silver ₹100/g → 999 ₹99.90
const prices = { gold: 12000, silver: 100 };

describe('buildEstimate', () => {
  it('adds lines, charges and GST', () => {
    const e = buildEstimate(['R1', 'C1', 'P1'], resolve, (m) => prices[m], { adjustmentPct: 0, gstPct: 3 });
    // Ring 8.42 × 11,000 = 92,620 + 2,500 = 95,120
    // Coin 10 × 99.90 = 999
    // Pendant 2 × 9,000 = 18,000 + 40,000 = 58,000
    expect(e.lines.map((l) => l.valuation?.total)).toEqual([95120, 999, 58000]);
    expect(e.subtotal).toBe(154119);
    expect(e.gst).toBe(4624); // 3% of 1,54,119 = 4,623.57
    expect(e.total).toBe(158743);
    expect(e.complete).toBe(true);
    expect(e.rates).toEqual([
      { metal: 'gold', purity: '22K', ratePerGram: 11000 },
      { metal: 'silver', purity: '999', ratePerGram: 99.9 },
      { metal: 'gold', purity: '18K', ratePerGram: 9000 },
    ]);
  });

  it('omits GST when set to 0', () => {
    const e = buildEstimate(['R1'], resolve, (m) => prices[m], { adjustmentPct: 0, gstPct: 0 });
    expect(e.gst).toBe(0);
    expect(e.total).toBe(e.subtotal);
  });

  it('flags lines it cannot value', () => {
    const e = buildEstimate(['R1', 'GONE', 'C1'], resolve, (m) => (m === 'gold' ? 12000 : undefined), {
      adjustmentPct: 0,
      gstPct: 3,
    });
    expect(e.lines.map((l) => l.problem)).toEqual([undefined, 'not-found', 'no-price']);
    expect(e.complete).toBe(false);
    expect(e.subtotal).toBe(95120);
  });

  it('an empty estimate is not complete', () => {
    expect(buildEstimate([], resolve, () => 1, { adjustmentPct: 0, gstPct: 3 }).complete).toBe(false);
  });
});

describe('rupeesInWords', () => {
  it('uses the Indian system', () => {
    expect(rupeesInWords(0)).toBe('Zero');
    expect(rupeesInWords(7)).toBe('Seven');
    expect(rupeesInWords(115)).toBe('One Hundred Fifteen');
    expect(rupeesInWords(88410)).toBe('Eighty Eight Thousand Four Hundred Ten');
    expect(rupeesInWords(125430)).toBe('One Lakh Twenty Five Thousand Four Hundred Thirty');
    expect(rupeesInWords(158743)).toBe('One Lakh Fifty Eight Thousand Seven Hundred Forty Three');
    expect(rupeesInWords(20000000)).toBe('Two Crore');
    expect(rupeesInWords(123456789)).toBe('Twelve Crore Thirty Four Lakh Fifty Six Thousand Seven Hundred Eighty Nine');
  });
});

describe('GST on bills', () => {
  it('splits in-state GST into CGST + SGST that add up', () => {
    expect(gstLines(154119, 3, 'intra')).toEqual([
      { label: 'CGST', pct: 1.5, amount: 2312 },
      { label: 'SGST', pct: 1.5, amount: 2312 },
    ]);
  });
  it('uses a single IGST line for out-of-state sales', () => {
    expect(gstLines(154119, 3, 'inter')).toEqual([{ label: 'IGST', pct: 3, amount: 4624 }]);
  });
  it('no tax lines when GST is 0', () => {
    expect(gstLines(1000, 0, 'intra')).toEqual([]);
  });
  it('totals include the full breakdown and the chosen GST type', () => {
    const e = buildEstimate(['R1', 'C1', 'P1'], resolve, (m) => prices[m], { adjustmentPct: 0, gstPct: 3, gstMode: 'inter' });
    expect(e.breakdown).toEqual({ weightGrams: 20.42, metalValue: 111619, making: 2500, stone: 0, diamond: 40000 });
    expect(e.breakdown.metalValue + e.breakdown.making + e.breakdown.stone + e.breakdown.diamond).toBe(e.subtotal);
    expect(e.taxes.map((t) => t.label)).toEqual(['IGST']);
    expect(e.total).toBe(e.subtotal + e.gst);
  });
});
