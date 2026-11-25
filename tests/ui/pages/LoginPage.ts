import type { Locator, Page } from '@playwright/test';
import type { Credentials } from '../data/users.ts';

export class LoginPage {
  readonly page: Page;
  readonly username: Locator;
  readonly password: Locator;
  readonly loginButton: Locator;
  readonly error: Locator;

  constructor(page: Page) {
    this.page = page;
    this.username = page.getByTestId('username');
    this.password = page.getByTestId('password');
    this.loginButton = page.getByTestId('login-button');
    this.error = page.getByTestId('error');
  }

  async goto(): Promise<void> {
    // 'load' also waits for every image and stylesheet, and on this public sandbox one of them sometimes never
    // finishes. The DOM is enough: each caller goes on to a web-first assertion on the element it needs.
    await this.page.goto('/', { waitUntil: 'domcontentloaded' });
  }

  async login({ username, password }: Credentials): Promise<void> {
    await this.username.fill(username);
    await this.password.fill(password);
    await this.loginButton.click();
  }
}
