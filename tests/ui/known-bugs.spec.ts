import { expect, test } from './fixtures.ts';
import { expectLineItems } from './assertions.ts';
import { sumCents, usd } from './data/money.ts';
import { products } from './data/products.ts';
import { customer, type Customer } from './data/users.ts';

// Each test asserts the correct behaviour and is expected to fail until its bug is fixed.
// When one starts passing, Playwright reports it as failed: drop test.fail() and close the bug.

test(
  'BUG-UI-01: the overview rounds the item total to cents',
  { tag: '@bug' },
  async ({ page, header, inventoryPage, cartPage, checkoutInfoPage, checkoutOverviewPage }) => {
    test.fail(
      true,
      'BUG-UI-01: item total is the raw float sum, "Item total: $57.980000000000004" for Fleece Jacket + Onesie',
    );
    const order = [products.fleeceJacket, products.onesie];

    await inventoryPage.goto();
    for (const product of order) await inventoryPage.addToCart(product);
    await header.openCart();
    await cartPage.checkout();
    await checkoutInfoPage.fill(customer);
    await checkoutInfoPage.submit();
    await expect(page).toHaveURL('/checkout-step-two.html');
    await expectLineItems(checkoutOverviewPage.items, order);

    await expect(checkoutOverviewPage.itemTotal).toHaveText(`Item total: ${usd(sumCents(order))}`);
  },
);

test(
  'BUG-UI-02: an empty cart offers no way to check out',
  { tag: '@bug' },
  async ({ page, header, cartPage }) => {
    test.fail(
      true,
      'BUG-UI-02: Checkout stays enabled on an empty cart and the order is confirmed with "Total: $0.00"',
    );

    await cartPage.goto();
    await expect(cartPage.title).toHaveText('Your Cart');
    await expect(cartPage.continueShoppingButton).toBeVisible();
    await expect(cartPage.items).toHaveCount(0);
    await expect(header.cartBadge).toBeHidden();

    // Hiding or disabling Checkout would both fix the defect, so only a visible, enabled button fails.
    const enabledCheckout = cartPage.checkoutButton.and(page.getByRole('button', { disabled: false }));
    await expect(enabledCheckout).toHaveCount(0);
  },
);

const whitespaceOnly: { field: string; input: Customer; error: string }[] = [
  { field: 'First Name', input: { ...customer, firstName: '   ' }, error: 'Error: First Name is required' },
  { field: 'Last Name', input: { ...customer, lastName: '   ' }, error: 'Error: Last Name is required' },
  {
    field: 'Postal Code',
    input: { ...customer, postalCode: '   ' },
    error: 'Error: Postal Code is required',
  },
];

for (const { field, input, error } of whitespaceOnly) {
  test(
    `BUG-UI-03: a whitespace-only ${field} is rejected like an empty one`,
    { tag: '@bug' },
    async ({ page, header, inventoryPage, cartPage, checkoutInfoPage, checkoutOverviewPage }) => {
      test.fail(true, `BUG-UI-03: "   " passes the ${field} check and checkout moves on to the overview`);

      await inventoryPage.goto();
      await inventoryPage.addToCart(products.backpack);
      await header.openCart();
      await cartPage.checkout();
      await expect(page).toHaveURL('/checkout-step-one.html');
      await checkoutInfoPage.fill(input);
      await expect(checkoutInfoPage.firstName).toHaveValue(input.firstName);
      await expect(checkoutInfoPage.lastName).toHaveValue(input.lastName);
      await expect(checkoutInfoPage.postalCode).toHaveValue(input.postalCode);

      await checkoutInfoPage.submit();
      // Wait for whichever outcome renders; a URL check straight after the click could pass before navigation.
      await expect(checkoutInfoPage.error.or(checkoutOverviewPage.finishButton)).toBeVisible();
      await expect(page, 'whitespace-only input must keep the customer on step one').toHaveURL(
        '/checkout-step-one.html',
      );
      await expect(checkoutInfoPage.error).toHaveText(error);
    },
  );
}

test(
  'BUG-UI-04: Reset App State also resets the product buttons',
  { tag: '@bug' },
  async ({ header, inventoryPage }) => {
    test.fail(
      true,
      'BUG-UI-04: after Reset App State the cart is empty but product buttons keep saying "Remove" until a reload',
    );
    const added = [products.backpack, products.boltTShirt];

    await inventoryPage.goto();
    for (const product of added) await inventoryPage.addToCart(product);
    await expect(header.cartBadge).toHaveText('2');
    for (const product of added) await expect(inventoryPage.cartButton(product)).toHaveText('Remove');

    await header.resetAppState();
    await expect(header.cartBadge).toBeHidden();

    for (const product of added) await expect(inventoryPage.cartButton(product)).toHaveText('Add to cart');
  },
);
