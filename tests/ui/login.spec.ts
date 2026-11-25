import { expect, test } from './fixtures.ts';
import { users, type Credentials } from './data/users.ts';

const NOT_LOGGED_IN_ERROR = "Epic sadface: You can only access '/inventory.html' when you are logged in.";

test.describe('without a session', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test(
    'standard_user logs in and lands on the product list',
    { tag: '@smoke' },
    async ({ page, header, loginPage, inventoryPage }) => {
      await loginPage.goto();
      await loginPage.login(users.standard);

      await expect(page).toHaveURL('/inventory.html');
      await expect(header.title).toHaveText('Products');
      await expect(inventoryPage.list).toBeVisible();
    },
  );

  const rejectedLogins: { name: string; credentials: Credentials; error: string }[] = [
    {
      name: 'locked-out user',
      credentials: users.lockedOut,
      error: 'Epic sadface: Sorry, this user has been locked out.',
    },
    {
      name: 'wrong password',
      credentials: { username: users.standard.username, password: 'wrong_password' },
      error: 'Epic sadface: Username and password do not match any user in this service',
    },
    {
      name: 'empty username',
      credentials: { username: '', password: users.standard.password },
      error: 'Epic sadface: Username is required',
    },
    {
      name: 'empty password',
      credentials: { username: users.standard.username, password: '' },
      error: 'Epic sadface: Password is required',
    },
  ];

  for (const { name, credentials, error } of rejectedLogins) {
    test(`login is rejected: ${name}`, async ({ page, loginPage }) => {
      await loginPage.goto();
      await loginPage.login(credentials);

      await expect(loginPage.error).toHaveText(error);
      await expect(page).toHaveURL('/');
      await expect(loginPage.loginButton).toBeVisible();
    });
  }

  test('opening the inventory URL directly sends the visitor to login', async ({
    page,
    loginPage,
    inventoryPage,
  }) => {
    await inventoryPage.goto();

    await expect(loginPage.error).toHaveText(NOT_LOGGED_IN_ERROR);
    await expect(page).toHaveURL('/');
    await expect(inventoryPage.list).toBeHidden();
  });
});

test('logout ends the session and Back does not reopen the inventory', async ({
  page,
  header,
  loginPage,
  inventoryPage,
}) => {
  await inventoryPage.goto();
  await expect(inventoryPage.list).toBeVisible();

  await header.logout();
  await expect(page).toHaveURL('/');
  await expect(loginPage.loginButton).toBeVisible();

  await page.goBack({ waitUntil: 'domcontentloaded' });
  await expect(loginPage.error).toHaveText(NOT_LOGGED_IN_ERROR);
  await expect(page).toHaveURL('/');
  await expect(inventoryPage.list).toBeHidden();
});
