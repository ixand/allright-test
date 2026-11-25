import type { Locator, Page } from '@playwright/test';
import type { Customer } from '../data/users.ts';
import { refusing } from './refusal.ts';

/** Checkout step one, /checkout-step-one.html. */
export class CheckoutInfoPage {
  readonly page: Page;
  readonly firstName: Locator;
  readonly lastName: Locator;
  readonly postalCode: Locator;
  readonly continueButton: Locator;
  /** Continue as a customer can use it: shown and not disabled, natively or through aria-disabled. */
  readonly usableContinueButton: Locator;
  readonly error: Locator;
  readonly container: Locator;
  /** Step one while it refuses to go on to the overview, see `refusing()`. */
  readonly blocked: Locator;

  constructor(page: Page) {
    this.page = page;
    this.firstName = page.getByTestId('firstName');
    this.lastName = page.getByTestId('lastName');
    this.postalCode = page.getByTestId('postalCode');
    this.continueButton = page.getByTestId('continue');
    this.usableContinueButton = this.continueButton.and(page.getByRole('button', { disabled: false }));
    this.error = page.getByTestId('error');
    this.container = page.getByTestId('checkout-info-container');
    this.blocked = refusing(this.container, this.usableContinueButton);
  }

  // Not called fill(): playwright/prefer-locator matches calls by name and would take
  // checkoutInfoPage.fill() for the discouraged Page.fill().
  async enterDetails(customer: Customer): Promise<void> {
    await this.firstName.fill(customer.firstName);
    await this.lastName.fill(customer.lastName);
    await this.postalCode.fill(customer.postalCode);
  }

  async submit(): Promise<void> {
    await this.continueButton.click();
  }

  /**
   * Enters the details and continues only if step one is on screen and offers Continue; otherwise does
   * nothing. The page is read once, so call it only after a wait has settled which page is on screen.
   */
  async continueIfOffered(customer: Customer): Promise<void> {
    if (!(await this.usableContinueButton.isVisible())) return;
    await this.enterDetails(customer);
    await this.usableContinueButton.click();
  }
}
