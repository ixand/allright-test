import type { Locator, Page } from '@playwright/test';

/** Order confirmation, /checkout-complete.html. */
export class CheckoutCompletePage {
  readonly page: Page;
  readonly header: Locator;
  readonly backHomeButton: Locator;

  constructor(page: Page) {
    this.page = page;
    this.header = page.getByTestId('complete-header');
    this.backHomeButton = page.getByTestId('back-to-products');
  }

  async backHome(): Promise<void> {
    await this.backHomeButton.click();
  }
}
