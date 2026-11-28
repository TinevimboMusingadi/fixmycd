import { NextResponse } from 'next/server';
import { and, desc, eq, gt, ne } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/db';
import { sessions } from '@/db/schema';
import { currentSessionToken, hashSessionToken, isAuthError, requireUser } from '@/lib/auth';
import { notFound, parseJsonBody, serverError } from '@/lib/http';

/** Signed-in devices of the current user (newest activity first). */
export async function GET() {
  try {
    const user = await requireUser();
    if (isAuthError(user)) return user;
    const token = await currentSessionToken();
    const current = token ? hashSessionToken(token) : null;
    const rows = await db
      .select({ id: sessions.id, client: sessions.client, authMethod: sessions.authMethod, userAgent: sessions.userAgent, createdAt: sessions.createdAt, lastSeenAt: sessions.lastSeenAt })
      .from(sessions)
      .where(and(eq(sessions.userId, user.id), gt(sessions.expiresAt, new Date())))
      .orderBy(desc(sessions.lastSeenAt));
    return NextResponse.json(
      rows.map((r) => ({
        // The id is a hash of the token, never the token itself; only its owner sees it.
        id: r.id,
        client: r.client,
        method: r.authMethod,
        device: r.userAgent,
        createdAt: r.createdAt.toISOString(),
        lastSeenAt: r.lastSeenAt.toISOString(),
        current: r.id === current,
      }))
    );
  } catch (error: unknown) {
    return serverError(error, 'auth/sessions GET');
  }
}

const deleteSchema = z.union([z.object({ id: z.string().min(16).max(128) }).strict(), z.object({ others: z.literal(true) }).strict()]);

/** Sign out one device ({id}) or every other device ({others: true}). */
export async function DELETE(request: Request) {
  try {
    const user = await requireUser();
    if (isAuthError(user)) return user;
    const parsed = await parseJsonBody(request, deleteSchema);
    if (!parsed.ok) return parsed.response;
    if ('others' in parsed.data) {
      const token = await currentSessionToken();
      const current = token ? hashSessionToken(token) : '';
      const removed = await db.delete(sessions).where(and(eq(sessions.userId, user.id), ne(sessions.id, current))).returning({ id: sessions.id });
      return NextResponse.json({ removed: removed.length });
    }
    const removed = await db.delete(sessions).where(and(eq(sessions.userId, user.id), eq(sessions.id, parsed.data.id))).returning({ id: sessions.id });
    if (!removed.length) return notFound('Session not found');
    return NextResponse.json({ removed: 1 });
  } catch (error: unknown) {
    return serverError(error, 'auth/sessions DELETE');
  }
}
