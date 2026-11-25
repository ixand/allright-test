import type { Locator, Page } from '@playwright/test';
import type { Product } from '../data/products.ts';
import { refusing } from './refusal.ts';

export class CartPage {
  readonly page: Page;
  readonly container: Locator;
  readonly items: Locator;
  readonly continueShoppingButton: Locator;
  readonly checkoutButton: Locator;
  /** Checkout as a customer can use it: shown and not disabled, natively or through aria-disabled. */
  readonly usableCheckoutButton: Locator;
  /** The cart while it refuses to start checkout, see `refusing()`. */
  readonly blocked: Locator;

  constructor(page: Page) {
    this.page = page;
    this.container = page.getByTestId('cart-contents-container');
    this.items = page.getByTestId('cart-list').getByTestId('inventory-item');
    this.continueShoppingButton = page.getByTestId('continue-shopping');
    this.checkoutButton = page.getByTestId('checkout');
    this.usableCheckoutButton = this.checkoutButton.and(page.getByRole('button', { disabled: false }));
    this.blocked = refusing(this.container, this.usableCheckoutButton);
  }

  async goto(): Promise<void> {
    await this.page.goto('/cart.html', { waitUntil: 'domcontentloaded' });
  }

  async remove(product: Product): Promise<void> {
    await this.page.getByTestId(`remove-${product.slug}`).click();
  }

  async checkout(): Promise<void> {
    await this.checkoutButton.click();
  }

  /**
   * Clicks Checkout only if the cart offers it; a hidden or disabled button is left alone. The button
   * state is read once, so call it on a cart that has finished rendering (e.g. after asserting its rows).
   */
  async checkoutIfOffered(): Promise<void> {
    // Checkout renders in the same block as the rows: once the block is on screen, Checkout is either
    // rendered or absent for good.
    await this.container.waitFor();
    if (await this.usableCheckoutButton.isVisible()) await this.usableCheckoutButton.click();
  }
}
