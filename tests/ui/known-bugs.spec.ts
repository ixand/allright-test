import { expect, test } from './fixtures.ts';
import { expectLineItems } from './assertions.ts';
import { sumCents, taxCents, usd } from './data/money.ts';
import { products } from './data/products.ts';
import { customer, type Customer } from './data/users.ts';

// Each test asserts the correct behaviour. Its controls run first, so a broken path still fails for real;
// test.fail() comes after them and covers only the bug assertion. Once a bug is fixed, the test reports
// "Expected to fail, but passed": drop test.fail() and close the bug.

test(
  'BUG-UI-01: the overview rounds the item total to cents',
  {
    tag: '@bug',
    annotation: { type: 'issue', description: 'https://github.com/ixand/allright-test#bug-ui-01' },
  },
  async ({ page, header, inventoryPage, cartPage, checkoutInfoPage, checkoutOverviewPage }) => {
    const order = [products.fleeceJacket, products.onesie];
    const itemTotal = sumCents(order);
    const tax = taxCents(itemTotal);

    await inventoryPage.goto();
    for (const product of order) await inventoryPage.addToCart(product);
    await header.openCart();
    await cartPage.checkout();
    await checkoutInfoPage.enterDetails(customer);
    await checkoutInfoPage.submit();
    await expect(page).toHaveURL('/checkout-step-two.html');
    await expectLineItems(checkoutOverviewPage.items, order);
    // Tax and total are derived from the same sum and rounded correctly; only the item total line is not.
    await expect(checkoutOverviewPage.tax).toHaveText(`Tax: ${usd(tax)}`);
    await expect(checkoutOverviewPage.total).toHaveText(`Total: ${usd(itemTotal + tax)}`);
    await expect(checkoutOverviewPage.itemTotal).toHaveText(/^Item total: \$/);

    test.fail(
      true,
      'BUG-UI-01: the item total is the raw float sum, "Item total: $57.980000000000004" for Fleece Jacket + Onesie',
    );

    await expect(checkoutOverviewPage.itemTotal).toHaveText(`Item total: ${usd(itemTotal)}`);
  },
);

test(
  'BUG-UI-02: an empty cart offers no way to check out',
  {
    tag: '@bug',
    annotation: { type: 'issue', description: 'https://github.com/ixand/allright-test#bug-ui-02' },
  },
  async ({ page, header, inventoryPage, cartPage, checkoutInfoPage, checkoutOverviewPage }) => {
    await inventoryPage.goto();
    await inventoryPage.addToCart(products.backpack);
    await cartPage.goto();
    await expectLineItems(cartPage.items, [products.backpack]);
    // checkoutIfOffered() decides by this locator, so it must find the real button while the cart has an item.
    await expect(cartPage.usableCheckoutButton).toBeVisible();

    await cartPage.remove(products.backpack);
    await expect(cartPage.items).toHaveCount(0);
    await expect(header.cartBadge).toBeHidden();
    await expect(cartPage.title).toHaveText('Your Cart');
    await expect(cartPage.continueShoppingButton).toBeVisible();
    // Go as far as the shop lets an empty cart go. Stopping it at any step fixes the bug: Checkout hidden,
    // disabled, refused or sent elsewhere, or step one or the overview refusing to go on.
    await cartPage.checkoutIfOffered();
    await checkoutInfoPage.continueIfOffered(customer);
    await checkoutOverviewPage.finishIfOffered();
    await expect(header.cartLink, 'the customer is still in the shop').toBeVisible();

    test.fail(
      true,
      'BUG-UI-02: Checkout stays enabled on an empty cart and opens checkout; Finish then confirms an order with "Total: $0.00"',
    );

    // The URL changes before the next page renders, so the URL, not the page content, is the reliable
    // sign of whether Finish confirmed an order.
    await expect(page, 'an empty cart must not end in a confirmed order').not.toHaveURL(
      '/checkout-complete.html',
    );
  },
);

// An error names the field if it uses the form's wording: the placeholder or the empty-field error.
const whitespaceOnly: { field: string; input: Customer; named: RegExp }[] = [
  { field: 'First Name', input: { ...customer, firstName: '   ' }, named: /first name/i },
  { field: 'Last Name', input: { ...customer, lastName: '   ' }, named: /last name/i },
  { field: 'Postal Code', input: { ...customer, postalCode: '   ' }, named: /postal code|zip/i },
];

for (const { field, input, named } of whitespaceOnly) {
  test(
    `BUG-UI-03: a whitespace-only ${field} is rejected like an empty one`,
    {
      tag: '@bug',
      annotation: { type: 'issue', description: 'https://github.com/ixand/allright-test#bug-ui-03' },
    },
    async ({ page, header, inventoryPage, cartPage, checkoutInfoPage, checkoutOverviewPage }) => {
      await inventoryPage.goto();
      await inventoryPage.addToCart(products.backpack);
      await header.openCart();
      await cartPage.checkout();
      await expect(page).toHaveURL('/checkout-step-one.html');
      await checkoutInfoPage.enterDetails(input);
      await expect(checkoutInfoPage.firstName).toHaveValue(input.firstName);
      await expect(checkoutInfoPage.lastName).toHaveValue(input.lastName);
      await expect(checkoutInfoPage.postalCode).toHaveValue(input.postalCode);
      await checkoutInfoPage.submit();
      // Either outcome proves the submit went through: an error on step one, or the overview.
      await expect(checkoutInfoPage.error.or(checkoutOverviewPage.finishButton)).toBeVisible();

      test.fail(true, `BUG-UI-03: "   " passes the ${field} check and checkout moves on to the overview`);

      // Any wording is a valid fix, as long as the customer stays on step one and is told which field is wrong.
      await expect(page, 'whitespace-only input must keep the customer on step one').toHaveURL(
        '/checkout-step-one.html',
      );
      await expect(checkoutInfoPage.error).toBeVisible();
      await expect(checkoutInfoPage.error, `the error must name ${field}`).toHaveText(named);
    },
  );
}

test(
  'BUG-UI-04: Reset App State also resets the product buttons',
  {
    tag: '@bug',
    annotation: { type: 'issue', description: 'https://github.com/ixand/allright-test#bug-ui-04' },
  },
  async ({ header, inventoryPage }) => {
    const added = [products.backpack, products.boltTShirt];

    await inventoryPage.goto();
    for (const product of added) await inventoryPage.addToCart(product);
    await expect(header.cartBadge).toHaveText('2');
    for (const product of added) await expect(inventoryPage.cartButton(product)).toHaveText('Remove');
    await header.resetAppState();
    await expect(header.cartBadge).toBeHidden();
    for (const product of added) await expect(inventoryPage.cartButton(product)).toBeVisible();

    test.fail(
      true,
      'BUG-UI-04: after Reset App State the cart is empty but product buttons keep saying "Remove" until a reload',
    );

    for (const product of added) await expect(inventoryPage.cartButton(product)).toHaveText('Add to cart');
  },
);
