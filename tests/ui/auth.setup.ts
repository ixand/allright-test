import path from 'node:path';
import { expect, test as setup } from './fixtures.ts';
import { users } from './data/users.ts';

// Must match STORAGE_STATE in playwright.config.ts, the storageState of ui-chromium, ui-firefox and ui-webkit.
const authFile = path.join(__dirname, '../../playwright/.auth/standard_user.json');

setup('log in as standard_user', async ({ page, header, loginPage }) => {
  await loginPage.goto();
  await loginPage.login(users.standard);
  await expect(page).toHaveURL('/inventory.html');
  await expect(header.title).toHaveText('Products');
  await page.context().storageState({ path: authFile });
});
