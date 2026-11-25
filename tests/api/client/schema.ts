import { expect, type APIResponse } from '@playwright/test';

export type BookingDates = {
  checkin: string;
  checkout: string;
};

/** A booking as the apidoc describes it: every field is required by CreateBooking and UpdateBooking. */
export type Booking = {
  firstname: string;
  lastname: string;
  totalprice: number;
  depositpaid: boolean;
  bookingdates: BookingDates;
  additionalneeds: string;
};

/** apidoc CreateBooking, Success 200. */
export type CreatedBooking = {
  bookingid: number;
  booking: Booking;
};

export type Credentials = {
  username: string;
  password: string;
};

type JsonObject = Record<string, unknown>;

function isJsonObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** The apidoc gives booking dates as CCYY-MM-DD. */
const APIDOC_DATE = /^\d{4}-\d{2}-\d{2}$/;

function bookingProblems(value: unknown, path: string): string[] {
  if (!isJsonObject(value)) return [`${path} is ${JSON.stringify(value)}, expected an object`];
  const problems: string[] = [];
  const fieldTypes = {
    firstname: 'string',
    lastname: 'string',
    totalprice: 'number',
    depositpaid: 'boolean',
    additionalneeds: 'string',
  } as const;
  for (const [field, type] of Object.entries(fieldTypes)) {
    if (typeof value[field] !== type) {
      problems.push(`${path}.${field} is ${JSON.stringify(value[field])}, expected a ${type}`);
    }
  }
  const dates = value.bookingdates;
  if (!isJsonObject(dates)) {
    problems.push(`${path}.bookingdates is ${JSON.stringify(dates)}, expected an object`);
  } else {
    for (const field of ['checkin', 'checkout'] as const) {
      const date = dates[field];
      if (typeof date !== 'string' || !APIDOC_DATE.test(date)) {
        problems.push(`${path}.bookingdates.${field} is ${JSON.stringify(date)}, expected CCYY-MM-DD`);
      }
    }
  }
  return problems;
}

/** Narrows a CreateBooking response body, failing with every field that breaks the apidoc shape. */
export function parseCreatedBooking(body: unknown): CreatedBooking {
  const problems = isJsonObject(body)
    ? [
        ...(Number.isInteger(body.bookingid)
          ? []
          : [`bookingid is ${JSON.stringify(body.bookingid)}, expected an integer`]),
        ...bookingProblems(body.booking, 'booking'),
      ]
    : [`body is ${JSON.stringify(body)}, expected an object`];
  expect(problems, 'CreateBooking response shape (apidoc)').toEqual([]);
  return body as CreatedBooking;
}

/** Narrows a GetBooking response body, failing with every field that breaks the apidoc shape. */
export function parseBooking(body: unknown): Booking {
  expect(bookingProblems(body, 'body'), 'GetBooking response shape (apidoc)').toEqual([]);
  return body as Booking;
}

/** Narrows a CreateToken response body: apidoc 200 { token }, and an empty token could authorise nothing. */
export function parseToken(body: unknown): string {
  const token = isJsonObject(body) ? body.token : undefined;
  expect(token, 'CreateToken response: { token: <non-empty string> } (apidoc)').toEqual(
    expect.stringMatching(/\S/),
  );
  return token as string;
}

/**
 * A response body as JSON, or as its raw text when it is not JSON. The apidoc documents no error bodies, and a
 * fix may refuse with plain text such as 401 "Unauthorized"; a check on what the body carries, e.g. that it has
 * no token, then judges that text instead of failing on JSON.parse.
 */
export async function readBody(response: APIResponse): Promise<unknown> {
  const text = await response.text();
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

/** The id from a CreateBooking body, read leniently so that wrongly accepted payloads are still cleaned up. */
export function createdBookingId(body: unknown): number | undefined {
  return isJsonObject(body) && typeof body.bookingid === 'number' ? body.bookingid : undefined;
}

/** The ids from a GetBookingIds body (apidoc: [{ bookingid }]), read leniently for the same reason. */
export function listedBookingIds(body: unknown): number[] {
  if (!Array.isArray(body)) return [];
  return body.flatMap((item: unknown) => {
    const id = createdBookingId(item);
    return id === undefined ? [] : [id];
  });
}
