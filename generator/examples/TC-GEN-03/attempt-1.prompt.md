Convert the manual test case below into one Playwright Test spec file written in TypeScript.

Take routes, screen titles and locators from the app map: it was checked against the live application.
Follow the conventions exactly. The spec is checked against them automatically, and then it is run.

<app_map>
## Sauce Demo (Swag Labs) app map

Checked against the live site. The base URL is configured, so navigate with relative paths.
`page.getByTestId('<id>')` matches the `data-test` attribute; every `<id>` below is such a value.

### Login `/`
- Inputs `username`, `password`; button `login-button`.
- Users: `standard_user` / `secret_sauce` logs in; `locked_out_user` / `secret_sauce` is refused.
- `error` appears only after a failed login, e.g. "Epic sadface: Sorry, this user has been locked out."
- A successful login opens `/inventory.html`. Opening an inner page such as `/inventory.html` without
  logging in redirects to `/` and shows an `error`.

### Header, on every page after login
- `title`: the screen heading; its text for each screen is given below.
- `shopping-cart-link` opens `/cart.html`.
- `shopping-cart-badge`: the number of items in the cart. It is not rendered at all while the cart is empty.
- Menu: `page.getByRole('button', { name: 'Open Menu' })`, then the links `inventory-sidebar-link`
  ("All Items"), `logout-sidebar-link` ("Logout"), `reset-sidebar-link` ("Reset App State").

### Products `/inventory.html`, `title` "Products"
- `inventory-item`, one per product (6). Inside each: `inventory-item-name`, `inventory-item-desc`,
  `inventory-item-price` (text like "$29.99").
- `item-<id>-title-link`, the product name link, opens the details page of product `<id>`.
- `add-to-cart-<slug>` buttons ("Add to cart"); after a click the button is replaced by `remove-<slug>` ("Remove").
- Sorting: the `<select>` `product-sort-container` with option values `az`, `za`, `lohi`, `hilo`
  (use `selectOption`). `active-option` shows the chosen label: "Name (A to Z)", "Name (Z to A)",
  "Price (low to high)", "Price (high to low)".

### Catalog
| id | name | slug | price |
| --- | --- | --- | --- |
| 4 | Sauce Labs Backpack | `sauce-labs-backpack` | $29.99 |
| 0 | Sauce Labs Bike Light | `sauce-labs-bike-light` | $9.99 |
| 1 | Sauce Labs Bolt T-Shirt | `sauce-labs-bolt-t-shirt` | $15.99 |
| 5 | Sauce Labs Fleece Jacket | `sauce-labs-fleece-jacket` | $49.99 |
| 2 | Sauce Labs Onesie | `sauce-labs-onesie` | $7.99 |
| 3 | Test.allTheThings() T-Shirt (Red) | `test.allthethings()-t-shirt-(red)` | $15.99 |

### Product details `/inventory-item.html?id=<id>`, no `title` element
- Screen check: `back-to-products` has the text "Back to products". The URL changes while the Products
  list is still rendered, so until this check passes `inventory-item-name` matches all six products.
- `inventory-item-name`, `inventory-item-desc`, `inventory-item-price`.
- `add-to-cart` ("Add to cart"); after a click it is replaced by `remove` ("Remove"). On this page the
  button ids carry no slug.
- `back-to-products` ("Back to products") returns to `/inventory.html`.

### Cart `/cart.html`, `title` "Your Cart"
- `inventory-item`, one per cart line. Inside each: `item-quantity`, `inventory-item-name`,
  `inventory-item-price`, `remove-<slug>`.
- `continue-shopping`; `checkout` opens `/checkout-step-one.html`.

### Checkout: Your Information `/checkout-step-one.html`, `title` "Checkout: Your Information"
- Inputs `firstName`, `lastName`, `postalCode`; `continue` opens the overview; `cancel`.
- `error` names the first missing field: "Error: First Name is required", "Error: Last Name is required",
  "Error: Postal Code is required".

### Checkout: Overview `/checkout-step-two.html`, `title` "Checkout: Overview"
- `inventory-item`, one per line, with `item-quantity`, `inventory-item-name`, `inventory-item-price`.
- `subtotal-label` "Item total: $<amount>", `tax-label` "Tax: $<amount>", `total-label` "Total: $<amount>".
- `finish` opens the complete page; `cancel`.

### Checkout: Complete `/checkout-complete.html`, `title` "Checkout: Complete!"
- `complete-header` "Thank you for your order!"; `back-to-products` ("Back Home").
</app_map>

<conventions>
1. The file's only import is `import { test, expect } from '@playwright/test';`. No page objects, helpers,
   fixtures or other modules.
2. Exactly one `test()`, titled `'<CASE-ID> <case title>'`, using only the `page` fixture. The test logs in
   by itself through the login form, starting with `await page.goto('/')` (a relative path: the base URL is
   configured).
3. Wrap every numbered step of the case, in order, in `await test.step('<step text>', async () => { … })`.
   The step title is the step text copied from the case, without its number.
4. Every expected result becomes at least one assertion, placed in the step after which it can first be
   observed. Use the value from the case verbatim as a string literal, e.g. `toHaveText('Item total: $57.98')`,
   with an exact matcher (`toHaveText`, `toHaveCount`, `toHaveURL`). Never compute, round or parse an
   expected value, never loosen it (no `toContainText` for a whole value, no regex for a value from the
   case), and never assert what the application happens to show instead of what the case says.
5. Locators: `page.getByTestId('<id>')` with ids from the app map. To pick one item of a list, filter it,
   e.g. `page.getByTestId('inventory-item').filter({ hasText: 'Sauce Labs Backpack' })`. Use `getByRole` or
   `getByText` only for an element the app map gives no id for. No CSS selectors, XPath, `nth()`, `first()`
   or `last()`.
6. Waiting: web-first assertions only (`await expect(locator)…` or `await expect(page)…`). No
   `waitForTimeout`, `setTimeout`, `waitForLoadState`, `waitForURL`, `waitForNavigation` or `networkidle`.
   After every action that opens another screen, assert that screen first and only then use it: its
   `title` text or, where the screen has no `title`, the screen check the app map names. A URL check alone
   is not a screen check: the URL changes before the new screen renders. These screen checks come in
   addition to the expected results of the case.
7. Never use `test.only`, `test.skip`, `test.fixme`, `test.fail`, `try`/`catch`, `.catch()`, conditions or
   loops around assertions, or custom timeouts and retries.
8. Keep the file plain: no comments, no `console` output, no unused code.
9. Before it runs, the spec is formatted with Prettier and must pass ESLint with zero warnings
   (typescript-eslint type-checked rules and eslint-plugin-playwright recommended), e.g. every promise is
   awaited.
</conventions>

<test_case>
TC-GEN-03: Overview item total is rounded to cents

Preconditions:
- The user is logged out and the cart is empty.

Steps:
1. Log in as standard_user with the password secret_sauce.
2. Add "Sauce Labs Fleece Jacket" and "Sauce Labs Onesie" to the cart.
3. Open the cart and click "Checkout".
4. Enter first name "John", last name "Doe", postal code "12345" and click "Continue".

Expected result:
- The overview shows "Item total: $57.98" ($49.99 + $7.99).
- The overview shows "Tax: $4.64".
- The overview shows "Total: $62.62".
</test_case>

Reply with exactly one ```ts code block that holds the complete spec file, and nothing else.
