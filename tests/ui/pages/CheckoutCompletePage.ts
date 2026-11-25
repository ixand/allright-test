import type { Locator, Page } from '@playwright/test';

/** Order confirmation, /checkout-complete.html. */
export class CheckoutCompletePage {
  readonly page: Page;
  readonly container: Locator;
  readonly heading: Locator;
  readonly backHomeButton: Locator;

  constructor(page: Page) {
    this.page = page;
    this.container = page.getByTestId('checkout-complete-container');
    this.heading = page.getByTestId('complete-header');
    this.backHomeButton = page.getByTestId('back-to-products');
  }

  async backHome(): Promise<void> {
    await this.backHomeButton.click();
  }
}
