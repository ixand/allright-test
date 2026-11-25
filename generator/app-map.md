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
