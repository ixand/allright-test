import type { Locator, Page } from '@playwright/test';
import type { Product } from '../data/products.ts';

export class InventoryPage {
  readonly page: Page;
  readonly title: Locator;
  readonly list: Locator;
  readonly itemNames: Locator;
  readonly itemPrices: Locator;
  readonly sortSelect: Locator;
  readonly activeSortOption: Locator;

  constructor(page: Page) {
    this.page = page;
    this.title = page.getByTestId('title');
    this.list = page.getByTestId('inventory-list');
    this.itemNames = this.list.getByTestId('inventory-item-name');
    this.itemPrices = this.list.getByTestId('inventory-item-price');
    this.sortSelect = page.getByTestId('product-sort-container');
    this.activeSortOption = page.getByTestId('active-option');
  }

  async goto(): Promise<void> {
    await this.page.goto('/inventory.html');
  }

  async sortBy(label: string): Promise<void> {
    await this.sortSelect.selectOption({ label });
  }

  async addToCart(product: Product): Promise<void> {
    await this.page.getByTestId(`add-to-cart-${product.slug}`).click();
  }

  async openDetails(product: Product): Promise<void> {
    await this.page.getByTestId(`item-${product.id}-title-link`).click();
  }

  /** The product's cart button in either state; its test id changes from add-to-cart-* to remove-*. */
  cartButton(product: Product): Locator {
    return this.page
      .getByTestId(`add-to-cart-${product.slug}`)
      .or(this.page.getByTestId(`remove-${product.slug}`));
  }
}
