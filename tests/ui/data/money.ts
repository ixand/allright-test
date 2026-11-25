import type { Product } from './products.ts';

/** Renders integer cents the way the shop prints money: 2999 -> "$29.99". */
export function usd(cents: number): string {
  return `$${Math.floor(cents / 100)}.${String(cents % 100).padStart(2, '0')}`;
}

export function sumCents(items: readonly Product[]): number {
  return items.reduce((total, item) => total + item.priceCents, 0);
}

// The shop publishes no tax rule. 8% rounded to the cent is the rate stated in the task brief and
// observed on the overview page (item total $57.98 -> tax $4.64).
export const TAX_PERCENT = 8;

export function taxCents(itemTotalCents: number): number {
  return Math.round((itemTotalCents * TAX_PERCENT) / 100);
}
