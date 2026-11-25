import type { Locator, Page } from '@playwright/test';

/** Product details page, /inventory-item.html?id=<id>. */
export class ProductPage {
  readonly page: Page;
  readonly name: Locator;
  readonly price: Locator;

  constructor(page: Page) {
    this.page = page;
    // The inventory list uses the same item, name and price test ids for all six products, and the list
    // can still be on screen for a moment after the URL has changed to the details page. Only the details
    // item has a cart button without a product slug, so these locators cannot match a list entry.
    const item = page
      .getByTestId('inventory-item')
      .filter({ has: page.getByTestId('add-to-cart').or(page.getByTestId('remove')) });
    this.name = item.getByTestId('inventory-item-name');
    this.price = item.getByTestId('inventory-item-price');
  }
}
