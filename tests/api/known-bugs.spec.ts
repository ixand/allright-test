import { parseBooking, parseCreatedBooking, parseToken, readBody } from './client/schema.ts';
import { ADMIN, PRICE_WITH_CENTS, toCents } from './data/bookings.ts';
import { expect, GONE, test } from './fixtures.ts';
import { parkedOn } from '../support/knownBug.ts';

// Each test asserts the correct behaviour. The positive controls come first, as plain assertions, so a
// control that breaks is a real failure. Only the bug assertions sit inside parkedOn(): while the bug is open
// the test is skipped with a `parked` note instead of failing.
//
// The apidoc documents no error responses, so every expected status below comes from RFC 9110. A title names
// the status the RFC points to, while the assertion accepts every correct fix: any 4xx (§15.5) for a request
// the API should refuse, anything but 405 for a repeated DELETE. Whichever fix ships, the test then passes
// with a `parked-fixed` note: move the assertion out of parkedOn() and close the bug.
//
// In BUG-API-02..05 and 07 the `booking` fixture is the control: it creates a booking from the same payload
// and asserts 200, so each request differs from an accepted one only in the field under test.
//
// A 5xx is the server failing (RFC 9110 §15.6), not the API accepting a bad request, and it would fail a 4xx
// assertion just as the known bug does. So the request under test is first checked for a non-5xx answer, as a
// control: an outage is then a real failure. BUG-API-02 has no such control, because there the 500 is the bug.

const SERVER_ANSWERED = 'control: the server answered the request, not a 5xx (RFC 9110 §15.6)';

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
    expect(rejected.status(), SERVER_ANSWERED).toBeLessThan(500);
    expect(await readBody(rejected), 'control: the wrong password gets no token').not.toHaveProperty('token');

    await parkedOn(
      'BUG-API-01',
      'wrong credentials get 200 {"reason":"Bad credentials"} instead of 401',
      () => {
        expect(rejected.status()).toBeClientError();
      },
    );
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

    await parkedOn(
      'BUG-API-02',
      'a missing required field gets 500 Internal Server Error instead of 400',
      () => {
        expect(response.status()).toBeClientError();
      },
    );
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
    expect(response.status(), SERVER_ANSWERED).toBeLessThan(500);

    await parkedOn(
      'BUG-API-03',
      'invalid date strings are accepted with 200 and stored as "0NaN-aN-aN"',
      () => {
        expect(response.status()).toBeClientError();
      },
    );
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
    expect(response.status(), SERVER_ANSWERED).toBeLessThan(500);

    await parkedOn('BUG-API-04', 'a checkout earlier than the checkin is accepted with 200', () => {
      expect(response.status()).toBeClientError();
    });
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
    expect(response.status(), SERVER_ANSWERED).toBeLessThan(500);

    await parkedOn('BUG-API-05', 'a non-numeric totalprice is accepted with 200 and stored as null', () => {
      expect(response.status()).toBeClientError();
    });
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
    expect(second.status(), SERVER_ANSWERED).toBeLessThan(500);

    // The defect is the 405: it says the resource does not support DELETE (RFC 9110 §15.5.6), which the first
    // DELETE disproved. 404 or 410 is the fix the RFC points to, but DELETE is idempotent (§9.2.2), so a server
    // may equally repeat its success answer, 201 here or 200/204, and that is a correct fix as well.
    await parkedOn('BUG-API-06', 'a second DELETE gets 405 Method Not Allowed instead of 404', () => {
      expect(second.status(), 'the second DELETE').not.toBe(405);
    });
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

    // Hard assertions, each naming its source: the first that fails parks the test, so while the echo is
    // truncated the stored value is not reached.
    await parkedOn(
      'BUG-API-07',
      'a decimal totalprice is truncated to a whole number, 111.99 becomes 111',
      () => {
        expect(toCents(created.booking.totalprice), 'totalprice echoed by POST /booking, in cents').toBe(
          PRICE_WITH_CENTS,
        );
        expect(toCents(storedBooking.totalprice), 'totalprice returned by GET /booking/:id, in cents').toBe(
          PRICE_WITH_CENTS,
        );
      },
    );
  },
);
