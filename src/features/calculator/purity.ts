import type { GoldPurity, Metal, Purity, SilverPurity } from '@/types';

export const GOLD_PURITIES: readonly GoldPurity[] = ['24K', '22K', '18K', '14K'];
export const SILVER_PURITIES: readonly SilverPurity[] = ['999', '925'];

const FACTORS: Record<Purity, number> = {
  '24K': 1,
  '22K': 22 / 24,
  '18K': 18 / 24,
  '14K': 14 / 24,
  '999': 0.999,
  '925': 0.925,
};

export function puritiesFor(metal: Metal): readonly Purity[] {
  return metal === 'gold' ? GOLD_PURITIES : SILVER_PURITIES;
}

export function defaultPurity(metal: Metal): Purity {
  return metal === 'gold' ? '22K' : '999';
}

export function isValidPurity(metal: Metal, purity: string): purity is Purity {
  return (puritiesFor(metal) as readonly string[]).includes(purity);
}

export function purityFactor(purity: Purity): number {
  return FACTORS[purity];
}

/**
 * Normalises loose purity notations ("22", "22k", "916", "0.925", "999") to a
 * supported purity for the given metal, or null.
 */
export function normalizePurity(metal: Metal, raw: string): Purity | null {
  const v = raw.trim().toUpperCase().replace(/^0?\./, '');
  if (metal === 'gold') {
    const aliases: Record<string, GoldPurity> = {
      '24': '24K', '24K': '24K', '999': '24K', '995': '24K',
      '22': '22K', '22K': '22K', '916': '22K',
      '18': '18K', '18K': '18K', '750': '18K',
      '14': '14K', '14K': '14K', '585': '14K',
    };
    return aliases[v] ?? null;
  }
  const aliases: Record<string, SilverPurity> = {
    '999': '999', '9999': '999', 'FINE': '999',
    '925': '925', 'STERLING': '925',
  };
  return aliases[v] ?? null;
}

export function formatPurity(metal: Metal, purity: Purity): string {
  if (metal === 'gold') return purity;
  return purity === '925' ? '925 Sterling' : '999 Fine';
}

export function metalLabel(metal: Metal): string {
  return metal === 'gold' ? 'Gold' : 'Silver';
}
