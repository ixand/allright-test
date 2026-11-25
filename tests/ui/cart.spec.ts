import { expect, test } from './fixtures.ts';
import { expectLineItems } from './assertions.ts';
import { products } from './data/products.ts';

test('the cart lists exactly the added products, and removing one updates cart and badge', async ({
  page,
  header,
  inventoryPage,
  cartPage,
}) => {
  const { backpack, boltTShirt } = products;
  await inventoryPage.goto();
  await expect(inventoryPage.list).toBeVisible();
  await expect(header.cartBadge).toBeHidden();

  await inventoryPage.addToCart(backpack);
  await expect(header.cartBadge).toHaveText('1');
  await inventoryPage.addToCart(boltTShirt);
  await expect(header.cartBadge).toHaveText('2');
  await expect(inventoryPage.cartButton(backpack)).toHaveText('Remove');
  await expect(inventoryPage.cartButton(boltTShirt)).toHaveText('Remove');

  await header.openCart();
  await expect(page).toHaveURL('/cart.html');
  await expect(cartPage.title).toHaveText('Your Cart');
  await expectLineItems(cartPage.items, [backpack, boltTShirt]);

  await cartPage.remove(backpack);
  await expectLineItems(cartPage.items, [boltTShirt]);
  await expect(header.cartBadge).toHaveText('1');
});

test('the cart survives a page reload', async ({ page, header, inventoryPage, cartPage }) => {
  const { onesie, redTShirt } = products;
  await inventoryPage.goto();
  await inventoryPage.addToCart(onesie);
  await inventoryPage.addToCart(redTShirt);
  await expect(header.cartBadge).toHaveText('2');

  await page.reload();
  await expect(header.cartBadge).toHaveText('2');
  await expect(inventoryPage.cartButton(onesie)).toHaveText('Remove');
  await expect(inventoryPage.cartButton(redTShirt)).toHaveText('Remove');

  await header.openCart();
  await expectLineItems(cartPage.items, [onesie, redTShirt]);
});

test('Reset App State empties the cart', async ({ header, inventoryPage, cartPage }) => {
  await inventoryPage.goto();
  await inventoryPage.addToCart(products.backpack);
  await expect(header.cartBadge).toHaveText('1');

  await header.resetAppState();
  await expect(header.cartBadge).toBeHidden();

  // Checked on a freshly opened cart: a page already on screen keeps its stale cart state (BUG-UI-04).
  await header.openCart();
  await expect(cartPage.title).toHaveText('Your Cart');
  await expect(cartPage.items).toHaveCount(0);
});
