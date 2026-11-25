import type { Locator, Page } from '@playwright/test';
import type { Product } from '../data/products.ts';

export class CartPage {
  readonly page: Page;
  readonly title: Locator;
  readonly items: Locator;
  readonly continueShoppingButton: Locator;
  readonly checkoutButton: Locator;
  /** Checkout as a customer can use it: shown and not disabled, natively or through aria-disabled. */
  readonly usableCheckoutButton: Locator;

  constructor(page: Page) {
    this.page = page;
    this.title = page.getByTestId('title');
    this.items = page.getByTestId('cart-list').getByTestId('inventory-item');
    this.continueShoppingButton = page.getByTestId('continue-shopping');
    this.checkoutButton = page.getByTestId('checkout');
    this.usableCheckoutButton = this.checkoutButton.and(page.getByRole('button', { disabled: false }));
  }

  async goto(): Promise<void> {
    await this.page.goto('/cart.html');
  }

  async remove(product: Product): Promise<void> {
    await this.page.getByTestId(`remove-${product.slug}`).click();
  }

  async checkout(): Promise<void> {
    await this.checkoutButton.click();
  }

  /**
   * Clicks Checkout only if the cart offers it; a hidden or disabled button is left alone. Call it on a
   * cart that has finished rendering (e.g. after asserting its rows): the button state is read once.
   */
  async checkoutIfOffered(): Promise<void> {
    // Checkout renders in the same footer as Continue Shopping: once that is visible, Checkout is either
    // on screen or not rendered at all.
    await this.continueShoppingButton.waitFor();
    if ((await this.usableCheckoutButton.count()) > 0) await this.usableCheckoutButton.click();
  }
}
