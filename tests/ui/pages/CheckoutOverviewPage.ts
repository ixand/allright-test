import type { Locator, Page } from '@playwright/test';
import { refusing } from './refusal.ts';

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
  /** The overview while it refuses to confirm the order, see `refusing()`. */
  readonly blocked: Locator;

  constructor(page: Page) {
    this.page = page;
    this.items = page.getByTestId('cart-list').getByTestId('inventory-item');
    this.itemTotal = page.getByTestId('subtotal-label');
    this.tax = page.getByTestId('tax-label');
    this.total = page.getByTestId('total-label');
    this.finishButton = page.getByTestId('finish');
    this.usableFinishButton = this.finishButton.and(page.getByRole('button', { disabled: false }));
    this.container = page.getByTestId('checkout-summary-container');
    this.blocked = refusing(this.container, this.usableFinishButton);
  }

  async finish(): Promise<void> {
    await this.finishButton.click();
  }

  /**
   * Clicks Finish only if the overview is on screen and offers it; otherwise does nothing. The page is
   * read once, so call it only after a wait has settled which page is on screen.
   */
  async finishIfOffered(): Promise<void> {
    if (await this.usableFinishButton.isVisible()) await this.usableFinishButton.click();
  }
}
