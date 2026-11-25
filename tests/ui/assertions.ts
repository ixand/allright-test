import type { Locator } from '@playwright/test';
import { expect, test } from './fixtures.ts';
import { usd } from './data/money.ts';
import type { Product } from './data/products.ts';
import { LineItem } from './pages/LineItem.ts';

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
        const item = new LineItem(items, product);
        await expect(item.name).toHaveText(product.name);
        await expect(item.price).toHaveText(usd(product.priceCents));
        await expect(item.quantity).toHaveText('1');
      }
    },
    { box: true },
  );
}
