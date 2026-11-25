# TC-GEN-02: рев'ю і ручні правки

**Ручних правок немає.** `tests/generated/TC-GEN-02.spec.ts` є виходом конвеєра без змін. Його sha256
збігається з `specSha256` у [`result.json`](result.json) (`9a64722d…`). Від сирої відповіді
[`attempt-1.spec.ts`](attempt-1.spec.ts) він відрізняється лише форматуванням Prettier. Перевірити можна так:

```bash
sha256sum tests/generated/TC-GEN-02.spec.ts
npx prettier --stdin-filepath tests/generated/TC-GEN-02.spec.ts < generator/examples/TC-GEN-02/attempt-1.spec.ts \
  | diff - tests/generated/TC-GEN-02.spec.ts
```

## Рев'ю

| Що перевіряв | Висновок |
| --- | --- |
| Локатори | Лише `getByTestId` з app map; slug `sauce-labs-backpack` правильний |
| Очікування | Немає `waitForTimeout`. Перевірено кожен екран шляху: "Products", "Your Cart", "Checkout: Your Information", "Checkout: Overview" і знову "Products" після Cancel |
| Сила перевірок | Обидва очікування кейсу перевірено точними матчерами: `title` `toHaveText('Products')` разом з `toHaveURL('/inventory.html')`, бейдж `toHaveText('1')` |
| Позитивний контроль | Після додавання товару кнопка `remove-sauce-labs-backpack` має текст "Remove". У кейсі цього немає, але це перевірка стану, а не нове твердження про поведінку |
| Відповідність кейсу | 5 `test.step`, назва кожного дослівно повторює текст кроку. Обидва очікування стоять у кроці 5, після Cancel |
| Стабільність | Конвеєр: `3 passed` (`attempt-1.log`) |
| Червоний контроль | Заміна бейджа `'1'` на `'2'` в останньому кроці: тест упав на рядку 38 з `Expected: "2"` і `Received: "1"`. Правку відкочено, і файл знову побайтово збігається з виходом конвеєра |

Не правив: `await page.goto('/')` стоїть перед першим `test.step`, а не всередині кроку «Log in…». Через
це у звіті перехід не належить жодному кроку, але на перевірки це не впливає.
