import { expect, test } from './fixtures.ts';
import { expectLineItems } from './assertions.ts';
import { sumCents, taxCents, usd } from './data/money.ts';
import { products } from './data/products.ts';
import { customer, type Customer } from './data/users.ts';

test('a customer buys two products end to end', async ({
  page,
  header,
  inventoryPage,
  cartPage,
  checkoutInfoPage,
  checkoutOverviewPage,
  checkoutCompletePage,
}) => {
  // 29.99 + 9.99 adds up without a float artefact in JavaScript; sums that do not are BUG-UI-01.
  const order = [products.backpack, products.bikeLight];
  const itemTotal = sumCents(order);
  const tax = taxCents(itemTotal);

  await test.step('add the products and start checkout', async () => {
    await inventoryPage.goto();
    for (const product of order) await inventoryPage.addToCart(product);
    await header.openCart();
    await expectLineItems(cartPage.items, order);
    await cartPage.checkout();
    await expect(page).toHaveURL('/checkout-step-one.html');
  });

  await test.step('enter customer information', async () => {
    await checkoutInfoPage.fill(customer);
    await checkoutInfoPage.submit();
    await expect(page).toHaveURL('/checkout-step-two.html');
  });

  await test.step('overview shows the order and its totals', async () => {
    await expectLineItems(checkoutOverviewPage.items, order);
    await expect(checkoutOverviewPage.itemTotal).toHaveText(`Item total: ${usd(itemTotal)}`);
    await expect(checkoutOverviewPage.tax).toHaveText(`Tax: ${usd(tax)}`);
    await expect(checkoutOverviewPage.total).toHaveText(`Total: ${usd(itemTotal + tax)}`);
  });

  await test.step('finish confirms the order and empties the cart', async () => {
    await checkoutOverviewPage.finish();
    await expect(page).toHaveURL('/checkout-complete.html');
    await expect(checkoutCompletePage.header).toHaveText('Thank you for your order!');
    await expect(header.cartBadge).toBeHidden();
  });

  await test.step('Back Home returns to an empty-cart inventory', async () => {
    await checkoutCompletePage.backHome();
    await expect(page).toHaveURL('/inventory.html');
    for (const product of order) await expect(inventoryPage.cartButton(product)).toHaveText('Add to cart');
    await expect(header.cartBadge).toBeHidden();
  });
});

test.describe('checkout information', () => {
  test.beforeEach(async ({ page, header, inventoryPage, cartPage }) => {
    await inventoryPage.goto();
    await inventoryPage.addToCart(products.backpack);
    await header.openCart();
    await cartPage.checkout();
    await expect(page).toHaveURL('/checkout-step-one.html');
  });

  const missingFields: { field: string; input: Customer; error: string }[] = [
    { field: 'First Name', input: { ...customer, firstName: '' }, error: 'Error: First Name is required' },
    { field: 'Last Name', input: { ...customer, lastName: '' }, error: 'Error: Last Name is required' },
    { field: 'Postal Code', input: { ...customer, postalCode: '' }, error: 'Error: Postal Code is required' },
  ];

  for (const { field, input, error } of missingFields) {
    test(`requires ${field}`, async ({ page, checkoutInfoPage }) => {
      await checkoutInfoPage.fill(input);
      await checkoutInfoPage.submit();

      await expect(checkoutInfoPage.error).toHaveText(error);
      await expect(page).toHaveURL('/checkout-step-one.html');
    });
  }
});
