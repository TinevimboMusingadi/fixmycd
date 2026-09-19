import { NextResponse } from 'next/server';
import { db } from '@/db';
import { reports, users, reportStatusHistory, notifications } from '@/db/schema';
import { eq } from 'drizzle-orm';
import crypto from 'crypto';
import { isAuthError, requireModerator } from '@/lib/auth';
import { sendStatusChangeNotification } from '@/lib/email';

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userCheck = await requireModerator();
    if (isAuthError(userCheck)) return userCheck;
    const user = userCheck;

    const { id } = await params;
    const body = await request.json();
    const { status, reviewNote, isHidden, featured } = body;

    const reportRows = await db.select().from(reports).where(eq(reports.id, id)).limit(1);
    const report = reportRows[0];
    if (!report) {
      return NextResponse.json({ error: 'Report not found' }, { status: 404 });
    }

    const patch: Record<string, unknown> = {};
    if (status) patch.status = status;
    if (reviewNote !== undefined) patch.reviewNote = reviewNote;
    if (isHidden !== undefined) patch.isHidden = isHidden;
    if (featured !== undefined) patch.featured = featured;
    patch.updatedAt = new Date();

    await db.update(reports).set(patch).where(eq(reports.id, id));

    if (status && status !== report.status) {
      // Log status change
      await db.insert(reportStatusHistory).values({
        id: crypto.randomUUID(),
        reportId: id,
        fromStatus: report.status,
        toStatus: status,
        changedBy: user.id,
        note: reviewNote || null,
        createdAt: new Date(),
      });

      // ✅ NEW: In-app notification
      try {
        await db.insert(notifications).values({
          id: crypto.randomUUID(),
          userId: report.submitterId,
          type: 'status_change',
          actorId: user.id,
          reportId: id,
          read: false,
          createdAt: new Date(),
        });
      } catch (notifError) {
        console.error('Failed to create notification:', notifError);
      }

      // Email notification
      try {
        const submitter = await db
          .select()
          .from(users)
          .where(eq(users.id, report.submitterId))
          .limit(1);

        if (submitter[0]?.email && submitter[0]?.emailNotifications !== false) {
          await sendStatusChangeNotification({
            to: submitter[0].email,
            reportTitle: report.title,
            reportId: id,
            newStatus: status,
          });
        }
      } catch (emailError) {
        console.error('Failed to send status email:', emailError);
      }
    }

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to update report';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}