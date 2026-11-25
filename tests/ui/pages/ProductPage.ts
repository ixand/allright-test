import type { Locator, Page } from '@playwright/test';

/** Product details page, /inventory-item.html?id=<id>. */
export class ProductPage {
  readonly page: Page;
  readonly name: Locator;
  readonly price: Locator;

  constructor(page: Page) {
    this.page = page;
    this.name = page.getByTestId('inventory-item-name');
    this.price = page.getByTestId('inventory-item-price');
  }
}
