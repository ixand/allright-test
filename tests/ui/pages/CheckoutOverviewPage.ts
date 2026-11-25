import type { Locator, Page } from '@playwright/test';

/** Checkout step two, /checkout-step-two.html. */
export class CheckoutOverviewPage {
  readonly page: Page;
  readonly items: Locator;
  readonly itemTotal: Locator;
  readonly tax: Locator;
  readonly total: Locator;
  readonly finishButton: Locator;

  constructor(page: Page) {
    this.page = page;
    this.items = page.getByTestId('cart-list').getByTestId('inventory-item');
    this.itemTotal = page.getByTestId('subtotal-label');
    this.tax = page.getByTestId('tax-label');
    this.total = page.getByTestId('total-label');
    this.finishButton = page.getByTestId('finish');
  }

  async finish(): Promise<void> {
    await this.finishButton.click();
  }
}
