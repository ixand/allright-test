import { parseToken } from './client/schema.ts';
import { ADMIN } from './data/bookings.ts';
import { expect, test } from './fixtures.ts';

// Each test asserts the correct behaviour and is expected to fail until the bug is fixed. test.fail() is
// called only after the positive controls: a control that breaks before that point is reported as a real
// failure instead of being absorbed as the expected one.
//
// The apidoc documents no error responses, so every expected status below comes from RFC 9110.
// In BUG-API-02..05 the `booking` fixture is the control: it creates a booking from the same payload and
// asserts 200, so each request differs from an accepted one only in the field under test.

test(
  'BUG-API-01: POST /auth with a wrong password answers 401 (RFC 9110 §15.5.2)',
  { tag: '@bug' },
  async ({ client }) => {
    const accepted = await client.auth(ADMIN);
    expect(accepted.status(), 'control: the right password is accepted').toBe(200);
    parseToken(await accepted.json());
    const rejected = await client.auth({ ...ADMIN, password: 'wrong-password' });
    expect(await rejected.json(), 'control: the wrong password gets no token').not.toHaveProperty('token');

    test.fail(true, 'BUG-API-01: wrong credentials get 200 {"reason":"Bad credentials"} instead of 401');
    expect(rejected.status()).toBe(401);
  },
);

test(
  'BUG-API-02: POST /booking without firstname answers 400 (RFC 9110 §15.5.1)',
  { tag: '@bug' },
  async ({ client, booking }) => {
    const { firstname: _omitted, ...withoutFirstname } = booking.payload;
    const response = await client.createUnchecked(withoutFirstname);

    test.fail(true, 'BUG-API-02: a missing required field gets 500 Internal Server Error instead of 400');
    expect(response.status()).toBe(400);
  },
);

test(
  'BUG-API-03: POST /booking with invalid dates answers 400 (RFC 9110 §15.5.1)',
  { tag: '@bug' },
  async ({ client, booking }) => {
    const response = await client.createUnchecked({
      ...booking.payload,
      bookingdates: { checkin: 'not-a-date', checkout: '2026-13-45' },
    });

    test.fail(true, 'BUG-API-03: invalid date strings are accepted with 200 and stored as "0NaN-aN-aN"');
    expect(response.status()).toBe(400);
  },
);

test(
  'BUG-API-04: POST /booking with checkout before checkin answers 400 (RFC 9110 §15.5.1)',
  { tag: '@bug' },
  async ({ client, booking }) => {
    const { checkin, checkout } = booking.payload.bookingdates;
    const response = await client.createUnchecked({
      ...booking.payload,
      bookingdates: { checkin: checkout, checkout: checkin },
    });

    test.fail(true, 'BUG-API-04: a checkout earlier than the checkin is accepted with 200');
    expect(response.status()).toBe(400);
  },
);

test(
  'BUG-API-05: POST /booking with a non-numeric totalprice answers 400 (RFC 9110 §15.5.1)',
  { tag: '@bug' },
  async ({ client, booking }) => {
    const response = await client.createUnchecked({ ...booking.payload, totalprice: 'abc' });

    test.fail(true, 'BUG-API-05: a non-numeric totalprice is accepted with 200 and stored as null');
    expect(response.status()).toBe(400);
  },
);

test(
  'BUG-API-06: DELETE of an already deleted booking answers 404 (RFC 9110 §15.5.5)',
  { tag: '@bug' },
  async ({ client, booking, token }) => {
    const first = await client.delete(booking.id, { token });
    expect(first.status(), 'control: the first DELETE succeeds (apidoc: 201)').toBe(201);
    const gone = await client.get(booking.id);
    expect(gone.status(), 'control: the booking is gone').toBe(404);
    const second = await client.delete(booking.id, { token });

    test.fail(true, 'BUG-API-06: a second DELETE gets 405 Method Not Allowed instead of 404');
    expect(second.status()).toBe(404);
  },
);
