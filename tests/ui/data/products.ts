export type Product = {
  /** Used by the item links (`item-<id>-title-link`) and the details URL (`?id=<id>`). */
  readonly id: number;
  /** Suffix of the `add-to-cart-<slug>` / `remove-<slug>` test ids. */
  readonly slug: string;
  readonly name: string;
  readonly priceCents: number;
};

export const products = {
  backpack: { id: 4, slug: 'sauce-labs-backpack', name: 'Sauce Labs Backpack', priceCents: 2999 },
  bikeLight: { id: 0, slug: 'sauce-labs-bike-light', name: 'Sauce Labs Bike Light', priceCents: 999 },
  boltTShirt: { id: 1, slug: 'sauce-labs-bolt-t-shirt', name: 'Sauce Labs Bolt T-Shirt', priceCents: 1599 },
  fleeceJacket: {
    id: 5,
    slug: 'sauce-labs-fleece-jacket',
    name: 'Sauce Labs Fleece Jacket',
    priceCents: 4999,
  },
  onesie: { id: 2, slug: 'sauce-labs-onesie', name: 'Sauce Labs Onesie', priceCents: 799 },
  redTShirt: {
    id: 3,
    slug: 'test.allthethings()-t-shirt-(red)',
    name: 'Test.allTheThings() T-Shirt (Red)',
    priceCents: 1599,
  },
} as const satisfies Record<string, Product>;

/** The whole catalog, in the order the inventory lists it by default (Name A to Z). */
export const catalog: readonly Product[] = [
  products.backpack,
  products.bikeLight,
  products.boltTShirt,
  products.fleeceJacket,
  products.onesie,
  products.redTShirt,
];
