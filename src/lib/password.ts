import bcrypt from 'bcryptjs';
import { PASSWORD_HASH_COST } from './auth';
import { enforceRateLimit } from './rate-limit';

let dummy: string | null = null;

/**
 * A hash at the same cost as real ones, compared against when an email is unknown so the
 * response takes as long as a real check and can't reveal whether the account exists.
 */
export function dummyPasswordHash(): string {
  if (!dummy) dummy = bcrypt.hashSync('not-a-real-password', PASSWORD_HASH_COST);
  return dummy;
}

/**
 * Login-style limits for one account: tight per account+IP (stops guessing from one place),
 * looser per account (stops distributed guessing without letting one stranger lock the owner out).
 */
export async function enforceAccountLimits(email: string, ip: string) {
  return (await enforceRateLimit('loginByAccountIp', `${email}|${ip}`)) ?? (await enforceRateLimit('loginByAccount', email));
}
