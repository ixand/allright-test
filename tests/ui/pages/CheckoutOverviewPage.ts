import type { Locator, Page } from '@playwright/test';

/** Checkout step two, /checkout-step-two.html. */
export class CheckoutOverviewPage {
  readonly page: Page;
  readonly items: Locator;
  readonly itemTotal: Locator;
  readonly tax: Locator;
  readonly total: Locator;
  readonly finishButton: Locator;
  /** Finish as a customer can use it: shown and not disabled, natively or through aria-disabled. */
  readonly usableFinishButton: Locator;
  readonly container: Locator;

  constructor(page: Page) {
    this.page = page;
    this.items = page.getByTestId('cart-list').getByTestId('inventory-item');
    this.itemTotal = page.getByTestId('subtotal-label');
    this.tax = page.getByTestId('tax-label');
    this.total = page.getByTestId('total-label');
    this.finishButton = page.getByTestId('finish');
    this.usableFinishButton = this.finishButton.and(page.getByRole('button', { disabled: false }));
    this.container = page.getByTestId('checkout-summary-container');
  }

  async finish(): Promise<void> {
    await this.finishButton.click();
  }

  /**
   * Clicks Finish only if the overview is open and offers it; otherwise does nothing. Call it right after
   * the click that may have opened the overview: the page state is read once.
   */
  async finishIfOffered(): Promise<void> {
    if (new URL(this.page.url()).pathname !== '/checkout-step-two.html') return;
    // The URL changes before the page renders. Once this page's own container is on screen, Finish is
    // either rendered or absent for good.
    await this.container.waitFor();
    if ((await this.usableFinishButton.count()) > 0) await this.usableFinishButton.click();
  }
}
