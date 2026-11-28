/**
 * Demo card checkout for the $1 identity check and donations.
 *
 * NO REAL MONEY MOVES. Only the standard test card number is accepted, and the
 * full card number and CVC are never stored or logged: only the last 4 digits
 * are kept. To take real payments, replace this with Stripe Checkout, so card
 * data never reaches our server (see docs/PAYMENTS.md).
 *
 * Kept free of database and framework code so it can be unit tested.
 */
import { z } from 'zod';

export const VERIFICATION_AMOUNT_CENTS = 100;

/**
 * The demo checkout activates pending accounts without a person reviewing them, so it is
 * off in production unless PAYMENTS_DEMO=1 is set on purpose (demo deployments).
 * Development and tests keep it on.
 */
export function paymentsDemoEnabled(env: Record<string, string | undefined> = process.env): boolean {
  if (env.PAYMENTS_DEMO === '1') return true;
  if (env.PAYMENTS_DEMO === '0') return false;
  return env.NODE_ENV !== 'production';
}

export const PAYMENTS_DISABLED_MESSAGE =
  'Card verification is turned off on this site. An admin will review your account instead.';
export const DEMO_TEST_CARD = '4242424242424242';
export const DONATION_PRESETS_CENTS = [100, 500, 1000, 2500] as const;
export const MIN_DONATION_CENTS = 100;
export const MAX_DONATION_CENTS = 100_000;

export type CardErrors = Partial<Record<'number' | 'expiry' | 'cvc' | 'name', string>>;
export type CardCheck = { ok: true; last4: string } | { ok: false; errors: CardErrors };

export function digitsOnly(value: string): string {
  return value.replace(/[\s-]/g, '');
}

/** Standard Luhn checksum, used by every card network. */
export function passesLuhn(number: string): boolean {
  if (!/^\d{12,19}$/.test(number)) return false;
  let sum = 0;
  let double = false;
  for (let i = number.length - 1; i >= 0; i--) {
    let d = Number(number[i]);
    if (double) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
    double = !double;
  }
  return sum % 10 === 0;
}

/** Accepts "MM/YY" or "MM/YYYY"; the card is valid through the end of that month. */
export function parseExpiry(value: string, now: Date = new Date()): { ok: true } | { ok: false; error: string } {
  const m = /^\s*(\d{1,2})\s*\/\s*(\d{2}|\d{4})\s*$/.exec(value);
  if (!m) return { ok: false, error: 'Use MM/YY' };
  const month = Number(m[1]);
  const year = m[2].length === 2 ? 2000 + Number(m[2]) : Number(m[2]);
  if (month < 1 || month > 12) return { ok: false, error: 'Month must be 01–12' };
  const endOfMonth = Date.UTC(year, month, 1);
  if (endOfMonth <= now.getTime()) return { ok: false, error: 'This card has expired' };
  if (year > now.getUTCFullYear() + 20) return { ok: false, error: 'Check the year' };
  return { ok: true };
}

export function checkDemoCard(
  card: { number: string; expiry: string; cvc: string; name: string },
  now: Date = new Date(),
): CardCheck {
  const errors: CardErrors = {};
  const number = digitsOnly(card.number);

  if (!passesLuhn(number)) errors.number = 'Enter a valid card number';
  else if (number !== DEMO_TEST_CARD) errors.number = 'Demo mode: this card is not accepted. Use the test card shown above.';

  const expiry = parseExpiry(card.expiry, now);
  if (!expiry.ok) errors.expiry = expiry.error;
  if (!/^\d{3,4}$/.test(card.cvc.trim())) errors.cvc = 'CVC is 3 or 4 digits';
  if (card.name.trim().length < 2) errors.name = 'Enter the name on the card';

  return Object.keys(errors).length ? { ok: false, errors } : { ok: true, last4: number.slice(-4) };
}

const cardField = z.object({
  number: z.string().max(40),
  expiry: z.string().max(10),
  cvc: z.string().max(6),
  name: z.string().max(100),
});

export const verifyPaymentSchema = z.object({
  email: z.preprocess((v) => (typeof v === 'string' ? v.trim().toLowerCase() : v), z.string().min(1).max(254)),
  password: z.string().min(1).max(1024),
  card: cardField,
});

export const donationSchema = z.object({
  amountCents: z.number().int().min(MIN_DONATION_CENTS).max(MAX_DONATION_CENTS),
  card: cardField,
});

export function formatUsd(cents: number): string {
  return `$${(cents / 100).toFixed(cents % 100 === 0 ? 0 : 2)}`;
}
