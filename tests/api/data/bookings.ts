import { randomUUID } from 'node:crypto';
import type { Booking, Credentials } from '../client/schema.ts';

/** apidoc CreateToken defaults. */
export const ADMIN: Credentials = { username: 'admin', password: 'password123' };

/** The sandbox is shared, so every name is unique to make our bookings unmistakable. */
export function uniqueName(): string {
  return `QA-${randomUUID().slice(0, 8)}`;
}

/**
 * A valid booking in the shape of the apidoc example. totalprice stays a whole number so that it is
 * compared exactly and never as a float.
 */
export function newBooking(overrides: Partial<Booking> = {}): Booking {
  return {
    firstname: uniqueName(),
    lastname: uniqueName(),
    totalprice: 111,
    depositpaid: true,
    bookingdates: { checkin: '2026-12-01', checkout: '2026-12-10' },
    additionalneeds: 'Breakfast',
    ...overrides,
  };
}

/** A valid booking that differs from newBooking() in every field, so a full update shows field by field. */
export function replacementBooking(): Booking {
  return newBooking({
    totalprice: 222,
    depositpaid: false,
    bookingdates: { checkin: '2027-01-05', checkout: '2027-01-07' },
    additionalneeds: 'Late checkout',
  });
}
