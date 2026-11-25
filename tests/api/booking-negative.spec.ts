import { parseToken } from './client/schema.ts';
import { ADMIN, replacementBooking } from './data/bookings.ts';
import { expect, test } from './fixtures.ts';

/**
 * The apidoc documents no error responses, so the expectation comes from RFC 9110: a request without
 * valid credentials is not applied and is answered 401 (§15.5.2) or 403 (§15.5.4).
 */
const ACCESS_REFUSED = [401, 403];

/** Booking ids are issued sequentially and are in the thousands; this one has never existed. */
const NEVER_ISSUED_ID = 999_999_999;

test('PUT without credentials is refused with 401 or 403 (RFC 9110) and the booking is unchanged', async ({
  client,
  booking,
}) => {
  const response = await client.update(booking.id, replacementBooking());
  expect(ACCESS_REFUSED, `PUT without credentials answered ${response.status()}`).toContain(
    response.status(),
  );

  const after = await client.get(booking.id);
  expect(after.status()).toBe(200);
  expect(await after.json()).toEqual(booking.payload);
});

test('DELETE with an invalid token is refused with 401 or 403 (RFC 9110) and the booking still exists', async ({
  client,
  booking,
}) => {
  const response = await client.delete(booking.id, { token: 'not-a-valid-token' });
  expect(ACCESS_REFUSED, `DELETE with an invalid token answered ${response.status()}`).toContain(
    response.status(),
  );

  const after = await client.get(booking.id);
  expect(after.status()).toBe(200);
  expect(await after.json()).toEqual(booking.payload);
});

test('GET of a booking id that was never issued answers 404 (RFC 9110 §15.5.5)', async ({
  client,
  booking,
}) => {
  // Control: the same route serves a booking that exists, so the 404 below is about the id.
  const existing = await client.get(booking.id);
  expect(existing.status()).toBe(200);

  const response = await client.get(NEVER_ISSUED_ID);
  expect(response.status()).toBe(404);
});

test('POST /auth with a wrong password returns no token', async ({ client }) => {
  // Control: the same request with the right password does return a token.
  const accepted = await client.auth(ADMIN);
  expect(accepted.status()).toBe(200);
  parseToken(await accepted.json());

  const rejected = await client.auth({ ...ADMIN, password: 'wrong-password' });
  expect(await rejected.json()).not.toHaveProperty('token');
});
