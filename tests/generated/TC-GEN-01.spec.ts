import { test, expect } from '@playwright/test';

test('TC-GEN-01 Add a product to the cart from its details page', async ({ page }) => {
  await test.step('Log in as standard_user with the password secret_sauce.', async () => {
    await page.goto('/');
    await page.getByTestId('username').fill('standard_user');
    await page.getByTestId('password').fill('secret_sauce');
    await page.getByTestId('login-button').click();
    await expect(page.getByTestId('title')).toHaveText('Products');
  });

  await test.step('On the Products page, open the details page of "Sauce Labs Bolt T-Shirt".', async () => {
    await page.getByTestId('item-1-title-link').click();
    await expect(page.getByTestId('back-to-products')).toHaveText('Back to products');
    await expect(page.getByTestId('inventory-item-name')).toHaveText('Sauce Labs Bolt T-Shirt');
  });

  await test.step('Click "Add to cart".', async () => {
    await page.getByTestId('add-to-cart').click();
    await expect(page.getByTestId('remove')).toHaveText('Remove');
    await expect(page.getByTestId('shopping-cart-badge')).toHaveText('1');
  });

  await test.step('Open the cart.', async () => {
    await page.getByTestId('shopping-cart-link').click();
    await expect(page.getByTestId('title')).toHaveText('Your Cart');
    await expect(page.getByTestId('inventory-item')).toHaveCount(1);
    const item = page.getByTestId('inventory-item').filter({ hasText: 'Sauce Labs Bolt T-Shirt' });
    await expect(item.getByTestId('inventory-item-name')).toHaveText('Sauce Labs Bolt T-Shirt');
    await expect(item.getByTestId('inventory-item-price')).toHaveText('$15.99');
  });
});
