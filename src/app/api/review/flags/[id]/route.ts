import crypto from 'crypto';
import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/db';
import { adminAuditLog, flags } from '@/db/schema';
import { isAuthError, requireModerator } from '@/lib/auth';
import { notFound, parseJsonBody, serverError } from '@/lib/http';

const schema = z.object({ status: z.enum(['accepted', 'dismissed']) }).strict();

/** Resolve a user's flag: accepted (acted on) or dismissed. Audited. */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const mod = await requireModerator();
    if (isAuthError(mod)) return mod;
    const parsed = await parseJsonBody(request, schema);
    if (!parsed.ok) return parsed.response;
    const { id } = await params;
    const [flag] = await db.select().from(flags).where(eq(flags.id, id)).limit(1);
    if (!flag) return notFound('Flag not found');
    await db.update(flags).set({ status: parsed.data.status }).where(eq(flags.id, id));
    await db.insert(adminAuditLog).values({
      id: crypto.randomUUID(),
      actorId: mod.id,
      action: `flag.${parsed.data.status}`,
      targetType: flag.targetType,
      targetId: flag.targetId,
      detailsJson: JSON.stringify({ flagId: id, reason: flag.reason, before: flag.status }),
      createdAt: new Date(),
    });
    return NextResponse.json({ id, status: parsed.data.status });
  } catch (error: unknown) {
    return serverError(error, 'review/flags/[id] PATCH');
  }
}
