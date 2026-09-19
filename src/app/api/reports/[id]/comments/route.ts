import { NextResponse } from 'next/server';
import { db } from '@/db';
import { comments, reports, users, notifications } from '@/db/schema';
import { eq, desc } from 'drizzle-orm';
import crypto from 'crypto';
import { getSessionUser } from '@/lib/auth';
import { containsBlockedContent } from '@/lib/content-filter';
import { sendCommentNotification } from '@/lib/email';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const rows = await db
      .select({
        id: comments.id,
        body: comments.body,
        createdAt: comments.createdAt,
        userDisplayName: users.displayName,
        userEmail: users.email,
      })
      .from(comments)
      .leftJoin(users, eq(comments.userId, users.id))
      .where(eq(comments.reportId, id))
      .orderBy(desc(comments.createdAt));

    return NextResponse.json(
      rows.map((r) => ({
        ...r,
        userEmail: null,
        createdAt: r.createdAt.toISOString(),
      }))
    );
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to fetch comments';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

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
    const body = await request.json();
    const { body: commentBody } = body;

    if (!commentBody || !commentBody.trim()) {
      return NextResponse.json({ error: 'Comment cannot be empty' }, { status: 400 });
    }

    const blocked = containsBlockedContent(commentBody);
    if (blocked) {
      return NextResponse.json({ error: blocked }, { status: 400 });
    }

    const reportRows = await db.select().from(reports).where(eq(reports.id, id)).limit(1);
    const report = reportRows[0];
    if (!report || report.isHidden) {
      return NextResponse.json({ error: 'Report not found' }, { status: 404 });
    }

    const commentId = crypto.randomUUID();
    const [newComment] = await db
      .insert(comments)
      .values({
        id: commentId,
        reportId: id,
        userId: user.id,
        body: commentBody.trim(),
        createdAt: new Date(),
      })
      .returning();

    // ✅ NEW: In-app notification (non-blocking)
    if (report.submitterId !== user.id) {
      try {
        await db.insert(notifications).values({
          id: crypto.randomUUID(),
          userId: report.submitterId,
          type: 'comment',
          actorId: user.id,
          reportId: id,
          read: false,
          createdAt: new Date(),
        });
      } catch (notifError) {
        console.error('Failed to create notification:', notifError);
      }

      // Email notification (W2-5)
      try {
        const submitter = await db
          .select()
          .from(users)
          .where(eq(users.id, report.submitterId))
          .limit(1);

        if (submitter[0]?.email && submitter[0]?.emailNotifications !== false) {
          await sendCommentNotification({
            to: submitter[0].email,
            reportTitle: report.title,
            reportId: id,
            commenterName: user.displayName || 'Someone',
            commentBody: commentBody.slice(0, 200),
          });
        }
      } catch (emailError) {
        console.error('Failed to send comment email:', emailError);
      }
    }

    return NextResponse.json(
      {
        ...newComment,
        userDisplayName: user.displayName,
        userEmail: null,
        createdAt: newComment.createdAt.toISOString(),
      },
      { status: 201 }
    );
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to post comment';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}