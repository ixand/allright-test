import { expect, test } from './fixtures.ts';
import { expectLineItems } from './assertions.ts';
import { sumCents, taxCents, usd } from './data/money.ts';
import { products } from './data/products.ts';
import { customer, type Customer } from './data/users.ts';
import { parkedOn } from '../support/knownBug.ts';

// Each test asserts the correct behaviour. Its controls run first, as plain assertions, so a broken path
// still fails for real; parkedOn() covers only the bug assertions. While the bug is open the test is
// skipped with a `parked` note; once it is fixed the test passes with a `parked-fixed` note: move the
// assertions out of parkedOn() and close the bug.

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

    await parkedOn(
      'BUG-UI-01',
      'the item total is the raw float sum, "Item total: $57.980000000000004" for Fleece Jacket + Onesie',
      async () => {
        await expect(checkoutOverviewPage.itemTotal).toHaveText(`Item total: ${usd(itemTotal)}`);
      },
    );
  },
);

test(
  'BUG-UI-02: an empty cart cannot end in a confirmed order',
  {
    tag: '@bug',
    annotation: { type: 'issue', description: 'https://github.com/ixand/allright-test#bug-ui-02' },
  },
  async ({
    page,
    header,
    inventoryPage,
    cartPage,
    checkoutInfoPage,
    checkoutOverviewPage,
    checkoutCompletePage,
  }) => {
    await inventoryPage.goto();
    await inventoryPage.addToCart(products.backpack);
    await cartPage.goto();
    await expectLineItems(cartPage.items, [products.backpack]);
    // The journey below decides by these locators, so they must tell a cart that offers checkout from one
    // that does not while the answer is known: with an item in it, the cart offers checkout.
    await expect(cartPage.usableCheckoutButton).toBeVisible();
    await expect(cartPage.blocked).toBeHidden();

    await cartPage.remove(products.backpack);
    await expect(cartPage.items).toHaveCount(0);
    await expect(header.cartBadge).toBeHidden();
    await expect(header.title).toHaveText('Your Cart');
    await expect(cartPage.continueShoppingButton).toBeVisible();

    // Go as far as the shop lets an empty cart go. Stopping it at any step fixes the bug, and a stop is a
    // state the test can wait for: the cart, step one or the overview on screen with its button hidden or
    // disabled or with an error shown, or the customer sent back to the product list.
    // Each click is followed by a wait for the next page or a stop. Both are states that only appear, so
    // the wait cannot be satisfied by the page the click was made on, and the *IfOffered() read that
    // follows sees a page that has settled.
    // Not recognised: a click that is ignored without any message. No state tells it from a click whose
    // page has not opened yet, so the wait after it times out and the test fails before parkedOn(): it
    // is reported as failed, not as fixed, and never as passed.
    const stopped = cartPage.blocked
      .or(checkoutInfoPage.blocked)
      .or(checkoutOverviewPage.blocked)
      .or(inventoryPage.list);
    await cartPage.checkoutIfOffered();
    await expect(
      checkoutInfoPage.container.or(stopped),
      'after Checkout: step one opens, or the shop visibly stops the empty cart',
    ).toBeVisible();
    await checkoutInfoPage.continueIfOffered(customer);
    await expect(
      checkoutOverviewPage.container.or(stopped),
      'after Continue: the overview opens, or the shop visibly stops the empty cart',
    ).toBeVisible();
    await checkoutOverviewPage.finishIfOffered();
    await expect(
      checkoutCompletePage.container.or(stopped),
      'after Finish: the order is confirmed, or the shop visibly stops the empty cart',
    ).toBeVisible();

    await parkedOn(
      'BUG-UI-02',
      'Checkout stays enabled on an empty cart and opens checkout; Finish then confirms an order with "Total: $0.00"',
      async () => {
        // The wait above ended on the confirmation or on a stop, so the journey is over and this is not a
        // check that can pass just because the last click has not taken effect yet.
        await expect(page, 'an empty cart must not end in a confirmed order').not.toHaveURL(
          '/checkout-complete.html',
        );
        await expect(checkoutCompletePage.container).toBeHidden();
      },
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
      // A fix that disables Continue for such input is not handled: this control then fails, and the test
      // is reported as failed, not as fixed. That is the moment to rewrite the bug assertions below.
      await expect(checkoutInfoPage.continueButton).toBeEnabled();
      await checkoutInfoPage.submit();
      // Either outcome proves the submit went through: an error on step one, or the overview.
      await expect(checkoutInfoPage.error.or(checkoutOverviewPage.finishButton)).toBeVisible();

      // Any wording is a valid fix, as long as the customer stays on step one and is told which field is
      // wrong. Naming the field is part of the expectation because the title says "like an empty one", and
      // an empty field gets "Error: <field> is required". An error that names no field keeps this test
      // parked, on purpose.
      await parkedOn(
        'BUG-UI-03',
        `"   " passes the ${field} check and checkout moves on to the overview`,
        async () => {
          await expect(page, 'whitespace-only input must keep the customer on step one').toHaveURL(
            '/checkout-step-one.html',
          );
          await expect(checkoutInfoPage.error).toBeVisible();
          await expect(
            checkoutInfoPage.error,
            `the error must name ${field}, as the error for an empty ${field} does`,
          ).toHaveText(named);
        },
      );
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

    await parkedOn(
      'BUG-UI-04',
      'after Reset App State the cart is empty but product buttons keep saying "Remove" until a reload',
      async () => {
        for (const product of added)
          await expect(inventoryPage.cartButton(product)).toHaveText('Add to cart');
      },
    );
  },
);
