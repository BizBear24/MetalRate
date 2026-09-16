import type { Purity } from '@/types';
import { purityFactor } from './purity';

export interface Valuation {
  /** Rate for this purity, rounded as displayed (see roundRate). */
  ratePerGram: number;
  weightGrams: number;
  /** weightGrams × ratePerGram, rounded to the nearest rupee. */
  value: number;
}

/**
 * Estimated metal value only — excludes making charges, GST, wastage, stones and margins.
 * The value is computed from the displayed (rounded) rate so the shown equation is exact.
 */
export function valuate(
  purePricePerGram: number,
  purity: Purity,
  weightGrams: number,
  adjustmentPct = 0,
): Valuation {
  const ratePerGram = purityRate(purePricePerGram, purity, adjustmentPct);
  const value = Math.round(round2(weightGrams) * ratePerGram);
  return { ratePerGram, weightGrams, value };
}

export function purityRate(purePricePerGram: number, purity: Purity, adjustmentPct = 0): number {
  return roundRate(purePricePerGram * purityFactor(purity) * (1 + adjustmentPct / 100));
}

/** Whole rupees for gold-level rates; paise precision for low rates such as silver. */
export function roundRate(rate: number): number {
  return rate >= 1000 ? Math.round(rate) : Math.round(rate * 100) / 100;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
