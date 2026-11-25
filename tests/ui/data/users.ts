export type Credentials = { readonly username: string; readonly password: string };

const PASSWORD = 'secret_sauce';

export const users = {
  standard: { username: 'standard_user', password: PASSWORD },
  lockedOut: { username: 'locked_out_user', password: PASSWORD },
} as const satisfies Record<string, Credentials>;

export type Customer = { readonly firstName: string; readonly lastName: string; readonly postalCode: string };

/** Valid checkout information; tests override single fields to exercise validation. */
export const customer: Customer = { firstName: 'Jane', lastName: 'Doe', postalCode: '10001' };
