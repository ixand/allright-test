import { test as base } from '@playwright/test';
import { CartPage } from './pages/CartPage.ts';
import { CheckoutCompletePage } from './pages/CheckoutCompletePage.ts';
import { CheckoutInfoPage } from './pages/CheckoutInfoPage.ts';
import { CheckoutOverviewPage } from './pages/CheckoutOverviewPage.ts';
import { HeaderComponent } from './pages/HeaderComponent.ts';
import { InventoryPage } from './pages/InventoryPage.ts';
import { LoginPage } from './pages/LoginPage.ts';
import { ProductPage } from './pages/ProductPage.ts';

type Pages = {
  loginPage: LoginPage;
  inventoryPage: InventoryPage;
  productPage: ProductPage;
  cartPage: CartPage;
  checkoutInfoPage: CheckoutInfoPage;
  checkoutOverviewPage: CheckoutOverviewPage;
  checkoutCompletePage: CheckoutCompletePage;
  header: HeaderComponent;
};

export const test = base.extend<Pages>({
  loginPage: async ({ page }, use) => {
    await use(new LoginPage(page));
  },
  inventoryPage: async ({ page }, use) => {
    await use(new InventoryPage(page));
  },
  productPage: async ({ page }, use) => {
    await use(new ProductPage(page));
  },
  cartPage: async ({ page }, use) => {
    await use(new CartPage(page));
  },
  checkoutInfoPage: async ({ page }, use) => {
    await use(new CheckoutInfoPage(page));
  },
  checkoutOverviewPage: async ({ page }, use) => {
    await use(new CheckoutOverviewPage(page));
  },
  checkoutCompletePage: async ({ page }, use) => {
    await use(new CheckoutCompletePage(page));
  },
  header: async ({ page }, use) => {
    await use(new HeaderComponent(page));
  },
});

export { expect } from '@playwright/test';
