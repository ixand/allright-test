# QA automation: saucedemo (UI) + restful-booker (API)

[![tests](https://github.com/ixand/allright-test/actions/workflows/tests.yml/badge.svg)](https://github.com/ixand/allright-test/actions/workflows/tests.yml)

Тестове завдання: Playwright + TypeScript.

- **UI:** https://www.saucedemo.com, користувач `standard_user`, браузери Chromium, Firefox і WebKit
- **API:** https://restful-booker.herokuapp.com ([apidoc](https://restful-booker.herokuapp.com/apidoc))
- **CI:** GitHub Actions на кожен push і PR, HTML-звіт як артефакт
- **Бонус:** конвеєр «тест-кейс текстом → Playwright-тест» ([generator/README.md](generator/README.md))
- **Робота з ШІ-агентом:** інструкції, ключові промпти й помилки агента описано в [AI_WORKLOG.md](AI_WORKLOG.md)

## Як запустити

Потрібен Node.js ≥ 22.18 (`engines` у `package.json`; CI бере версію з `.nvmrc`).

```bash
npm ci
npx playwright install --with-deps chromium firefox webkit

npm test                 # усе: ui-setup → ui-chromium / ui-firefox / ui-webkit, api, generated
npm run test:ui          # UI у трьох браузерах
npm run test:api         # API
npm run test:generated   # 3 тести, написані генератором
npm run test:smoke       # @smoke: логін, покупка, життєвий цикл бронювання
npm run test:bugs        # @bug: відомі баги, очікувано падають
npm run test:unit        # юніт-тести правил генератора (node --test)
npm run check            # tsc + ESLint + Prettier, як у CI
npm run report           # відкрити останній HTML-звіт
```

Один файл в одному браузері: `npx playwright test tests/ui/cart.spec.ts --project=ui-chromium`.
Адреси стендів перевизначаються через `SAUCE_URL` і `BOOKER_URL`.

## Структура

```text
tests/
  ui/
    pages/            page objects: один клас на екран, локатори й дії, без assert-ів
    data/             каталог (ціни в центах), користувачі, грошові хелпери
    fixtures.ts       page objects як фікстури; блокування сторонніх запитів; оновлення сесії
    assertions.ts     спільна перевірка рядків кошика/overview незалежно від порядку
    auth.setup.ts     логін один раз → playwright/.auth/standard_user.json
    *.spec.ts         login, catalog, cart, checkout, known-bugs
  api/
    client/           BookingClient + типи й перевірка форми відповіді
    data/             фабрика бронювань з унікальними іменами
    fixtures.ts       client/token/booking; teardown видаляє кожне створене бронювання
    *.spec.ts         booking-flow, booking-negative, known-bugs
  generated/          тести, які написав генератор (див. бонус)
generator/            конвеєр «текст → тест», промпти, app map, приклади з логами
scripts/              підсумок прогону для GitHub Job Summary
.github/              workflow CI і Dependabot
CLAUDE.md             робочі правила для ШІ-агента
```

## Що покрито

Кожен UI-тест запускається в трьох браузерах: 31 тест (17 основних, 8 негативних і граничних, 6 на відомі баги) × 3
і `ui-setup`. До цього додаються 12 API-тестів (5 + 7 на відомі баги) і 3 згенеровані, разом 109.

### UI: основні сценарії

| Сценарій | Тест (`tests/ui`) | Що перевіряє |
| --- | --- | --- |
| Логін | `login.spec.ts` › standard_user logs in… `@smoke` | URL `/inventory.html`, заголовок «Products», список товарів |
| Логін | `login.spec.ts` › logout ends the session… | Після Logout екран логіну, а Back не повертає в магазин |
| Каталог | `catalog.spec.ts` › the inventory lists the six catalog products… | 6 назв і цін дорівнюють даним каталогу |
| Каталог | `catalog.spec.ts` › the details page of … (6 товарів) | Сторінка товару показує назву й ціну з каталогу |
| Сортування | `catalog.spec.ts` › sorting by "…" (4 варіанти) | Порядок дорівнює відсортованій копії каталогу, ціни з однаковим значенням допускають будь-який порядок; спершу перевіряється протилежне сортування, тож доведено саме зміну |
| Кошик | `cart.spec.ts` › the cart lists exactly the added products… | Бейдж 1 → 2 → 1, рядки кошика (назва, ціна, кількість), видалення |
| Кошик | `cart.spec.ts` › the cart survives a page reload | Кошик і стан кнопок після перезавантаження |
| Кошик | `cart.spec.ts` › Reset App State empties the cart | Reset очищає бейдж і кошик |
| Чекаут | `checkout.spec.ts` › a customer buys two products end to end `@smoke` | Overview: товари, `Item total`, податок 8 % і `Total`, рахуються в центах з даних (ставки saucedemo не публікує, 8 % спостережено на сторінці); «Thank you for your order!»; Back Home |

### UI: негативні й граничні

| Тест | Що перевіряє |
| --- | --- |
| `login.spec.ts` › login is rejected: locked-out user / wrong password / empty username / empty password | Точний текст помилки, користувач лишається на `/` |
| `login.spec.ts` › opening the inventory URL directly sends the visitor to login | Без сесії `/inventory.html` недоступна, текст помилки |
| `checkout.spec.ts` › checkout information › requires First Name / Last Name / Postal Code | Кожне обов'язкове поле окремо, користувач лишається на кроці 1 |

### API

| Тест (`tests/api`) | Що перевіряє |
| --- | --- |
| `booking-flow.spec.ts` › booking lifecycle… `@smoke` | Повний флоу завдання по кроках (`test.step`): `POST /auth` → `POST /booking` → `GET` → `PUT` з токеном → `GET` → `PATCH` → `GET` → `DELETE` → `GET` повертає 404/410. Кожна відповідь звіряється з payload, форма тіла з apidoc |
| `booking-negative.spec.ts` › PUT without credentials… | Відмова (401/403), а `GET` показує, що бронювання не змінилось |
| `booking-negative.spec.ts` › DELETE with an invalid token… | Відмова (401/403), бронювання на місці |
| `booking-negative.spec.ts` › GET of a booking id that was never issued… | 404, з позитивним контролем на власному бронюванні |
| `booking-negative.spec.ts` › POST /auth with a wrong password returns no token | У відповіді немає токена, з контролем на правильному паролі |

Кожне бронювання, яке прийняв сервер, фікстура `client` видаляє в teardown, зокрема бронювання з
негативних і баг-тестів. Імена унікальні (`QA-<hex>`), тож чужих даних на спільному стенді тести не
чіпають.

### Як влаштовані тести на відомі баги

Тест бага (`known-bugs.spec.ts`, тег `@bug`, анотація з посиланням на звіт нижче) перевіряє
**правильну** поведінку і будується так:

1. позитивні контролі: потрібна сторінка, потрібні товари, дані прийнято;
2. `test.fail(true, 'BUG-…')` у тілі тесту;
3. перевірка бага.

Поки баг живий, Playwright рахує тест як «expected to fail» і CI лишається зеленим. Якщо баг виправлять,
тест стане «Expected to fail, but passed», CI почервоніє, і це сигнал прибрати позначку. Перевірка бага
приймає будь-яке коректне виправлення. Наприклад, валідацію приймає будь-яка відповідь 4xx, а не лише
400, і текст помилки може бути будь-яким, аби в ньому було назване поле.

Порядок важливий, і це перевірено прогоном на Playwright 1.65.1:

| Ситуація | Результат |
| --- | --- |
| Контроль падає до виклику `test.fail()` | тест **червоний**, тобто зламаний тест не маскується під баг |
| Контроль пройшов, перевірка бага впала | expected failure |
| Баг виправлено | «Expected to fail, but passed», червоний |
| Декларативна форма `test.fail('title', body)`, падає контроль | expected failure: зламаний тест **сховано** |

Тому декларативна форма, яку пропонують доки Playwright, тут свідомо не використовується. Для кожного
баг-тесту перевірено, що без `test.fail` він падає саме на перевірці бага, а зі зламаним контролем падає
по-справжньому.

### Стабільність

- **Сторонні запити.** Google Fonts і телеметрію Backtrace UI-фікстура обриває (`page.route`), за принципом
  Playwright «Only test what you control».
- **Сесія.** Кука сесії saucedemo живе 10 хвилин від логіну і не подовжується, тому фікстура перелогінюється,
  якщо до кінця сесії лишилося менше 2 хвилин. Інакше довгий прогін у CI падав би на пізніх тестах.
- **Відомий шум стенду.** У Firefox і WebKit зрідка зависає завантаження сторінки або навігація самого saucedemo
  (`page.reload`, `goto`, перехід після кліку). Під час розробки в 4 з 8 повних прогонів по 190–280 тестів (6 на етапі посилення UI і 2 на етапі виправлення)
  траплялось рівно одне таке падіння, щоразу в іншому тесті, і за 30 ізольованих повторів жодне не
  відтворилось. У CI це поглинає `retries: 1`, і звіт показує такий тест як **flaky**, а не як passed.

## Що свідомо не покрито

| Що | Чому |
| --- | --- |
| Інші користувачі saucedemo (`problem_user`, `performance_glitch_user`, `error_user`, `visual_user`) | Завдання про `standard_user`. `locked_out_user` використано лише в негативному тесті логіну |
| Мобільні в'юпорти | Поза обсягом. Проєкт додається в `playwright.config.ts` одним рядком на зразок `devices['Pixel 7']` |
| Візуальна регресія, доступність (axe), продуктивність | Окремі види тестування, поза обсягом завдання |
| Dynamic Catalog, About, соцпосилання, «Generate PDF order» | Не входять в основні сценарії (логін, каталог, сортування, кошик, чекаут) |
| API: формати XML і `x-www-form-urlencoded`, фільтри `GET /booking?checkin=…` | Флоу завдання працює з JSON, фільтри по датах лишилися поза обсягом |
| Навантаження і безпека API | Обидва стенди публічні та спільні, навантажувати їх не можна |
| JSON Schema через ajv/zod | Для шести полів достатньо типізованої перевірки без додаткових залежностей |

## CI

[`.github/workflows/tests.yml`](.github/workflows/tests.yml) запускається на `push`, `pull_request` і вручну.

1. `npm ci`
2. `npm run typecheck`, `npm run lint`, `npm run format:check`, `npm run test:unit`
3. Установлення Chromium, Firefox і WebKit. Браузери не кешуються, як радить гайд Playwright по CI
4. `npx playwright test`: усі проєкти, `workers: 1`, `retries: 1`, `globalTimeout` 15 хв
5. Таблиця в Job Summary: passed, known bug, failed, flaky і skipped окремо по кожному проєкту ([scripts/report-summary.mjs](scripts/report-summary.mjs))
6. Артефакти, які публікуються завжди, навіть при падінні:
   - `playwright-report`: HTML-звіт;
   - `test-results`: трейси (на першому ретраї), скріншоти впалих тестів, `junit.xml`, `results.json`

Лінтер: typescript-eslint з type-aware `no-floating-promises` (його радить Playwright) плюс
eslint-plugin-playwright, з `--max-warnings=0`. Дії закріплено на commit SHA, у workflow `permissions:
contents: read`, оновлення npm і Actions веде Dependabot.

## Знайдені баги

Середовище: https://www.saucedemo.com і https://restful-booker.herokuapp.com, 25.11.2026.
UI перевірено в Chromium, Firefox і WebKit (Playwright 1.65.1), API через Playwright `request` і curl.
Специфікації saucedemo немає, тому для кожного бага вказано, звідки взято очікування.

| ID | Коротко | Серйозність | Автотест |
| --- | --- | --- | --- |
| [BUG-UI-01](#bug-ui-01) | Item total на Overview не округлено: `$57.980000000000004` | Minor | `tests/ui/known-bugs.spec.ts`, `tests/generated/TC-GEN-03.spec.ts` |
| [BUG-UI-02](#bug-ui-02) | Замовлення з порожнім кошиком оформлюється | Major | `tests/ui/known-bugs.spec.ts` |
| [BUG-UI-03](#bug-ui-03) | Поля чекауту приймають значення з самих пробілів | Major | `tests/ui/known-bugs.spec.ts` |
| [BUG-UI-04](#bug-ui-04) | Reset App State не скидає кнопки «Remove» | Minor | `tests/ui/known-bugs.spec.ts` |
| [BUG-API-01](#bug-api-01) | `POST /auth` з неправильним паролем → 200 OK | Minor | `tests/api/known-bugs.spec.ts` |
| [BUG-API-02](#bug-api-02) | `POST /booking` без обов'язкового поля → 500 | Major | `tests/api/known-bugs.spec.ts` |
| [BUG-API-03](#bug-api-03) | Невалідні дати зберігаються як `"0NaN-aN-aN"` | Major | `tests/api/known-bugs.spec.ts` |
| [BUG-API-04](#bug-api-04) | `checkout` раніше за `checkin` приймається | Major | `tests/api/known-bugs.spec.ts` |
| [BUG-API-05](#bug-api-05) | Нечисловий `totalprice` мовчки стає `null` | Major | `tests/api/known-bugs.spec.ts` |
| [BUG-API-06](#bug-api-06) | Повторний `DELETE` → 405 замість 404 | Minor | `tests/api/known-bugs.spec.ts` |
| [BUG-API-07](#bug-api-07) | Дробовий `totalprice` обрізається до цілого | Major | `tests/api/known-bugs.spec.ts` |

### <a id="bug-ui-01"></a>BUG-UI-01: Item total на кроці Checkout: Overview не округлено до центів

- **Де:** `/checkout-step-two.html`, рядок `Item total`
- **Серйозність:** Minor. Пріоритет High: некоректну суму на сторінці оплати бачить кожен покупець з такою комбінацією товарів
- **Передумови:** залогінений `standard_user`, кошик порожній

**Кроки**

1. На сторінці Products додати в кошик «Sauce Labs Fleece Jacket» ($49.99) і «Sauce Labs Onesie» ($7.99).
2. Відкрити кошик і натиснути **Checkout**.
3. Ввести `John` / `Doe` / `12345` і натиснути **Continue**.

**Очікуваний результат:** `Item total: $57.98`. Це сума цін каталогу з двома знаками після коми, у тому самому
форматі, що `Tax: $4.64` і `Total: $62.62` на цій сторінці.

**Фактичний результат:** `Item total: $57.980000000000004`. Податок і загальна сума правильні.

**Додатково:** Bike Light + Fleece Jacket дають `Item total: $59.980000000000004`. Порожній кошик показує `Item total: $0`
без центів поруч із `Tax: $0.00`.

**Ймовірна причина** (код застосунку не перевірявся): суму double не форматують до двох знаків, у JS
`49.99 + 7.99 === 57.980000000000004`.

**Відтворюваність:** 9/9 у двох фінальних повних прогонах (Chromium, Firefox, WebKit; 1 прогін у CI-режимі + 2 повтори без ретраїв), щоразу на перевірці бага, з `Received: "Item total: $57.980000000000004"`. Ще 1/1 ручною пробою і 3/3 у згенерованому TC-GEN-03.

### <a id="bug-ui-02"></a>BUG-UI-02: Замовлення з порожнім кошиком можна оформити

- **Де:** `/cart.html` → `/checkout-complete.html`
- **Серйозність:** Major. Пріоритет Medium: система створює «замовлення» без товарів
- **Передумови:** залогінений `standard_user`, кошик порожній (бейджа на іконці кошика немає)

**Кроки**

1. Відкрити кошик (іконка в шапці). Список товарів порожній.
2. Натиснути **Checkout**, ввести `John` / `Doe` / `12345`, натиснути **Continue**.
3. Натиснути **Finish**.

**Очікуваний результат:** оформити порожній кошик неможливо: кнопка Checkout неактивна або прихована, або
показано повідомлення, що кошик порожній. Джерело: базова логіка e-commerce, бо замовлення без товарів не має
сенсу. Окремої специфікації немає.

**Фактичний результат:** Checkout активна. Overview показує 0 товарів, `Item total: $0` і `Total: $0.00`, а
Finish виводить «Thank you for your order!».

**Відтворюваність:** 9/9 у двох фінальних повних прогонах (Chromium, Firefox, WebKit; 1 прогін у CI-режимі + 2 повтори без ретраїв), щоразу на перевірці бага: порожній кошик доходить до `/checkout-complete.html`. Ручна проба 1/1.

### <a id="bug-ui-03"></a>BUG-UI-03: Поля First Name, Last Name і Postal Code приймають значення з самих пробілів

- **Де:** `/checkout-step-one.html`
- **Серйозність:** Major. Пріоритет Medium: замовлення можна оформити без даних покупця
- **Передумови:** залогінений `standard_user`, у кошику «Sauce Labs Backpack»

**Кроки**

1. Кошик → **Checkout**.
2. First Name: три пробіли. Last Name: `Doe`. Postal Code: `12345`.
3. Натиснути **Continue**.
4. Повторити кроки 1–3, вводячи пробіли по черзі в Last Name і в Postal Code.

**Очікуваний результат:** та сама помилка, що й для порожнього поля (`Error: First Name is required` тощо),
користувач лишається на кроці 1. Джерело: валідація порожніх полів у цій самій формі, бо значення з пробілів
фактично порожнє.

**Фактичний результат:** відкривається `/checkout-step-two.html` без жодної помилки. Так поводиться кожне з
трьох полів.

**Відтворюваність:** 27/27 у двох фінальних повних прогонах: кожне з трьох полів 9/9 (Chromium, Firefox, WebKit), щоразу перехід на `/checkout-step-two.html`. Ручна проба 1/1 і окремо по кожному полю 3/3.

### <a id="bug-ui-04"></a>BUG-UI-04: Після Reset App State кнопки товарів лишаються в стані «Remove»

- **Де:** бокове меню → Reset App State, сторінки `/inventory.html` і `/cart.html`
- **Серйозність:** Minor. Пріоритет Low
- **Передумови:** залогінений `standard_user`

**Кроки**

1. На Products додати «Sauce Labs Backpack» і «Sauce Labs Bolt T-Shirt». Бейдж кошика показує `2`.
2. Відкрити меню (☰) і натиснути **Reset App State**.

**Очікуваний результат:** кошик порожній, тож бейдж зникає, а обидві кнопки показують «Add to cart».

**Фактичний результат:** бейдж зникає і кошик у `localStorage` очищено, але обидві кнопки лишаються «Remove»
до перезавантаження сторінки. На `/cart.html` після reset товари так само лишаються в списку до
перезавантаження.

**Відтворюваність:** 9/9 у двох фінальних повних прогонах (Chromium, Firefox, WebKit; 1 прогін у CI-режимі + 2 повтори без ретраїв), щоразу на перевірці бага, з `Received: "Remove"`. Ручна проба 1/1, симптом на `/cart.html` 2/2 окремою пробою.

Усі запити йдуть на `https://restful-booker.herokuapp.com`. Базове тіло бронювання, яке далі змінюється
по одному полю:

```bash
B=https://restful-booker.herokuapp.com
BODY='{"firstname":"QA","lastname":"Tester","totalprice":150,"depositpaid":true,"bookingdates":{"checkin":"2026-12-01","checkout":"2026-12-05"}}'
TOKEN=$(curl -s -X POST $B/auth -H 'Content-Type: application/json' \
  -d '{"username":"admin","password":"password123"}' | sed 's/.*"token":"\([^"]*\)".*/\1/')
```

### <a id="bug-api-01"></a>BUG-API-01: `POST /auth` з неправильними обліковими даними відповідає 200 OK

- **Де:** `POST /auth`
- **Серйозність:** Minor. Пріоритет Medium: клієнт мусить розбирати тіло відповіді, щоб зрозуміти, що вхід не вдався
- **Передумови:** немає

**Кроки**

```bash
curl -i -X POST $B/auth -H 'Content-Type: application/json' -d '{"username":"admin","password":"wrong"}'
```

**Очікуваний результат:** `401 Unauthorized` (RFC 9110 §15.5.2). Apidoc описує лише успішну відповідь.

**Фактичний результат:** `200 OK`, тіло `{"reason":"Bad credentials"}`. Те саме для порожнього `{}`.

**Відтворюваність:** 3/3 у двох фінальних повних прогонах (1 у CI-режимі + 2 повтори без ретраїв), щоразу на перевірці бага (`Received: 200`). Ручна проба curl 2/2: неправильний пароль і `{}`.

### <a id="bug-api-02"></a>BUG-API-02: `POST /booking` без обов'язкового поля відповідає 500

- **Де:** `POST /booking`
- **Серйозність:** Major. Пріоритет High: сервер падає на некоректному вводі клієнта, замість того щоб валідувати його
- **Передумови:** немає (створення бронювання не потребує токена)

**Кроки**

```bash
curl -i -X POST $B/booking -H 'Content-Type: application/json' -H 'Accept: application/json' \
  -d '{"lastname":"Tester","totalprice":150,"depositpaid":true,"bookingdates":{"checkin":"2026-12-01","checkout":"2026-12-05"}}'
```

**Очікуваний результат:** `400 Bad Request` або інша 4xx з повідомленням про відсутнє поле `firstname`
(RFC 9110 §15.5.1).

**Фактичний результат:** `500 Internal Server Error`. Так само для тіла `{}` і для `"firstname": 123`.
Нічого не зберігається: пошук `GET /booking?lastname=…` повертає `[]`.

**Відтворюваність:** 3/3 у двох фінальних повних прогонах (1 у CI-режимі + 2 повтори без ретраїв), щоразу на перевірці бага (`Received: 500`). Ручна проба curl 3/3: без `firstname`, `{}`, числовий `firstname`.

### <a id="bug-api-03"></a>BUG-API-03: Невалідні дати приймаються й зберігаються як `"0NaN-aN-aN"`

- **Де:** `POST /booking`, поле `bookingdates`
- **Серйозність:** Major. Пріоритет High: у базу потрапляють пошкоджені дані
- **Передумови:** немає

**Кроки**

```bash
curl -s -X POST $B/booking -H 'Content-Type: application/json' -H 'Accept: application/json' \
  -d "${BODY/2026-12-01\",\"checkout\":\"2026-12-05/not-a-date\",\"checkout\":\"2026-13-45}"
```

**Очікуваний результат:** 4xx. Apidoc вимагає формат дат `CCYY-MM-DD`.

**Фактичний результат:** `200 OK`, у відповіді обидві дати мають значення `"0NaN-aN-aN"`.

**Відтворюваність:** 3/3 у двох фінальних повних прогонах (1 у CI-режимі + 2 повтори без ретраїв), щоразу на перевірці бага (`Received: 200`). Ручна проба curl 1/1.

### <a id="bug-api-04"></a>BUG-API-04: `checkout` раніше за `checkin` приймається

- **Де:** `POST /booking`, поле `bookingdates`
- **Серйозність:** Major. Пріоритет Medium: порушено базове бізнес-правило бронювання
- **Передумови:** немає

**Кроки**

```bash
curl -s -X POST $B/booking -H 'Content-Type: application/json' -H 'Accept: application/json' \
  -d "${BODY/2026-12-01\",\"checkout\":\"2026-12-05/2026-12-10\",\"checkout\":\"2026-12-01}"
```

**Очікуваний результат:** 4xx, бо дата виїзду не може бути раніше за дату заїзду.

**Фактичний результат:** `200 OK`, дати збережено як є (`checkin` 2026-12-10, `checkout` 2026-12-01).

**Відтворюваність:** 3/3 у двох фінальних повних прогонах (1 у CI-режимі + 2 повтори без ретраїв), щоразу на перевірці бага (`Received: 200`). Ручна проба curl 1/1.

### <a id="bug-api-05"></a>BUG-API-05: Нечисловий `totalprice` мовчки зберігається як `null`

- **Де:** `POST /booking`, поле `totalprice`
- **Серйозність:** Major. Пріоритет High: тиха втрата даних
- **Передумови:** немає

**Кроки**

```bash
curl -s -X POST $B/booking -H 'Content-Type: application/json' -H 'Accept: application/json' \
  -d "${BODY/\"totalprice\":150/\"totalprice\":\"abc\"}"
# потім GET $B/booking/<bookingid з відповіді>
```

**Очікуваний результат:** 4xx. Apidoc описує `totalprice` як `Number`.

**Фактичний результат:** `200 OK`. І у відповіді, і в наступному `GET` маємо `"totalprice": null`.

**Відтворюваність:** 3/3 у двох фінальних повних прогонах (1 у CI-режимі + 2 повтори без ретраїв), щоразу на перевірці бага (`Received: 200`). Ручна проба curl 1/1.

### <a id="bug-api-06"></a>BUG-API-06: Повторний `DELETE` видаленого бронювання відповідає 405 замість 404

- **Де:** `DELETE /booking/{id}`
- **Серйозність:** Minor. Пріоритет Low
- **Передумови:** токен (`$TOKEN` вище) і бронювання, створене через `POST /booking`

**Кроки**

```bash
ID=<bookingid з відповіді POST /booking>
curl -i -X DELETE $B/booking/$ID -H "Cookie: token=$TOKEN"   # 201 Created
curl -i $B/booking/$ID                                       # 404 Not Found
curl -i -X DELETE $B/booking/$ID -H "Cookie: token=$TOKEN"   # повторно
```

**Очікуваний результат:** `404 Not Found` (RFC 9110 §15.5.5), як уже відповідає `GET` для того самого id.
Тест приймає також 410 і 204, якщо сервер робить `DELETE` ідемпотентним.

**Фактичний результат:** `405 Method Not Allowed`, причому без заголовка `Allow`, якого вимагає RFC 9110 §15.5.6.
Те саме для id, якого ніколи не було.

**Відтворюваність:** 3/3 у двох фінальних повних прогонах (1 у CI-режимі + 2 повтори без ретраїв), щоразу на перевірці бага (405). Ручна проба curl 1/1.

### <a id="bug-api-07"></a>BUG-API-07: Дробовий `totalprice` обрізається до цілого

- **Де:** `POST /booking`, поле `totalprice`
- **Серйозність:** Major. Пріоритет High: гроші зберігаються неправильно
- **Передумови:** немає

**Кроки**

```bash
curl -s -X POST $B/booking -H 'Content-Type: application/json' -H 'Accept: application/json' \
  -d "${BODY/\"totalprice\":150/\"totalprice\":111.99}"
# потім GET $B/booking/<bookingid з відповіді>
```

**Очікуваний результат:** `111.99`. Apidoc описує `totalprice` як `Number`.

**Фактичний результат:** `111` і у відповіді, і в `GET`. Значення саме обрізається, а не округлюється:
`99.5 → 99`, `0.5 → 0`. Ціле `150` зберігається без змін.

**Відтворюваність:** 3/3 у двох фінальних повних прогонах (1 у CI-режимі + 2 повтори без ретраїв), щоразу на перевірці бага (111 замість 111.99). Ручна проба 3/3 для 111.99, 99.5 і 0.5, контроль 150 → 150.

### Спостереження без окремого тесту

Ці відповіді відповідають apidoc або не мають однозначного очікування, тому не оформлені як баги:

- `DELETE /booking/{id}` відповідає `201 Created`. Так описано в apidoc, але за RFC 9110 код 201 означає
  створення ресурсу; для видалення доречніші 200 або 204.
- `GET /ping` відповідає `201 Created`. Теж задокументовано, але для health-check очікується 200.
- Запит без токена або з неправильним токеном отримує `403 Forbidden` без `WWW-Authenticate`, а за RFC 9110 для
  відсутніх облікових даних підходить 401. Негативні тести приймають 401 і 403.
- Від'ємний `totalprice` (`-500`) приймається.
- `depositpaid: "yes"` зберігається як `true`.

## Бонус: генератор тестів

`npm run generate -- <кейс.txt>` бере ручний тест-кейс як текст (кроки й очікуваний результат) і повертає
Playwright-тест у `tests/generated/`, який одразу запускається. Модель підключається будь-яка:
команду задає `GEN_LLM_CMD` (промпт іде в stdin, відповідь читається зі stdout). Це може бути CLI агента в
headless-режимі або скрипт до API. Яку модель використано тут, описано в [AI_WORKLOG.md](AI_WORKLOG.md).

Конвеєр складається з кроків:

1. розбір кейсу;
2. промпт з app map, перевіреним на живому сайті, і з конвенціями;
3. виклик моделі;
4. статичні перевірки: конвенції репозиторію, Prettier і ESLint з `--max-warnings=0`;
5. запуск;
6. прийом тесту лише після 3 зелених прогонів поспіль.

Якщо тест упав, модель отримує один раунд виправлення. У ньому вона або виправляє код, або відповідає
`APP_BUG: <причина>`. Виправлення, яке послаблює перевірку, відкидається: прибрано `expect`, зник літерал із
кейсу, `toHaveText` → `toContainText`, додано `.not`, скопійовано значення з `Received:` або проковтнуто
помилку через `.then(…, () => …)`. Захисні правила покрито юніт-тестами (`npm run test:unit`, 36 тестів).

| Кейс | Вхід → що перевіряє | Спроб | Вердикт | Пройшов? | Ручні правки |
| --- | --- | --- | --- | --- | --- |
| [TC-GEN-01](generator/examples/TC-GEN-01/) | Додати товар у кошик зі сторінки деталей | 1 | `PASSED` (exit 0) | Так, з першої спроби, 3/3 | Немає |
| [TC-GEN-02](generator/examples/TC-GEN-02/) | Cancel на overview зберігає кошик | 1 | `PASSED` (exit 0) | Так, з першої спроби, 3/3 | Немає |
| [TC-GEN-03](generator/examples/TC-GEN-03/) | Item total округлено до центів | 2 (генерація + виправлення) | `APP_BUG` (exit 2) | Ні, і це правильно: це реальний [BUG-UI-01](#bug-ui-01) | Додано позитивні контролі, `test.fail` після них, тег `@bug` і анотацію |

Для кожного прикладу в `generator/examples/<ID>/` лежать:

- вхідний кейс;
- повний промпт;
- сирий код моделі;
- вивід Playwright;
- `result.json`;
- `manual-fixes.md` з точним diff ручних правок.

Опис дизайну, компромісів і обмежень є в [generator/README.md](generator/README.md).
