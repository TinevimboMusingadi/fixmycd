import { NextResponse } from 'next/server';
import { and, desc, eq, inArray, isNotNull, isNull } from 'drizzle-orm';
import { db } from '@/db';
import { mediaChecks, reports, users } from '@/db/schema';
import { isAuthError, requireModerator } from '@/lib/auth';
import { serverError } from '@/lib/http';
import type { StoredEvidence } from '@/lib/media-integrity';

/** Posts whose photo/video looks AI-generated and hasn't been reviewed yet (moderators). */
export async function GET() {
  try {
    const mod = await requireModerator();
    if (isAuthError(mod)) return mod;

    const rows = await db
      .select({
        id: mediaChecks.id,
        reportId: mediaChecks.reportId,
        mediaKind: mediaChecks.mediaKind,
        verdict: mediaChecks.verdict,
        score: mediaChecks.score,
        detectors: mediaChecks.detectors,
        signalsJson: mediaChecks.signalsJson,
        checkedAt: mediaChecks.checkedAt,
        title: reports.title,
        referenceNo: reports.referenceNo,
        imageUrl: reports.imageUrl,
        videoUrl: reports.videoUrl,
        isHidden: reports.isHidden,
        submitterId: reports.submitterId,
        submitterName: users.displayName,
        strikes: users.aiMediaStrikes,
      })
      .from(mediaChecks)
      .innerJoin(reports, eq(mediaChecks.reportId, reports.id))
      .innerJoin(users, eq(reports.submitterId, users.id))
      .where(and(isNotNull(mediaChecks.reportId), isNull(mediaChecks.reviewedAt), inArray(mediaChecks.verdict, ['ai_confirmed', 'suspected_ai'])))
      .orderBy(desc(mediaChecks.checkedAt))
      .limit(50);

    return NextResponse.json(
      rows.map(({ signalsJson, checkedAt, ...r }) => {
        const evidence = JSON.parse(signalsJson) as StoredEvidence;
        return {
          ...r,
          checkedAt: checkedAt.toISOString(),
          signals: evidence.signals.map((s) => ({ id: s.id, weight: s.weight, reason: s.reason, conclusive: !!s.conclusive })),
          contentCredentials: evidence.facts.c2pa?.present ? { validation: evidence.facts.c2pa.validation, generator: evidence.facts.c2pa.generator } : null,
          capturedInApp: !!evidence.facts.capturedInApp,
        };
      })
    );
  } catch (error: unknown) {
    return serverError(error, 'review/media GET');
  }
}
