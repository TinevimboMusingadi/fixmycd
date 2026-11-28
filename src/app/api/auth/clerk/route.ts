import crypto from 'crypto';
import { NextResponse } from 'next/server';
import { eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/db';
import { users } from '@/db/schema';
import { createSession, isMobileClient } from '@/lib/auth';
import { clerkConfigured, verifyClerkUser } from '@/lib/clerk';
import { getCurrentEthics } from '@/lib/ethics';
import { clientIp, parseJsonBody, serverError } from '@/lib/http';
import { paymentsDemoEnabled } from '@/lib/payments-demo';
import { enforceRateLimit } from '@/lib/rate-limit';

const schema = z
  .object({
    token: z.string().min(20).max(4096),
    acceptEthics: z.boolean().optional(),
    displayName: z.string().trim().min(1).max(80).optional(),
  })
  .strict();

/**
 * Exchange a Clerk sign-in for a FixMyDistrict session.
 *
 * Answers with one of:
 *  - signed_in     — an approved account; our session is set (cookie, or `token` for the app).
 *  - needs_ethics  — a new person: they must agree to the Code of Ethics first.
 *  - needs_phone   — a new or pending account must verify a phone number (SMS through Clerk).
 *  - pending       — waiting for the $1 check (when enabled) or an admin's approval.
 * Social sign-ups never skip verification: a Google/LinkedIn/Facebook login proves an email, not a person.
 */
export async function POST(request: Request) {
  try {
    if (!clerkConfigured()) return NextResponse.json({ error: 'Social sign-in is not set up on this site' }, { status: 404 });
    const limited = await enforceRateLimit('loginByIp', clientIp(request));
    if (limited) return limited;

    const parsed = await parseJsonBody(request, schema);
    if (!parsed.ok) return parsed.response;
    const identity = await verifyClerkUser(parsed.data.token);
    if (!identity) return NextResponse.json({ error: 'Sign-in could not be verified. Please try again.' }, { status: 401 });
    if (!identity.email || !identity.emailVerified) {
      return NextResponse.json({ error: 'Your email address must be verified to use FixMyDistrict.' }, { status: 403 });
    }

    // Link: the Clerk user we know, or an existing account with the same verified email.
    let [user] = await db.select().from(users).where(eq(users.clerkUserId, identity.clerkUserId)).limit(1);
    if (!user) {
      const [byEmail] = await db.select().from(users).where(sql`lower(${users.email}) = ${identity.email}`).limit(1);
      if (byEmail) {
        if (byEmail.clerkUserId && byEmail.clerkUserId !== identity.clerkUserId) {
          return NextResponse.json({ error: 'This email is linked to a different sign-in. Use that one, or your password.' }, { status: 409 });
        }
        [user] = await db
          .update(users)
          .set({ clerkUserId: identity.clerkUserId, authProvider: identity.provider })
          .where(eq(users.id, byEmail.id))
          .returning();
      }
    }

    if (!user) {
      // A new person: the Code of Ethics first, then a pending account like any signup.
      if (!parsed.data.acceptEthics) return NextResponse.json({ status: 'needs_ethics' });
      const ethics = await getCurrentEthics();
      [user] = await db
        .insert(users)
        .values({
          id: crypto.randomUUID(),
          email: identity.email,
          displayName: parsed.data.displayName ?? identity.displayName,
          passwordHash: null,
          role: 'submitter',
          status: 'pending',
          ethicsAcceptedVersion: ethics.version,
          clerkUserId: identity.clerkUserId,
          authProvider: identity.provider,
          phoneVerifiedAt: identity.phoneVerified ? new Date() : null,
          createdAt: new Date(),
        })
        .returning();
    } else if (identity.phoneVerified && !user.phoneVerifiedAt) {
      [user] = await db.update(users).set({ phoneVerifiedAt: new Date() }).where(eq(users.id, user.id)).returning();
    }

    if (user.disabledAt) return NextResponse.json({ error: 'Account has been disabled' }, { status: 403 });
    if (user.status === 'rejected') return NextResponse.json({ error: 'Your account was not approved. Please contact support.' }, { status: 403 });

    if (user.status !== 'approved') {
      if (!user.phoneVerifiedAt) return NextResponse.json({ status: 'needs_phone' });
      return NextResponse.json({ status: 'pending', canVerifyByCard: paymentsDemoEnabled() });
    }

    const client = isMobileClient(request) ? 'mobile' : 'web';
    const session = await createSession(user.id, { client, method: `clerk:${identity.provider ?? 'email'}`, userAgent: request.headers.get('user-agent') });
    return NextResponse.json({
      status: 'signed_in',
      user: { id: user.id, email: user.email, displayName: user.displayName, role: user.role },
      ...(client === 'mobile' ? { token: session.token, expiresAt: session.expiresAt.toISOString() } : {}),
    });
  } catch (error: unknown) {
    return serverError(error, 'auth/clerk');
  }
}
