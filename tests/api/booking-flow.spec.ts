import { parseCreatedBooking, parseToken } from './client/schema.ts';
import { ADMIN, newBooking, replacementBooking } from './data/bookings.ts';
import { expect, test } from './fixtures.ts';

test('booking lifecycle: auth, create, read, update, delete, then the booking is gone', async ({
  client,
}) => {
  const original = newBooking();
  const replacement = replacementBooking();

  const token =
    await test.step('POST /auth with the apidoc credentials returns a non-empty token (apidoc: 200)', async () => {
      const response = await client.auth(ADMIN);
      expect(response.status()).toBe(200);
      return parseToken(await response.json());
    });

  const id =
    await test.step('POST /booking returns a numeric bookingid and echoes the payload (apidoc: 200)', async () => {
      const response = await client.create(original);
      expect(response.status()).toBe(200);
      const created = parseCreatedBooking(await response.json());
      expect(created.booking).toEqual(original);
      return created.bookingid;
    });

  await test.step('GET /booking/:id returns the created booking (apidoc: 200)', async () => {
    const response = await client.get(id);
    expect(response.status()).toBe(200);
    expect(await response.json()).toEqual(original);
  });

  await test.step('PUT /booking/:id with the token returns the replacement (apidoc: 200)', async () => {
    const response = await client.update(id, replacement, { token });
    expect(response.status()).toBe(200);
    expect(await response.json()).toEqual(replacement);
  });

  await test.step('GET /booking/:id reflects the update', async () => {
    const response = await client.get(id);
    expect(response.status()).toBe(200);
    expect(await response.json()).toEqual(replacement);
  });

  await test.step('PATCH /booking/:id with the token changes totalprice only (apidoc: 200)', async () => {
    const response = await client.patch(id, { totalprice: 999 }, { token });
    expect(response.status()).toBe(200);
    expect(await response.json()).toEqual({ ...replacement, totalprice: 999 });
  });

  await test.step('DELETE /booking/:id with the token answers 201 (apidoc: "HTTP/1.1 201 Created")', async () => {
    const response = await client.delete(id, { token });
    expect(response.status()).toBe(201);
  });

  await test.step('GET /booking/:id after the delete answers 404 (RFC 9110 §15.5.5; the apidoc documents no errors)', async () => {
    const response = await client.get(id);
    expect(response.status()).toBe(404);
  });
});
