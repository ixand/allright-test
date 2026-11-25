import { test as base, expect as baseExpect } from '@playwright/test';
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

type ApiWorkerFixtures = {
  /** Bookings that this worker's tests created and could not delete, one line per test. */
  leftoverBookings: string[];
};

/** RFC 9110 §15.5.5 404 Not Found, or §15.5.11 410 Gone when the server knows the booking is gone for good. */
export const GONE = [404, 410];

/**
 * 201: deleted now (apidoc). 404, 405 or 410: already gone, because the test deleted it or the sandbox reset
 * its data; restful-booker answers 405 for a booking that no longer exists, and 404 or 410 once BUG-API-06 is
 * fixed.
 */
const CLEANUP_STATUSES = new Set([201, 405, ...GONE]);

export const expect = baseExpect.extend({
  /**
   * RFC 9110 §15.5: a 4xx status says the client erred. Any of them is a correct answer to a request the API
   * should refuse, so a known-bug test that accepts them all turns "unexpectedly passed" with every fix.
   */
  toBeClientError(status: number) {
    const pass = status >= 400 && status <= 499;
    return {
      pass,
      name: 'toBeClientError',
      expected: '4xx',
      actual: status,
      message: () =>
        `${this.utils.matcherHint('toBeClientError', 'status', '', { isNot: this.isNot })}\n\n` +
        `Expected: ${this.isNot ? 'not ' : ''}a 4xx client error status (RFC 9110 §15.5)\n` +
        `Received: ${this.utils.printReceived(status)}`,
    };
  },
});

export const test = base.extend<ApiFixtures, ApiWorkerFixtures>({
  leftoverBookings: [
    async ({}, use) => {
      const leftovers: string[] = [];
      await use(leftovers);
      if (leftovers.length > 0)
        throw new Error(`Bookings left on the sandbox:\n${leftovers.map((line) => `  ${line}`).join('\n')}`);
    },
    { scope: 'worker' },
  ],

  client: async ({ request, leftoverBookings }, use, testInfo) => {
    const client = new BookingClient(request);
    await use(client);

    const leftovers: string[] = [];
    for (const id of client.createdIds) {
      const response = await client.delete(id, { basic: ADMIN });
      if (!CLEANUP_STATUSES.has(response.status()))
        leftovers.push(`#${id} (DELETE answered ${response.status()})`);
    }
    if (leftovers.length > 0) {
      // test.fail() in a @bug test absorbs the error below, so the worker ledger reports these bookings again,
      // outside any test.
      console.error(`Bookings left on the sandbox: ${leftovers.join(', ')}`);
      leftoverBookings.push(`${leftovers.join(', ')} from ${testInfo.titlePath.join(' › ')}`);
      throw new Error(`Could not delete bookings: ${leftovers.join(', ')}`);
    }
    if (testInfo.expectedStatus === 'failed' && testInfo.status === 'passed') {
      // A @bug test that passes unexpectedly makes Playwright tear the worker down inside it, where an error from
      // the ledger would turn it back into the expected failure. The run is red without that error, and the log
      // line above has already named every booking left by an earlier test.
      leftoverBookings.length = 0;
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
