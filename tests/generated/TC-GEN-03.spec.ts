import { test, expect } from '@playwright/test';

const annotation = { type: 'issue', description: 'https://github.com/ixand/allright-test#bug-ui-01' };

test('TC-GEN-03 Overview item total is rounded to cents', { tag: '@bug', annotation }, async ({ page }) => {
  await test.step('Log in as standard_user with the password secret_sauce.', async () => {
    await page.goto('/');
    await page.getByTestId('username').fill('standard_user');
    await page.getByTestId('password').fill('secret_sauce');
    await page.getByTestId('login-button').click();
    await expect(page.getByTestId('title')).toHaveText('Products');
  });

  await test.step('Add "Sauce Labs Fleece Jacket" and "Sauce Labs Onesie" to the cart.', async () => {
    await page.getByTestId('add-to-cart-sauce-labs-fleece-jacket').click();
    await page.getByTestId('add-to-cart-sauce-labs-onesie').click();
    await expect(page.getByTestId('shopping-cart-badge')).toHaveText('2');
  });

  await test.step('Open the cart and click "Checkout".', async () => {
    await page.getByTestId('shopping-cart-link').click();
    await expect(page.getByTestId('title')).toHaveText('Your Cart');
    await page.getByTestId('checkout').click();
    await expect(page.getByTestId('title')).toHaveText('Checkout: Your Information');
  });

  await test.step('Enter first name "John", last name "Doe", postal code "12345" and click "Continue".', async () => {
    await page.getByTestId('firstName').fill('John');
    await page.getByTestId('lastName').fill('Doe');
    await page.getByTestId('postalCode').fill('12345');
    await page.getByTestId('continue').click();
    await expect(page.getByTestId('title')).toHaveText('Checkout: Overview');
    const items = page.getByTestId('inventory-item');
    await expect(items).toHaveCount(2);
    const jacket = items.filter({ hasText: 'Sauce Labs Fleece Jacket' });
    await expect(jacket.getByTestId('inventory-item-name')).toHaveText('Sauce Labs Fleece Jacket');
    await expect(jacket.getByTestId('inventory-item-price')).toHaveText('$49.99');
    const onesie = items.filter({ hasText: 'Sauce Labs Onesie' });
    await expect(onesie.getByTestId('inventory-item-name')).toHaveText('Sauce Labs Onesie');
    await expect(onesie.getByTestId('inventory-item-price')).toHaveText('$7.99');
    await expect(page.getByTestId('tax-label')).toHaveText('Tax: $4.64');
    await expect(page.getByTestId('total-label')).toHaveText('Total: $62.62');
    test.fail(
      true,
      'BUG-UI-01: the item total is the raw float sum, "Item total: $57.980000000000004" for Fleece Jacket + Onesie',
    );
    await expect(page.getByTestId('subtotal-label')).toHaveText('Item total: $57.98');
  });
});
