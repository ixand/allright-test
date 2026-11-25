import { appendFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { test as base, expect as baseExpect, type TestInfo } from '@playwright/test';
import { BookingClient } from './client/BookingClient.ts';
import { listedBookingIds, parseCreatedBooking, parseToken, type Booking } from './client/schema.ts';
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

/** apidoc DeleteBooking: "HTTP/1.1 201 Created". */
const DELETED = 201;

/** One DELETE is repeated once: a single network blip should not leave a booking on a shared sandbox. */
const DELETE_ATTEMPTS = 2;

/**
 * Teardown runs inside the 30 s test timeout and one request may take 15 s. Once this much is spent no new
 * request is started and what is left is recorded as a leftover, before Playwright cuts the teardown short.
 */
const CLEANUP_BUDGET_MS = 12_000;
const OUT_OF_TIME = 'cleanup ran out of time';

/**
 * Relative to the directory of playwright.config.ts. One line per booking that could not be deleted:
 * `<ISO 8601 time>\t#<id> (<what the API answered>)\t<test title path>`.
 *
 * The in-run errors are not enough on their own: with retries a test that leaks on the first attempt ends as
 * "flaky" in a green run. The file outlives the retry, so CI can fail on it. It is only ever appended to, because a line stays true until somebody deletes that booking; CI starts
 * from a fresh checkout, so there the file exists only if this run wrote it.
 */
const LEFTOVER_FILE = path.join('playwright', 'leftover-bookings.txt');

function firstLine(error: unknown): string {
  return (error instanceof Error ? error.message : String(error)).split('\n', 1)[0] ?? '';
}

function persistLeftover(testInfo: TestInfo, leftover: string): void {
  // config.rootDir is the testDir, not the project root, hence the config file's own directory.
  const { configFile, rootDir } = testInfo.config;
  const file = path.join(configFile === undefined ? rootDir : path.dirname(configFile), LEFTOVER_FILE);
  try {
    mkdirSync(path.dirname(file), { recursive: true });
    appendFileSync(file, `${new Date().toISOString()}\t${leftover}\t${testInfo.titlePath.join(' › ')}\n`);
  } catch (error) {
    // Cleanup must go on to the next booking; the in-run reporting still names this one.
    console.error(`Could not write ${file}: ${firstLine(error)}`);
  }
}

/**
 * Deletes a booking and returns nothing, or returns why it may still be on the sandbox. Never throws.
 *
 * Only 201 is taken at its word. Any other outcome is checked with a GET, where 404 or 410 means the booking is
 * gone: the test deleted it itself (restful-booker then answers DELETE with 405, see BUG-API-06), the sandbox
 * reset its data, or a DELETE that threw was applied after all.
 */
async function deleteBooking(
  client: BookingClient,
  id: number,
  outOfTime: () => boolean,
): Promise<string | undefined> {
  let outcome = 'DELETE not sent';
  for (let attempt = 1; attempt <= DELETE_ATTEMPTS; attempt += 1) {
    if (outOfTime()) return `${outcome}, ${OUT_OF_TIME}`;
    try {
      const response = await client.delete(id, { basic: ADMIN });
      if (response.status() === DELETED) return undefined;
      outcome = `DELETE answered ${response.status()}`;
    } catch (error) {
      outcome = `DELETE threw ${firstLine(error)}`;
    }
    if (outOfTime()) return `${outcome}, ${OUT_OF_TIME}`;
    try {
      const check = await client.get(id);
      if (GONE.includes(check.status())) return undefined;
      outcome += `, GET answered ${check.status()}`;
    } catch (error) {
      outcome += `, GET threw ${firstLine(error)}`;
    }
  }
  return outcome;
}

export const expect = baseExpect.extend({
  /**
   * RFC 9110 §15.5: a 4xx status says the client erred. Any of them is a correct answer to a request the API
   * should refuse, so a known-bug test that accepts them all passes with every fix.
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
    const keep = (leftover: string): void => {
      leftovers.push(leftover);
      // Written at once, not after the loop, so a teardown that is cut short has still recorded what it knew.
      persistLeftover(testInfo, leftover);
    };

    const deadline = Date.now() + CLEANUP_BUDGET_MS;
    const outOfTime = (): boolean => Date.now() > deadline;

    const ids = new Set(client.createdIds);
    for (const guest of client.unconfirmedCreates) {
      const label = `#unknown-id firstname=${guest.firstname} lastname=${guest.lastname}`;
      if (outOfTime()) {
        keep(`${label} (GET /booking not sent, ${OUT_OF_TIME})`);
        continue;
      }
      try {
        const response = await client.findByName(guest);
        if (response.status() === 200) {
          for (const id of listedBookingIds(await response.json())) ids.add(id);
        } else {
          keep(`${label} (GET /booking answered ${response.status()})`);
        }
      } catch (error) {
        keep(`${label} (GET /booking threw ${firstLine(error)})`);
      }
    }
    for (const id of ids) {
      const outcome = await deleteBooking(client, id, outOfTime);
      if (outcome !== undefined) keep(`#${id} (${outcome})`);
    }
    if (leftovers.length > 0) {
      // The error below fails this attempt, a parked @bug test included, but a retry can still end the test
      // as "flaky". So the worker ledger reports these bookings again, outside any test.
      console.error(`Bookings left on the sandbox: ${leftovers.join(', ')}`);
      leftoverBookings.push(`${leftovers.join(', ')} from ${testInfo.titlePath.join(' › ')}`);
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
