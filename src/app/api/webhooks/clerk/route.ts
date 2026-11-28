import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { Webhook } from 'svix';
import { db } from '@/db';
import { users } from '@/db/schema';
import { revokeUserSessions } from '@/lib/auth';
import { serverError } from '@/lib/http';

type ClerkEvent = {
  type: string;
  data: { id?: string; deleted?: boolean; phone_numbers?: { verification?: { status?: string } | null }[] };
};

/**
 * Clerk → us, signed with Svix (CLERK_WEBHOOK_SECRET). Keeps linked accounts in step:
 *  - user.deleted: disable the linked account and end its sessions.
 *  - user.updated: record a newly verified phone number.
 */
export async function POST(request: Request) {
  try {
    const secret = process.env.CLERK_WEBHOOK_SECRET;
    if (!secret) return NextResponse.json({ error: 'Not configured' }, { status: 404 });
    const body = await request.text();
    if (body.length > 256 * 1024) return NextResponse.json({ error: 'Too large' }, { status: 413 });
    let event: ClerkEvent;
    try {
      // Throws unless the signature and timestamp check out.
      new Webhook(secret).verify(body, {
        'svix-id': request.headers.get('svix-id') ?? '',
        'svix-timestamp': request.headers.get('svix-timestamp') ?? '',
        'svix-signature': request.headers.get('svix-signature') ?? '',
      });
      event = JSON.parse(body) as ClerkEvent;
    } catch {
      return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
    }
    const clerkId = event.data.id;
    if (!clerkId) return NextResponse.json({ ok: true });
    const [user] = await db.select({ id: users.id, phoneVerifiedAt: users.phoneVerifiedAt }).from(users).where(eq(users.clerkUserId, clerkId)).limit(1);
    if (!user) return NextResponse.json({ ok: true });

    if (event.type === 'user.deleted') {
      await db.update(users).set({ disabledAt: new Date() }).where(eq(users.id, user.id));
      await revokeUserSessions(user.id);
    } else if (event.type === 'user.updated') {
      const verified = (event.data.phone_numbers ?? []).some((p) => p.verification?.status === 'verified');
      if (verified && !user.phoneVerifiedAt) await db.update(users).set({ phoneVerifiedAt: new Date() }).where(eq(users.id, user.id));
    }
    return NextResponse.json({ ok: true });
  } catch (error: unknown) {
    return serverError(error, 'webhooks/clerk');
  }
}
