import { NextResponse } from 'next/server';
import { db } from '@/db';
import { upvotes, reports, users, notifications } from '@/db/schema';
import { eq, and, sql } from 'drizzle-orm';
import crypto from 'crypto';
import { getSessionUser } from '@/lib/auth';
import { sendUpvoteNotification } from '@/lib/email';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getSessionUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;

    const existing = await db
      .select()
      .from(upvotes)
      .where(and(eq(upvotes.userId, user.id), eq(upvotes.reportId, id)))
      .limit(1);

    if (existing.length > 0) {
      return NextResponse.json({ error: 'Already upvoted' }, { status: 400 });
    }

    await db.insert(upvotes).values({
      id: crypto.randomUUID(),
      userId: user.id,
      reportId: id,
      createdAt: new Date(),
    });

    // ✅ NEW: In-app + email notification
    try {
      const reportRows = await db.select().from(reports).where(eq(reports.id, id)).limit(1);
      const report = reportRows[0];

      if (report && report.submitterId !== user.id) {
        // In-app notification
        try {
          await db.insert(notifications).values({
            id: crypto.randomUUID(),
            userId: report.submitterId,
            type: 'upvote',
            actorId: user.id,
            reportId: id,
            read: false,
            createdAt: new Date(),
          });
        } catch (notifError) {
          console.error('Failed to create notification:', notifError);
        }

        // Email notification
        const submitter = await db
          .select()
          .from(users)
          .where(eq(users.id, report.submitterId))
          .limit(1);

        if (submitter[0]?.email && submitter[0]?.emailNotifications !== false) {
          const countResult = await db
            .select({ count: sql<number>`count(*)` })
            .from(upvotes)
            .where(eq(upvotes.reportId, id));

          await sendUpvoteNotification({
            to: submitter[0].email,
            reportTitle: report.title,
            reportId: id,
            upvoteCount: Number(countResult[0]?.count || 0),
          });
        }
      }
    } catch (emailError) {
      console.error('Failed to send upvote notification:', emailError);
    }

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to upvote';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getSessionUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;

    await db
      .delete(upvotes)
      .where(and(eq(upvotes.userId, user.id), eq(upvotes.reportId, id)));

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to remove upvote';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}