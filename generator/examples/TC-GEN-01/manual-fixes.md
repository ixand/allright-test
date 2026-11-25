# TC-GEN-01: рев'ю і ручні правки

**Ручних правок немає.** `tests/generated/TC-GEN-01.spec.ts` це вихід конвеєра без змін. Його sha256
збігається з `specSha256` у [`result.json`](result.json) (`9c7de326…`). Від сирої відповіді
[`attempt-1.spec.ts`](attempt-1.spec.ts) він відрізняється лише форматуванням Prettier: модель переносила
рядки на 80 символах, а в репозиторії `printWidth` 110. Перевірити можна так:

```bash
sha256sum tests/generated/TC-GEN-01.spec.ts
npx prettier --stdin-filepath tests/generated/TC-GEN-01.spec.ts < generator/examples/TC-GEN-01/attempt-1.spec.ts \
  | diff - tests/generated/TC-GEN-01.spec.ts
```

## Рев'ю

| Що перевіряв | Висновок |
| --- | --- |
| Локатори | Лише `getByTestId` з app map. `item-1-title-link` веде на Bolt T-Shirt, бо в каталозі в нього id 1. Рядок кошика взято через `filter({ hasText: 'Sauce Labs Bolt T-Shirt' })` |
| Очікування | Немає `waitForTimeout`. Після кожного переходу спершу перевіряється екран: `title` "Products", на сторінці деталей `back-to-products` "Back to products", потім `title` "Your Cart" |
| Сила перевірок | Кожне значення з кейсу перевірено точним матчером: кнопка `toHaveText('Remove')`, бейдж `toHaveText('1')`, рівно один рядок кошика `toHaveCount(1)`, назва `toHaveText('Sauce Labs Bolt T-Shirt')`, ціна `toHaveText('$15.99')` |
| Відповідність кейсу | 4 `test.step`, назва кожного дослівно повторює текст кроку. Очікування «після кроку 3» стоять у кроці 3, вміст кошика перевіряється в кроці 4 |
| Стабільність | Конвеєр: `3 passed` (`attempt-1.log`). На рев'ю `--repeat-each=10 --retries=0` дав 10 passed з `--workers=1` і 10 passed з `--workers=4` |
| Червоний контроль | Заміна `'$15.99'` на `'$15.98'`: тест упав на рядку 30 з `Expected: "$15.98"` і `Received: "$15.99"`. Правку відкочено, і файл знову побайтово збігається з виходом конвеєра |

## Чому сторінку деталей перевіряє `back-to-products`, а не URL

Попередня версія цього спеку й проміжний прогін до виправлення генератора перевіряли сторінку деталей
тільки через URL:

```ts
await page.getByTestId('item-1-title-link').click();
await expect(page).toHaveURL('/inventory-item.html?id=1');
await expect(page.getByTestId('inventory-item-name')).toHaveText('Sauce Labs Bolt T-Shirt');
```

Застосунок оновлює URL раніше, ніж малює нову сторінку. У цей момент `inventory-item-name` ще знаходить усі
шість товарів зі списку, і Playwright одразу падає з `strict mode violation: getByTestId('inventory-item-name')
resolved to 6 elements`. На рев'ю з `--repeat-each=10 --retries=0` проміжний спек упав 6 разів із 10
(і з `--workers=1`, і з `--workers=4`), а спек попереднього прогону 9 разів із 10. Водночас прогін конвеєра
(1 з 1) і `--repeat-each=3` проходили.

Виправлено в генераторі, руками нічого не правилось. Правило 6 у [`conventions.md`](../../conventions.md)
більше не вважає URL перевіркою екрана, [`app-map.md`](../../app-map.md) називає `back-to-products`
перевіркою сторінки деталей, а конвеєр приймає спек лише після трьох проходів поспіль.

Не правив: `toHaveCount(1)` разом із `filter({ hasText })` і `toHaveText` тієї ж назви частково
дублюють одне одного, але разом перевіряють рівно те, що сказано в кейсі.
