import { NextResponse } from 'next/server';
import { db } from '@/db';
import { endorsements, users, reports } from '@/db/schema';
import { eq, desc, and } from 'drizzle-orm';
import { isAuthError, requireExpert } from '@/lib/auth';
import crypto from 'crypto';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const rows = await db
      .select({
        id: endorsements.id,
        reportId: endorsements.reportId,
        expertUserId: endorsements.expertUserId,
        severityLevel: endorsements.severityLevel,
        note: endorsements.note,
        createdAt: endorsements.createdAt,
        expertName: users.displayName,
      })
      .from(endorsements)
      .leftJoin(users, eq(endorsements.expertUserId, users.id))
      .where(eq(endorsements.reportId, id))
      .orderBy(desc(endorsements.createdAt));

    return NextResponse.json(
      rows.map((r) => ({
        ...r,
        createdAt: r.createdAt.toISOString(),
      }))
    );
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to fetch endorsements';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userCheck = await requireExpert();
    if (isAuthError(userCheck)) return userCheck;
    const user = userCheck;

    const { id } = await params;
    const body = await request.json();
    const { severityLevel, note } = body;

    if (!severityLevel || severityLevel < 1 || severityLevel > 5) {
      return NextResponse.json(
        { error: 'severityLevel must be between 1 and 5' },
        { status: 400 }
      );
    }

    const report = await db.select().from(reports).where(eq(reports.id, id)).limit(1);
    if (report.length === 0) {
      return NextResponse.json({ error: 'Report not found' }, { status: 404 });
    }

    const existingRows = await db
      .select()
      .from(endorsements)
      .where(and(eq(endorsements.reportId, id), eq(endorsements.expertUserId, user.id)));

    if (existingRows.length > 0) {
      await db
        .update(endorsements)
        .set({ severityLevel, note: note || null, createdAt: new Date() })
        .where(eq(endorsements.id, existingRows[0].id));
      return NextResponse.json({ success: true, updated: true });
    }

    const endorsementId = crypto.randomUUID();
    await db.insert(endorsements).values({
      id: endorsementId,
      reportId: id,
      expertUserId: user.id,
      severityLevel,
      note: note || null,
      createdAt: new Date(),
    });

    return NextResponse.json({ success: true, id: endorsementId }, { status: 201 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to create endorsement';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userCheck = await requireExpert();
    if (isAuthError(userCheck)) return userCheck;
    const user = userCheck;

    const { id } = await params;

    await db
      .delete(endorsements)
      .where(
        and(
          eq(endorsements.reportId, id),
          eq(endorsements.expertUserId, user.id)
        )
      );

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to delete endorsement';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}