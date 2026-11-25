import { parseBooking, parseCreatedBooking, parseToken, readBody } from './client/schema.ts';
import { ADMIN, PRICE_WITH_CENTS, toCents } from './data/bookings.ts';
import { expect, GONE, test } from './fixtures.ts';

// Each test asserts the correct behaviour and is expected to fail until the bug is fixed. test.fail() is
// called only after the positive controls: a control that breaks before that point is reported as a real
// failure instead of being absorbed as the expected one.
//
// The apidoc documents no error responses, so every expected status below comes from RFC 9110. A title names
// the status the RFC points to, while the assertion accepts every correct fix: any 4xx (§15.5) for a request
// the API should refuse, 404 or 410 for a booking that is gone. Whichever fix ships, the test then reports
// "Expected to fail, but passed" and CI goes red until test.fail() is removed.
//
// In BUG-API-02..05 and 07 the `booking` fixture is the control: it creates a booking from the same payload
// and asserts 200, so each request differs from an accepted one only in the field under test.

test(
  'BUG-API-01: POST /auth with a wrong password answers 401 (RFC 9110 §15.5.2)',
  {
    tag: '@bug',
    annotation: { type: 'issue', description: 'https://github.com/ixand/allright-test#bug-api-01' },
  },
  async ({ client }) => {
    const accepted = await client.auth(ADMIN);
    expect(accepted.status(), 'control: the right password is accepted').toBe(200);
    parseToken(await accepted.json());
    const rejected = await client.auth({ ...ADMIN, password: 'wrong-password' });
    expect(await readBody(rejected), 'control: the wrong password gets no token').not.toHaveProperty('token');

    test.fail(true, 'BUG-API-01: wrong credentials get 200 {"reason":"Bad credentials"} instead of 401');
    expect(rejected.status()).toBeClientError();
  },
);

test(
  'BUG-API-02: POST /booking without firstname answers 400 (RFC 9110 §15.5.1)',
  {
    tag: '@bug',
    annotation: { type: 'issue', description: 'https://github.com/ixand/allright-test#bug-api-02' },
  },
  async ({ client, booking }) => {
    const { firstname: _omitted, ...withoutFirstname } = booking.payload;
    const response = await client.createUnchecked(withoutFirstname);

    test.fail(true, 'BUG-API-02: a missing required field gets 500 Internal Server Error instead of 400');
    expect(response.status()).toBeClientError();
  },
);

test(
  'BUG-API-03: POST /booking with invalid dates answers 400 (RFC 9110 §15.5.1)',
  {
    tag: '@bug',
    annotation: { type: 'issue', description: 'https://github.com/ixand/allright-test#bug-api-03' },
  },
  async ({ client, booking }) => {
    const response = await client.createUnchecked({
      ...booking.payload,
      bookingdates: { checkin: 'not-a-date', checkout: '2026-13-45' },
    });

    test.fail(true, 'BUG-API-03: invalid date strings are accepted with 200 and stored as "0NaN-aN-aN"');
    expect(response.status()).toBeClientError();
  },
);

test(
  'BUG-API-04: POST /booking with checkout before checkin answers 400 (RFC 9110 §15.5.1)',
  {
    tag: '@bug',
    annotation: { type: 'issue', description: 'https://github.com/ixand/allright-test#bug-api-04' },
  },
  async ({ client, booking }) => {
    const { checkin, checkout } = booking.payload.bookingdates;
    const response = await client.createUnchecked({
      ...booking.payload,
      bookingdates: { checkin: checkout, checkout: checkin },
    });

    test.fail(true, 'BUG-API-04: a checkout earlier than the checkin is accepted with 200');
    expect(response.status()).toBeClientError();
  },
);

test(
  'BUG-API-05: POST /booking with a non-numeric totalprice answers 400 (RFC 9110 §15.5.1)',
  {
    tag: '@bug',
    annotation: { type: 'issue', description: 'https://github.com/ixand/allright-test#bug-api-05' },
  },
  async ({ client, booking }) => {
    const response = await client.createUnchecked({ ...booking.payload, totalprice: 'abc' });

    test.fail(true, 'BUG-API-05: a non-numeric totalprice is accepted with 200 and stored as null');
    expect(response.status()).toBeClientError();
  },
);

test(
  'BUG-API-06: DELETE of an already deleted booking answers 404, not 405 (RFC 9110 §15.5.5)',
  {
    tag: '@bug',
    annotation: { type: 'issue', description: 'https://github.com/ixand/allright-test#bug-api-06' },
  },
  async ({ client, booking, token }) => {
    const first = await client.delete(booking.id, { token });
    expect(first.status(), 'control: the first DELETE succeeds (apidoc: 201)').toBe(201);
    const gone = await client.get(booking.id);
    expect(GONE, `control: the booking is gone, GET answered ${gone.status()}`).toContain(gone.status());
    const second = await client.delete(booking.id, { token });

    test.fail(true, 'BUG-API-06: a second DELETE gets 405 Method Not Allowed instead of 404');
    // 404/410 say the booking is gone; 204 is also a correct fix if the server makes DELETE idempotent.
    expect([...GONE, 204], `the second DELETE answered ${second.status()}`).toContain(second.status());
  },
);

test(
  'BUG-API-07: POST /booking keeps a totalprice with cents, 111.99 (apidoc: totalprice is a Number)',
  {
    tag: '@bug',
    annotation: { type: 'issue', description: 'https://github.com/ixand/allright-test#bug-api-07' },
  },
  async ({ client, booking }) => {
    const response = await client.create({ ...booking.payload, totalprice: PRICE_WITH_CENTS / 100 });
    expect(response.status(), 'control: the booking with cents is created (apidoc: 200)').toBe(200);
    const created = parseCreatedBooking(await response.json());
    const stored = await client.get(created.bookingid);
    expect(stored.status(), 'control: the new booking can be read back (apidoc: 200)').toBe(200);
    const storedBooking = parseBooking(await stored.json());

    test.fail(true, 'BUG-API-07: a decimal totalprice is truncated to a whole number, 111.99 becomes 111');
    expect
      .soft(toCents(created.booking.totalprice), 'totalprice echoed by POST /booking, in cents')
      .toBe(PRICE_WITH_CENTS);
    expect
      .soft(toCents(storedBooking.totalprice), 'totalprice returned by GET /booking/:id, in cents')
      .toBe(PRICE_WITH_CENTS);
  },
);
