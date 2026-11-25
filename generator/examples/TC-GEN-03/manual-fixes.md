# TC-GEN-03: рев'ю і ручні правки

Генератор: спроба 1 упала на перевірці item total (`1 failed, 2 did not run`), раунд виправлення відповів
`APP_BUG`, код виходу 2 ([`result.json`](result.json)). Перевірку не послаблено: до ручної правки
`tests/generated/TC-GEN-03.spec.ts` мав sha256 `dd1e9a37…`, тобто `specSha256` спроби 1, і дорівнював
[`attempt-1.spec.ts`](attempt-1.spec.ts) після Prettier.

## Чи це справді баг застосунку

Так. Очікування має джерело: ціни каталогу $49.99 + $7.99 = $57.98 (кейс і app map), а гроші показуються в
центах. Застосунок показує суму з плаваючою комою без округлення ([`attempt-1.log`](attempt-1.log), рядок 31
спеку):

```text
Locator:  getByTestId('subtotal-label')
Expected: "Item total: $57.98"
Received: "Item total: $57.980000000000004"
```

Це той самий дефект, що й `BUG-UI-01` у `tests/ui/known-bugs.spec.ts`, тож тест запарковано на тому самому
id, щоб реєстр багів не роздвоювався.

## Ручна правка (єдина)

Тест правильний, але червоний, поки баг живий. Правка оформлює його за правилом репозиторію для відомих
багів: правильна перевірка лишається, спершу йдуть позитивні контролі звичайними перевірками, а сама
перевірка бага загорнута в `parkedOn('BUG-UI-01', …)` з `tests/support/knownBug.ts`. Поки баг відкритий, тест
має статус `skipped` з приміткою, а після виправлення просто проходить.

1. Додано тег `@bug` і анотацію `issue` з посиланням на `#bug-ui-01`.
2. **Додано позитивні контролі, бо згенерований спек їх не мав.** Перед перевіркою бага він перевіряв лише
   заголовки екранів і бейдж `'2'`, а не те, що на overview саме два потрібні товари. Додано рівно два
   рядки (`toHaveCount(2)`), а в кожному назву й ціну, тобто входи суми з кейсу: $49.99 і $7.99. Рядки
   шукаються через `filter({ hasText })` без прив'язки до порядку, як у `tests/ui`.
3. **Перевірки `Tax: $4.64` і `Total: $62.62` перенесено перед перевірку бага.** У згенерованому порядку вони
   стояли після неї й не виконувались, поки баг живий. Тепер обидві виконуються щоразу як контролі й зараз
   проходять. Значення не змінено.
4. Перевірку item total загорнуто в `parkedOn`, і це остання перевірка тесту. Через це спек імпортує хелпер
   з `tests/support`: це єдиний згенерований тест, який після ручної правки імпортує щось, крім
   `@playwright/test`.

```diff
--- tests/generated/TC-GEN-03.spec.ts (вихід конвеєра)
+++ tests/generated/TC-GEN-03.spec.ts (після ручної правки)
@@ -1,6 +1,9 @@
 import { test, expect } from '@playwright/test';
+import { parkedOn } from '../support/knownBug.ts';
 
-test('TC-GEN-03 Overview item total is rounded to cents', async ({ page }) => {
+const annotation = { type: 'issue', description: 'https://github.com/ixand/allright-test#bug-ui-01' };
+
+test('TC-GEN-03 Overview item total is rounded to cents', { tag: '@bug', annotation }, async ({ page }) => {
   await test.step('Log in as standard_user with the password secret_sauce.', async () => {
     await page.goto('/');
     await page.getByTestId('username').fill('standard_user');
@@ -28,8 +31,22 @@
     await page.getByTestId('postalCode').fill('12345');
     await page.getByTestId('continue').click();
     await expect(page.getByTestId('title')).toHaveText('Checkout: Overview');
-    await expect(page.getByTestId('subtotal-label')).toHaveText('Item total: $57.98');
+    const items = page.getByTestId('inventory-item');
+    await expect(items).toHaveCount(2);
+    const jacket = items.filter({ hasText: 'Sauce Labs Fleece Jacket' });
+    await expect(jacket.getByTestId('inventory-item-name')).toHaveText('Sauce Labs Fleece Jacket');
+    await expect(jacket.getByTestId('inventory-item-price')).toHaveText('$49.99');
+    const onesie = items.filter({ hasText: 'Sauce Labs Onesie' });
+    await expect(onesie.getByTestId('inventory-item-name')).toHaveText('Sauce Labs Onesie');
+    await expect(onesie.getByTestId('inventory-item-price')).toHaveText('$7.99');
     await expect(page.getByTestId('tax-label')).toHaveText('Tax: $4.64');
     await expect(page.getByTestId('total-label')).toHaveText('Total: $62.62');
+    await parkedOn(
+      'BUG-UI-01',
+      'the item total is the raw float sum, "Item total: $57.980000000000004" for Fleece Jacket + Onesie',
+      async () => {
+        await expect(page.getByTestId('subtotal-label')).toHaveText('Item total: $57.98');
+      },
+    );
   });
 });
```

Після правки файл має sha256 `95b9bcab…`. Кроки 1–3 не змінювались. Diff вище, накладений на вивід конвеєра
(`prettier(attempt-1.spec.ts)`), дає цей файл байт у байт.

Спершу ця правка використовувала `test.fail()`. Її замінено на паркування разом з усіма баг-тестами
репозиторію: з `test.fail()` виправлений баг приходив би червоним прогоном «Expected to fail, but passed».

## Перевірка правки

Кожну мутацію зроблено на копії файлу, копії видалено.

| Перевірка | Результат |
| --- | --- |
| Як є, `--repeat-each=3 --retries=0` | Підсумок `3 skipped`, код виходу 0; у JSON-звіті кожен із трьох має статус `skipped` і анотацію `parked` з `Expected: "Item total: $57.98"`, `Received: "Item total: $57.980000000000004"` |
| Зламаний контроль (`'$7.99'` → `'$7.98'`) | `1 failed`, код виходу 1: `Expected: "$7.98"`, `Received: "$7.99"`. Контроль перед `parkedOn` лишається справжнім падінням |
| Імітація виправлення (очікування item total замінено на багове значення) | `1 passed`, код виходу 0, анотація `parked-fixed`. Отже, паркується тільки перевірка бага, а виправлення прийде зеленим і з позначкою |

Не правив: крок «Add…» не перевіряє кнопки `Remove`, лише бейдж `'2'`. Тепер вміст кошика повністю
перевіряє контроль на overview, тож окремі перевірки кнопок нічого б не додали.

Примітка до [`attempt-1.log`](attempt-1.log): рядки `Testing stopped early after 1 maximum allowed failures.` і
`1 error was not a part of any test` пише сам Playwright, бо конвеєр запускає спек з `--max-failures=1`. Це
зупинка після першого падіння, а не окрема помилка.
