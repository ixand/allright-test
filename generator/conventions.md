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
