import { NextResponse } from 'next/server';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { and, eq, sql } from 'drizzle-orm';
import { db } from '@/db';
import { demoPayments, users } from '@/db/schema';
import { createSession, isMobileClient } from '@/lib/auth';
import { verifyClerkUser } from '@/lib/clerk';
import { badRequest, clientIp, parseJsonBody, serverError } from '@/lib/http';
import { enforceRateLimit } from '@/lib/rate-limit';
import { dummyPasswordHash, enforceAccountLimits } from '@/lib/password';
import { VERIFICATION_AMOUNT_CENTS, checkDemoCard, verifyPaymentSchema, PAYMENTS_DISABLED_MESSAGE, paymentsDemoEnabled } from '@/lib/payments-demo';

const invalidCredentials = () => NextResponse.json({ error: 'Invalid email or password' }, { status: 401 });

/**
 * $1 identity check (DEMO — no real charge). The account owner proves who they are
 * with their email and password, pays with the test card, and their pending account
 * is activated and signed in without waiting for an admin. Asking for the password
 * keeps the "is this email registered?" question unanswerable, as at signup.
 */
export async function POST(request: Request) {
  try {
    if (!paymentsDemoEnabled()) {
      return NextResponse.json({ error: PAYMENTS_DISABLED_MESSAGE, code: 'payments_disabled' }, { status: 403 });
    }
    const limited = await enforceRateLimit('payment', clientIp(request));
    if (limited) return limited;

    const parsed = await parseJsonBody(request, verifyPaymentSchema);
    if (!parsed.ok) return parsed.response;
    const { card } = parsed.data;
    const columns = { id: users.id, passwordHash: users.passwordHash, status: users.status, disabledAt: users.disabledAt, phoneVerifiedAt: users.phoneVerifiedAt };

    let user: { id: string; passwordHash: string | null; status: string; disabledAt: Date | null; phoneVerifiedAt: Date | null } | undefined;
    if ('clerkToken' in parsed.data) {
      const identity = await verifyClerkUser(parsed.data.clerkToken);
      if (!identity) return NextResponse.json({ error: 'Sign-in could not be verified. Please try again.' }, { status: 401 });
      [user] = await db.select(columns).from(users).where(eq(users.clerkUserId, identity.clerkUserId)).limit(1);
      if (!user) return NextResponse.json({ error: 'Finish signing up first.' }, { status: 404 });
      // Social sign-ups confirm a phone number before they can activate.
      if (!user.phoneVerifiedAt) return NextResponse.json({ error: 'Verify your phone number first.', code: 'needs_phone' }, { status: 403 });
    } else {
      const { email, password } = parsed.data;
      const limitedByAccount = await enforceAccountLimits(email, clientIp(request));
      if (limitedByAccount) return limitedByAccount;
      [user] = await db.select(columns).from(users).where(sql`lower(${users.email}) = ${email}`).limit(1);
      const passwordOk = await bcrypt.compare(password, user?.passwordHash ?? dummyPasswordHash());
      if (!user || !user.passwordHash || !passwordOk) return invalidCredentials();
    }

    if (user.disabledAt) return NextResponse.json({ error: 'Account has been disabled' }, { status: 403 });
    if (user.status === 'approved') {
      return NextResponse.json({ error: 'Your account is already active. Just log in.' }, { status: 409 });
    }
    if (user.status !== 'pending') {
      return NextResponse.json({ error: 'Your account was not approved. Please contact support.' }, { status: 403 });
    }

    const checked = checkDemoCard(card);
    if (!checked.ok) return badRequest('Check your card details', checked.errors);

    const now = new Date();
    const activated = await db.transaction(async (tx) => {
      const rows = await tx
        .update(users)
        .set({ status: 'approved', verifiedAt: now, verificationMethod: 'card_demo' })
        .where(and(eq(users.id, user.id), eq(users.status, 'pending')))
        .returning({ id: users.id });
      if (!rows[0]) return false;
      await tx.insert(demoPayments).values({
        id: crypto.randomUUID(),
        userId: user.id,
        kind: 'verification',
        amountCents: VERIFICATION_AMOUNT_CENTS,
        last4: checked.last4,
        createdAt: now,
      });
      return true;
    });
    if (!activated) return NextResponse.json({ error: 'Your account is already active. Just log in.' }, { status: 409 });

    const client = isMobileClient(request) ? 'mobile' : 'web';
    const session = await createSession(user.id, { client, method: 'card_demo', userAgent: request.headers.get('user-agent') });
    return NextResponse.json({
      success: true,
      verified: true,
      demo: true,
      ...(client === 'mobile' ? { token: session.token, expiresAt: session.expiresAt.toISOString() } : {}),
    });
  } catch (error: unknown) {
    return serverError(error, 'verify');
  }
}
