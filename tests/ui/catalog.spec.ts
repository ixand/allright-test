import { expect, test } from './fixtures.ts';
import { catalog, type Product } from './data/products.ts';
import { usd } from './data/money.ts';

test('the inventory lists the six catalog products with their prices', async ({ inventoryPage }) => {
  await inventoryPage.goto();

  await expect(inventoryPage.title).toHaveText('Products');
  await expect(inventoryPage.itemNames).toHaveText(catalog.map((product) => product.name));
  await expect(inventoryPage.itemPrices).toHaveText(catalog.map((product) => usd(product.priceCents)));
});

for (const product of catalog) {
  test(`the details page of ${product.name} shows its catalog name and price`, async ({
    page,
    inventoryPage,
    productPage,
  }) => {
    await inventoryPage.goto();
    await inventoryPage.openDetails(product);

    await expect(page).toHaveURL(`/inventory-item.html?id=${product.id}`);
    await expect(productPage.name).toHaveText(product.name);
    await expect(productPage.price).toHaveText(usd(product.priceCents));
  });
}

type Compare = (a: Product, b: Product) => number;

const byName: Compare = (a, b) => a.name.localeCompare(b.name, 'en');
const byPrice: Compare = (a, b) => a.priceCents - b.priceCents;

const sortOptions: { label: string; opposite: string; compare: Compare }[] = [
  { label: 'Name (A to Z)', opposite: 'Name (Z to A)', compare: byName },
  { label: 'Name (Z to A)', opposite: 'Name (A to Z)', compare: (a, b) => byName(b, a) },
  { label: 'Price (low to high)', opposite: 'Price (high to low)', compare: byPrice },
  { label: 'Price (high to low)', opposite: 'Price (low to high)', compare: (a, b) => byPrice(b, a) },
];

for (const { label, opposite, compare } of sortOptions) {
  test(`sorting by "${label}" orders the catalog accordingly`, async ({ inventoryPage }) => {
    const expected = [...catalog].sort(compare);
    await inventoryPage.goto();
    // Start from the opposite order so that every case, the default A to Z included, proves a change.
    await inventoryPage.sortBy(opposite);
    await inventoryPage.sortBy(label);

    await expect(inventoryPage.activeSortOption).toHaveText(label);
    await expect(inventoryPage.itemNames).toHaveText(namesAllowingTies(expected, compare));
    await expect(inventoryPage.itemPrices).toHaveText(expected.map((product) => usd(product.priceCents)));
  });
}

/**
 * Expected names in display order. Products the criterion ranks equal (two cost $15.99) have no
 * defined relative order, so each of their positions accepts any of the tied names.
 */
function namesAllowingTies(sorted: readonly Product[], compare: Compare): (string | RegExp)[] {
  return sorted.map((product) => {
    const tied = sorted.filter((other) => compare(product, other) === 0);
    if (tied.length === 1) return product.name;
    return new RegExp(`^(?:${tied.map((other) => escapeRegExp(other.name)).join('|')})$`);
  });
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
