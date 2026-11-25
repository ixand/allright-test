import type { Locator } from '@playwright/test';
import type { Product } from '../data/products.ts';

/** The row of a cart-style list (cart page, checkout overview) that holds `product`. */
export class LineItem {
  readonly name: Locator;
  readonly price: Locator;
  readonly quantity: Locator;

  /** @param items every row of the list, e.g. `cartPage.items` */
  constructor(items: Locator, product: Product) {
    // The title link is the only part of a row that carries the product id.
    const row = items.filter({ has: items.page().getByTestId(`item-${product.id}-title-link`) });
    this.name = row.getByTestId('inventory-item-name');
    this.price = row.getByTestId('inventory-item-price');
    this.quantity = row.getByTestId('item-quantity');
  }
}
