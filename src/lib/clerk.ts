/**
 * Clerk is the "front door" for social sign-in (Google, LinkedIn, Facebook), email codes and SMS
 * phone checks. It only proves who someone is: once it does, /api/auth/clerk links that identity to
 * a FixMyDistrict account and issues our own session. Roles, approval, revocation and every API
 * check still run on our side.
 *
 * Everything here is inert until both keys are set, so the app (and CI) runs fine without Clerk.
 */

export function clerkConfigured(env: Record<string, string | undefined> = process.env): boolean {
  return !!env.CLERK_SECRET_KEY && !!env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
}

/** Clerk's Frontend API host, encoded in the publishable key (pk_test_<base64("host$")>). */
export function clerkFrontendApiHost(publishableKey = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY): string | null {
  const m = /^pk_(test|live)_([A-Za-z0-9+/=_-]+)$/.exec(publishableKey ?? '');
  if (!m) return null;
  try {
    const host = atob(m[2].replace(/-/g, '+').replace(/_/g, '/')).replace(/\$$/, '');
    return /^[a-z0-9.-]+$/i.test(host) ? host.toLowerCase() : null;
  } catch {
    return null;
  }
}

/** Origins allowed to have minted a Clerk session token we accept (the token's `azp`). */
export function clerkAuthorizedParties(): string[] {
  const list = [process.env.NEXT_PUBLIC_BASE_URL, ...(process.env.CLERK_AUTHORIZED_PARTIES ?? '').split(',')]
    .map((s) => s?.trim().replace(/\/$/, ''))
    .filter((s): s is string => !!s);
  if (process.env.VERCEL_URL) list.push(`https://${process.env.VERCEL_URL}`);
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) list.push(`https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`);
  return Array.from(new Set(list));
}

export type ClerkIdentity = {
  clerkUserId: string;
  email: string | null;
  emailVerified: boolean;
  phoneVerified: boolean;
  provider: string | null;
  displayName: string | null;
};

/** Social provider id as we store it: 'google', 'linkedin_oidc', 'facebook'… */
export function providerName(raw: string | null | undefined): string | null {
  if (!raw) return null;
  return raw.replace(/^oauth_/, '');
}

/**
 * Verifies a Clerk session token (signature, expiry, issuer via the secret key's JWKS, and the
 * authorized party for browser tokens) and loads the Clerk user server-side. Returns null when the
 * token isn't valid. The phone app's tokens carry no `azp`, which Clerk accepts.
 */
export async function verifyClerkUser(token: string): Promise<ClerkIdentity | null> {
  if (!clerkConfigured() || !token || token.length > 4096) return null;
  const { verifyToken, createClerkClient } = await import('@clerk/backend');
  let sub: string | undefined;
  try {
    const parties = clerkAuthorizedParties();
    const payload = await verifyToken(token, {
      secretKey: process.env.CLERK_SECRET_KEY,
      ...(parties.length ? { authorizedParties: parties } : {}),
    });
    sub = typeof payload.sub === 'string' ? payload.sub : undefined;
  } catch {
    return null;
  }
  if (!sub) return null;
  const clerk = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY });
  const u = await clerk.users.getUser(sub);
  const primary = u.emailAddresses.find((e) => e.id === u.primaryEmailAddressId) ?? u.emailAddresses[0];
  const name = [u.firstName, u.lastName].filter(Boolean).join(' ').trim() || u.username || null;
  return {
    clerkUserId: u.id,
    email: primary?.emailAddress?.trim().toLowerCase() ?? null,
    emailVerified: primary?.verification?.status === 'verified',
    phoneVerified: u.phoneNumbers.some((p) => p.verification?.status === 'verified'),
    provider: providerName(u.externalAccounts[0]?.provider) ?? 'email',
    displayName: name ? name.slice(0, 80) : null,
  };
}
