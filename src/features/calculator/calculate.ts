import { CHARGE_FIELDS, type ChargeField, type ItemCharges, type Purity } from '@/types';
import { purityFactor } from './purity';

export interface ChargeLine {
  field: ChargeField;
  label: string;
  amount: number;
}

export interface Valuation {
  /** Rate for this purity, rounded as displayed (see roundRate). */
  ratePerGram: number;
  weightGrams: number;
  /** weightGrams × ratePerGram, rounded to the nearest rupee. */
  value: number;
  /** Charges that apply to this item (zero/blank ones are left out). */
  charges: ChargeLine[];
  chargesTotal: number;
  /** value + chargesTotal. */
  total: number;
}

export const CHARGE_LABELS: Record<ChargeField, string> = {
  makingCharges: 'Making charges',
  stoneCharges: 'Stone charges',
  diamondCharges: 'Diamond charges',
};

/**
 * Metal value = weight × rate for the purity, computed from the displayed (rounded) rate so the
 * shown equation is exact. The item's fixed charges are then added on top. Excludes GST.
 */
export function valuate(
  purePricePerGram: number,
  purity: Purity,
  weightGrams: number,
  adjustmentPct = 0,
  itemCharges: ItemCharges = {},
): Valuation {
  const ratePerGram = purityRate(purePricePerGram, purity, adjustmentPct);
  const value = Math.round(round2(weightGrams) * ratePerGram);
  const charges = chargeLines(itemCharges);
  const chargesTotal = charges.reduce((sum, c) => sum + c.amount, 0);
  return { ratePerGram, weightGrams, value, charges, chargesTotal, total: value + chargesTotal };
}

export function chargeLines(c: ItemCharges): ChargeLine[] {
  return CHARGE_FIELDS.flatMap((field) => {
    const amount = c[field];
    return amount && amount > 0 ? [{ field, label: CHARGE_LABELS[field], amount }] : [];
  });
}

/** Keeps only positive amounts, in whole rupees; returns undefined for "doesn't apply". */
export function normalizeCharge(v: unknown): number | undefined {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() ? Number(v) : NaN;
  const rupees = Number.isFinite(n) ? Math.round(n) : 0;
  return rupees > 0 ? rupees : undefined;
}

export function normalizeCharges(c: ItemCharges): ItemCharges {
  const out: ItemCharges = {};
  for (const f of CHARGE_FIELDS) {
    const v = normalizeCharge(c[f]);
    if (v !== undefined) out[f] = v;
  }
  return out;
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
