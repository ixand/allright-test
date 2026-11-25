import { test, expect } from '@playwright/test';

test('TC-GEN-02 Cancel on the checkout overview keeps the cart', async ({
  page,
}) => {
  await page.goto('/');

  await test.step('Log in as standard_user with the password secret_sauce.', async () => {
    await page.getByTestId('username').fill('standard_user');
    await page.getByTestId('password').fill('secret_sauce');
    await page.getByTestId('login-button').click();
    await expect(page).toHaveURL('/inventory.html');
    await expect(page.getByTestId('title')).toHaveText('Products');
  });

  await test.step('Add "Sauce Labs Backpack" to the cart.', async () => {
    await page.getByTestId('add-to-cart-sauce-labs-backpack').click();
    await expect(page.getByTestId('remove-sauce-labs-backpack')).toHaveText(
      'Remove',
    );
  });

  await test.step('Open the cart and click "Checkout".', async () => {
    await page.getByTestId('shopping-cart-link').click();
    await expect(page.getByTestId('title')).toHaveText('Your Cart');
    await page.getByTestId('checkout').click();
    await expect(page.getByTestId('title')).toHaveText(
      'Checkout: Your Information',
    );
  });

  await test.step('Enter first name "John", last name "Doe", postal code "12345" and click "Continue".', async () => {
    await page.getByTestId('firstName').fill('John');
    await page.getByTestId('lastName').fill('Doe');
    await page.getByTestId('postalCode').fill('12345');
    await page.getByTestId('continue').click();
    await expect(page.getByTestId('title')).toHaveText('Checkout: Overview');
  });

  await test.step('On the overview page, click "Cancel".', async () => {
    await page.getByTestId('cancel').click();
    await expect(page.getByTestId('title')).toHaveText('Products');
    await expect(page).toHaveURL('/inventory.html');
    await expect(page.getByTestId('shopping-cart-badge')).toHaveText('1');
  });
});
