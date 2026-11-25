import type { APIRequestContext, APIResponse } from '@playwright/test';
import { createdBookingId, type Booking, type Credentials } from './schema.ts';

/** The sandbox normally answers in about half a second; 15 s means a stuck request, not a slow one. */
const REQUEST_TIMEOUT_MS = 15_000;

/** The apidoc accepts either a token cookie or Basic auth on PUT, PATCH and DELETE. */
export type Auth = { token: string } | { basic: Credentials };

function authHeaders(auth: Auth | undefined): Record<string, string> {
  if (auth === undefined) return {};
  if ('token' in auth) return { Cookie: `token=${auth.token}` };
  const { username, password } = auth.basic;
  return { Authorization: `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}` };
}

/** restful-booker over HTTP. Every method returns the raw response so tests can assert on status and body. */
export class BookingClient {
  private readonly request: APIRequestContext;
  private readonly created = new Set<number>();

  constructor(request: APIRequestContext) {
    this.request = request;
  }

  /** Every booking this client has created, whatever the test did with it afterwards. */
  get createdIds(): readonly number[] {
    return [...this.created];
  }

  auth(credentials: Credentials): Promise<APIResponse> {
    return this.request.post('/auth', { data: credentials, timeout: REQUEST_TIMEOUT_MS });
  }

  create(booking: Booking): Promise<APIResponse> {
    return this.postBooking(booking);
  }

  /** Sends a body that breaks the contract on purpose. */
  createUnchecked(body: Record<string, unknown>): Promise<APIResponse> {
    return this.postBooking(body);
  }

  get(id: number): Promise<APIResponse> {
    return this.request.get(`/booking/${id}`, { timeout: REQUEST_TIMEOUT_MS });
  }

  update(id: number, booking: Booking, auth?: Auth): Promise<APIResponse> {
    return this.request.put(`/booking/${id}`, {
      data: booking,
      headers: authHeaders(auth),
      timeout: REQUEST_TIMEOUT_MS,
    });
  }

  patch(id: number, changes: Partial<Booking>, auth?: Auth): Promise<APIResponse> {
    return this.request.patch(`/booking/${id}`, {
      data: changes,
      headers: authHeaders(auth),
      timeout: REQUEST_TIMEOUT_MS,
    });
  }

  delete(id: number, auth?: Auth): Promise<APIResponse> {
    return this.request.delete(`/booking/${id}`, { headers: authHeaders(auth), timeout: REQUEST_TIMEOUT_MS });
  }

  private async postBooking(data: Record<string, unknown>): Promise<APIResponse> {
    const response = await this.request.post('/booking', { data, timeout: REQUEST_TIMEOUT_MS });
    // Recorded here rather than in each test, so a payload the API should have rejected but stored is
    // deleted too, and so is a booking whose test failed before reaching its own DELETE.
    if (response.ok()) {
      const id = createdBookingId(await response.json().catch(() => undefined));
      if (id !== undefined) this.created.add(id);
    }
    return response;
  }
}
