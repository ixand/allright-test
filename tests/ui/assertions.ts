import type { Locator } from '@playwright/test';
import { expect, test } from './fixtures.ts';
import { usd } from './data/money.ts';
import type { Product } from './data/products.ts';

/**
 * Asserts that a cart-style list (cart page, checkout overview) holds exactly `expected`, each once,
 * with its catalog name and price. Row order is not asserted because the shop does not define it.
 */
export async function expectLineItems(items: Locator, expected: readonly Product[]): Promise<void> {
  const title = `line items are: ${expected.map((product) => product.name).join(', ')}`;
  // Boxed, so a failure is reported at the spec line that called this helper.
  await test.step(
    title,
    async () => {
      await expect(items).toHaveCount(expected.length);
      for (const product of expected) {
        const row = items.filter({ has: items.page().getByTestId(`item-${product.id}-title-link`) });
        await expect(row.getByTestId('inventory-item-name')).toHaveText(product.name);
        await expect(row.getByTestId('inventory-item-price')).toHaveText(usd(product.priceCents));
        await expect(row.getByTestId('item-quantity')).toHaveText('1');
      }
    },
    { box: true },
  );
}
