import { readFile } from 'node:fs/promises';
import {
  expect,
  selectors,
  test as base,
  type Browser,
  type BrowserContext,
  type BrowserContextOptions,
} from '@playwright/test';
import { users } from './data/users.ts';
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

type StorageState = Exclude<BrowserContextOptions['storageState'], string | undefined>;

type Sessions = {
  /** The state saved at `path` while its login lasts, after that the state of a new login as the same user. */
  liveSession: (path: string, baseURL: string) => Promise<StorageState>;
};

// The shop keeps its login in a cookie that expires 10 minutes after login and is never renewed (its bundle
// sets it only in the login handler). A run that outlasts the login ui-setup saved would land on the login page.
const SESSION_COOKIE = 'session-username';
// Far above the 30 s test timeout, so no test starts with a session that can run out while it runs.
const MIN_SESSION_LEFT_MS = 2 * 60_000;

export const test = base.extend<Pages, Sessions>({
  // A saved login (a file path) is kept alive; a state given inline, such as no session at all, is used as is.
  storageState: async ({ storageState, baseURL, testIdAttribute, liveSession }, use) => {
    if (typeof storageState !== 'string' || !baseURL) {
      await use(storageState);
      return;
    }
    // Playwright applies testIdAttribute only after it has resolved storageState, and a new login needs it.
    selectors.setTestIdAttribute(testIdAttribute);
    await use(await liveSession(storageState, baseURL));
  },
  liveSession: [
    async ({ browser }, use) => {
      const states = new Map<string, StorageState>();
      await use(async (path, baseURL) => {
        let state = states.get(path) ?? (JSON.parse(await readFile(path, 'utf8')) as StorageState);
        if (sessionLeftMs(state) < MIN_SESSION_LEFT_MS) {
          state = await logInAgain(browser, baseURL, state, path);
        }
        states.set(path, state);
        return state;
      });
    },
    { scope: 'worker' },
  ],
  context: async ({ context, baseURL }, use) => {
    if (!baseURL) throw new Error('UI tests need baseURL: it is the only origin they let requests reach');
    await blockOtherOrigins(context, baseURL);
    await use(context);
  },
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

export { expect };

// Playwright best practice "Only test what you control": besides its own origin the shop calls Google
// Fonts and Backtrace telemetry. Aborting those keeps tests independent of, and silent towards, both.
// Routed on the context, not on one page, so a popup or any other page of the context is covered too.
async function blockOtherOrigins(context: BrowserContext, baseURL: string): Promise<void> {
  const shop = new URL(baseURL).origin;
  await context.route(
    (url) => url.origin !== shop,
    (route) => route.abort('blockedbyclient'),
  );
}

function sessionCookie(state: StorageState): StorageState['cookies'][number] | undefined {
  return state.cookies.find((cookie) => cookie.name === SESSION_COOKIE);
}

function sessionLeftMs(state: StorageState): number {
  const cookie = sessionCookie(state);
  if (!cookie) return 0;
  return cookie.expires === -1 ? Infinity : cookie.expires * 1000 - Date.now();
}

async function logInAgain(
  browser: Browser,
  baseURL: string,
  saved: StorageState,
  path: string,
): Promise<StorageState> {
  const username = sessionCookie(saved)?.value;
  const user = Object.values(users).find((candidate) => candidate.username === username);
  if (!user) {
    throw new Error(
      `${path} has no ${SESSION_COOKIE} cookie of a known user: run the ui-setup project first`,
    );
  }

  const context = await browser.newContext({ baseURL });
  try {
    await blockOtherOrigins(context, baseURL);
    const page = await context.newPage();
    const loginPage = new LoginPage(page);
    await loginPage.goto();
    await loginPage.login(user);
    await expect(
      new HeaderComponent(page).title,
      `a new login as ${user.username} must open Products`,
    ).toHaveText('Products');
    const state = await context.storageState();
    if (sessionLeftMs(state) < MIN_SESSION_LEFT_MS) {
      throw new Error(
        `a new login as ${user.username} gave a ${SESSION_COOKIE} cookie with under ${MIN_SESSION_LEFT_MS / 1000} s left`,
      );
    }
    return state;
  } finally {
    await context.close();
  }
}
