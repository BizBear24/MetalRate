import type { MassUnit } from './types';

export const GRAMS_PER_TROY_OUNCE = 31.1034768;
export const GRAMS_PER_OUNCE = 28.349523125;

const GRAMS_PER_UNIT: Record<MassUnit, number> = {
  troy_ounce: GRAMS_PER_TROY_OUNCE,
  ounce: GRAMS_PER_OUNCE,
  gram: 1,
  kilogram: 1000,
};

/** Currency step: price in source currency → target currency. */
export function convertCurrency(price: number, fxRate: number): number {
  if (!(fxRate > 0)) throw new Error('Invalid exchange rate');
  return price * fxRate;
}

/** Unit step: price per `unit` → price per gram. */
export function toPerGram(price: number, unit: MassUnit): number {
  return price / GRAMS_PER_UNIT[unit];
}

/** Market price → currency conversion → unit conversion → target/gram. */
export function marketToPerGram(price: number, unit: MassUnit, fxRate: number): number {
  return toPerGram(convertCurrency(price, fxRate), unit);
}
