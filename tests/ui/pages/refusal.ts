import type { Locator } from '@playwright/test';

/**
 * `container` (a page's main block) while that page refuses to let the customer go on: `action` is not
 * rendered, hidden or disabled, or the page shows the shop's error banner. It is a state of the page, so
 * a test can wait for it instead of reading the page once.
 */
export function refusing(container: Locator, action: Locator): Locator {
  const error = container.page().getByTestId('error');
  return container.filter({ hasNot: action }).or(container.filter({ has: error }));
}
