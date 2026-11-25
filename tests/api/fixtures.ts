import { test as base, expect } from '@playwright/test';
import { BookingClient } from './client/BookingClient.ts';
import { parseCreatedBooking, parseToken, type Booking } from './client/schema.ts';
import { ADMIN, newBooking } from './data/bookings.ts';

/** A booking this test created, with the payload that is its expected state. */
export type OwnBooking = {
  id: number;
  payload: Booking;
};

type ApiFixtures = {
  client: BookingClient;
  token: string;
  booking: OwnBooking;
};

/**
 * 201: deleted now (apidoc). 404 or 405: already gone, because the test deleted it or the sandbox reset
 * its data; restful-booker answers 405 for a booking that no longer exists.
 */
const CLEANUP_STATUSES = new Set([201, 404, 405]);

export const test = base.extend<ApiFixtures>({
  client: async ({ request }, use) => {
    const client = new BookingClient(request);
    await use(client);

    const leftovers: string[] = [];
    for (const id of client.createdIds) {
      const response = await client.delete(id, { basic: ADMIN });
      if (!CLEANUP_STATUSES.has(response.status()))
        leftovers.push(`#${id} (DELETE answered ${response.status()})`);
    }
    if (leftovers.length > 0) {
      // A @bug test is expected to fail, and that would hide this error too; the log line keeps it visible.
      console.error(`Bookings left on the sandbox: ${leftovers.join(', ')}`);
      throw new Error(`Could not delete bookings: ${leftovers.join(', ')}`);
    }
  },

  token: async ({ client }, use) => {
    const response = await client.auth(ADMIN);
    expect(response.status(), 'POST /auth with the apidoc credentials').toBe(200);
    await use(parseToken(await response.json()));
  },

  booking: async ({ client }, use) => {
    const payload = newBooking();
    const response = await client.create(payload);
    expect(response.status(), 'POST /booking with a valid payload (apidoc: 200)').toBe(200);
    const created = parseCreatedBooking(await response.json());
    expect(created.booking, 'the created booking echoes the payload (apidoc)').toEqual(payload);
    // No teardown here: the client fixture deletes every booking it created, this one included.
    await use({ id: created.bookingid, payload });
  },
});

export { expect };
