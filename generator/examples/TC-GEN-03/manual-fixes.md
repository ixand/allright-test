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

Це той самий дефект, що й `BUG-UI-01` у `tests/ui/known-bugs.spec.ts`. Опис для `test.fail` взято звідти
дослівно, щоб реєстр багів не роздвоювався. Коли в `tests/ui` змінили формулювання (додали «the»), його
перенесено й сюди, а перевірки нижче повторено на новій версії файлу.

## Ручна правка (єдина)

Тест правильний, але червоний, поки баг живий. Правка оформлює його за правилом репозиторію для відомих
багів: правильна перевірка лишається, спершу йдуть позитивні контролі, потім `test.fail(true, 'BUG-…')` у
тілі, а після нього лише перевірка бага.

1. Додано тег `@bug` і анотацію `issue` з посиланням на `#bug-ui-01`.
2. **Додано позитивні контролі, бо згенерований спек їх не мав.** Перед перевіркою бага він перевіряв лише
   заголовки екранів і бейдж `'2'`, а не те, що на overview саме два потрібні товари. Додано рівно два
   рядки (`toHaveCount(2)`), а в кожному назву й ціну, тобто входи суми з кейсу: $49.99 і $7.99. Рядки
   шукаються через `filter({ hasText })` без прив'язки до порядку, як у `expectLineItems` з `tests/ui`.
   Без цих контролів `test.fail` проковтнув би будь-яке інше падіння, наприклад зміну цін у каталозі.
3. **Перевірки `Tax: $4.64` і `Total: $62.62` перенесено перед `test.fail`.** У згенерованому порядку вони
   стояли після перевірки бага й не виконувались, поки баг живий. Якби виправлення бага зламало податок,
   падіння на `Tax` після `test.fail` зарахувалося б як «expected» і сховало б і виправлення, і новий
   дефект. Тепер обидві виконуються щоразу й зараз проходять. Значення не змінено.
4. `test.fail(true, 'BUG-UI-01: …')` стоїть безпосередньо перед перевіркою item total, і це остання
   перевірка тесту.

```diff
--- tests/generated/TC-GEN-03.spec.ts (pipeline output)
+++ tests/generated/TC-GEN-03.spec.ts (hand fix)
@@ -1,6 +1,8 @@
 import { test, expect } from '@playwright/test';
 
-test('TC-GEN-03 Overview item total is rounded to cents', async ({ page }) => {
+const annotation = { type: 'issue', description: 'https://github.com/ixand/allright-test#bug-ui-01' };
+
+test('TC-GEN-03 Overview item total is rounded to cents', { tag: '@bug', annotation }, async ({ page }) => {
   await test.step('Log in as standard_user with the password secret_sauce.', async () => {
     await page.goto('/');
     await page.getByTestId('username').fill('standard_user');
@@ -28,8 +30,20 @@
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
+    test.fail(
+      true,
+      'BUG-UI-01: the item total is the raw float sum, "Item total: $57.980000000000004" for Fleece Jacket + Onesie',
+    );
+    await expect(page.getByTestId('subtotal-label')).toHaveText('Item total: $57.98');
   });
 });
```

Після правки файл має sha256 `c6f52052…` (до перенесення формулювання з `tests/ui` був `ec813b03…`). Кроки
1–3 не змінювались. Diff вище, накладений на вивід конвеєра (`dd1e9a37…`), дає цей файл байт у байт.

## Перевірка правки

Кожну мутацію зроблено на копії файлу й відкочено. Після кожної файл побайтово збігся з версією вище.

| Перевірка | Результат |
| --- | --- |
| Як є, `--repeat-each=3 --retries=0` | Підсумок `3 passed`, код виходу 0; JSON-звіт дав `expected` для кожного з трьох (результат `failed` при очікуваному `failed`) |
| Без `test.fail` | Падає на перевірці item total (рядок 43 зміненого файлу, рядок 47 у файлі вище): `Expected: "Item total: $57.98"`, `Received: "Item total: $57.980000000000004"`. Контролі, `Tax` і `Total` перед нею пройшли |
| Зламаний контроль (`'$7.99'` → `'$7.98'`), `test.fail` на місці | `unexpected`: падає на рядку 40, `Expected: "$7.98"`, `Received: "$7.99"`. Контроль до `test.fail` лишається справжнім падінням |
| Імітація виправлення (очікування item total замінено на багове значення) | `Expected to fail, but passed.`, тест червоний (JSON: `unexpected`, результат `passed`). Отже, після `test.fail` падає тільки перевірка бага, а виправлення буде помітне |

Не правив: крок «Add…» не перевіряє кнопки `Remove`, лише бейдж `'2'`. Тепер вміст кошика повністю
перевіряє контроль на overview, тож окремі перевірки кнопок нічого б не додали.

Примітка до [`attempt-1.log`](attempt-1.log): рядки `Testing stopped early after 1 maximum allowed failures.` і
`1 error was not a part of any test` пише сам Playwright, бо конвеєр запускає спек з `--max-failures=1`. Це
зупинка після першого падіння, а не окрема помилка.
