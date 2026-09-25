import { db } from '../db';
import { reports, users, upvotes, comments } from '../db/schema';
import { eq, desc, and, sql, ilike, or, gte, lte } from 'drizzle-orm';

export interface ReportQueryParams {
  category?: string;
  status?: string;
  severity?: string;
  severityMin?: string;
  severityMax?: string;
  keyword?: string;
  featured?: string;
  limit?: string;
  offset?: string;
  userId?: string;
  startDate?: string;
  endDate?: string;
  // Geo filters
  west?: string;
  south?: string;
  east?: string;
  north?: string;
  radiusLat?: string;
  radiusLng?: string;
  radiusKm?: string;
}

export async function fetchReportsWithCounts(
  sessionUserId: string | null,
  params: ReportQueryParams = {}
) {
  const limit = Math.min(parseInt(params.limit || '50', 10), 100);
  const offset = parseInt(params.offset || '0', 10);

  const conditions = [eq(reports.isHidden, false)];

  // Existing filters
  if (params.category) conditions.push(eq(reports.category, params.category));
  if (params.status) conditions.push(eq(reports.status, params.status));
  if (params.severity) conditions.push(eq(reports.severity, parseInt(params.severity, 10)));
  if (params.featured === 'true') conditions.push(eq(reports.featured, true));
  if (params.userId) conditions.push(eq(reports.submitterId, params.userId));

  if (params.keyword) {
    const pattern = `%${params.keyword}%`;
    conditions.push(or(ilike(reports.title, pattern), ilike(reports.description, pattern))!);
  }

  // NEW: Severity range
  if (params.severityMin) {
    conditions.push(gte(reports.severity, parseInt(params.severityMin, 10)));
  }
  if (params.severityMax) {
    conditions.push(lte(reports.severity, parseInt(params.severityMax, 10)));
  }

  // NEW: Date range
  if (params.startDate) {
    conditions.push(sql`${reports.createdAt} >= ${params.startDate}::timestamp`);
  }
  if (params.endDate) {
    conditions.push(sql`${reports.createdAt} <= ${params.endDate}::timestamp`);
  }

  // NEW: Bounding box (west/south/east/north)
  if (params.west && params.east) {
    conditions.push(gte(reports.longitude, parseFloat(params.west)));
    conditions.push(lte(reports.longitude, parseFloat(params.east)));
  }
  if (params.south && params.north) {
    conditions.push(gte(reports.latitude, parseFloat(params.south)));
    conditions.push(lte(reports.latitude, parseFloat(params.north)));
  }

  // NEW: Radius (haversine approximation in SQL)
  if (params.radiusLat && params.radiusLng && params.radiusKm) {
    const lat = parseFloat(params.radiusLat);
    const lng = parseFloat(params.radiusLng);
    const km = parseFloat(params.radiusKm);

    // Approximate degree deltas
    const latDelta = km / 111.32;
    const lngDelta = km / (111.32 * Math.cos((lat * Math.PI) / 180));

    conditions.push(gte(reports.latitude, lat - latDelta));
    conditions.push(lte(reports.latitude, lat + latDelta));
    conditions.push(gte(reports.longitude, lng - lngDelta));
    conditions.push(lte(reports.longitude, lng + lngDelta));
  }

  const whereClause = conditions.length === 1 ? conditions[0] : and(...conditions);

  const rows = await db
    .select({
      id: reports.id,
      referenceNo: reports.referenceNo,
      title: reports.title,
      description: reports.description,
      latitude: reports.latitude,
      longitude: reports.longitude,
      severity: reports.severity,
      status: reports.status,
      category: reports.category,
      subcategory: reports.subcategory,
      postAction: reports.postAction,
      postType: reports.postType,
      parentReportId: reports.parentReportId,
      imageUrl: reports.imageUrl,
      videoUrl: reports.videoUrl,
      audioUrl: reports.audioUrl,
      aiSummary: reports.aiSummary,
      featured: reports.featured,
      createdAt: reports.createdAt,
      submitterId: reports.submitterId,
      userDisplayName: users.displayName,
      userEmail: users.email,
      upvoteCount: sql<number>`cast(count(distinct ${upvotes.id}) as int)`,
      commentCount: sql<number>`cast(count(distinct ${comments.id}) as int)`,
    })
    .from(reports)
    .leftJoin(users, eq(reports.submitterId, users.id))
    .leftJoin(upvotes, eq(upvotes.reportId, reports.id))
    .leftJoin(comments, and(eq(comments.reportId, reports.id), eq(comments.isHidden, false)))
    .where(whereClause)
    .groupBy(reports.id, users.displayName, users.email)
    .orderBy(desc(reports.createdAt))
    .limit(limit)
    .offset(offset);

  let userUpvotes = new Set<string>();
  if (sessionUserId && rows.length > 0) {
    const upvoteRows = await db
      .select({ reportId: upvotes.reportId })
      .from(upvotes)
      .where(eq(upvotes.userId, sessionUserId));
    userUpvotes = new Set(upvoteRows.map((r) => r.reportId));
  }

  return rows.map((row) => ({
    ...row,
    userEmail: null as string | null,
    createdAt: row.createdAt.toISOString(),
    userHasUpvoted: userUpvotes.has(row.id),
  }));
}

export async function fetchTrendingReports(limit = 5) {
  const sevenDaysAgoISO = new Date(Date.now() - 7 * 86400000).toISOString();

  const rows = await db
    .select({
      id: reports.id,
      title: reports.title,
      category: reports.category,
      upvoteCount: sql<number>`cast(count(distinct ${upvotes.id}) as int)`,
      commentCount: sql<number>`cast(count(distinct ${comments.id}) as int)`,
    })
    .from(reports)
    .leftJoin(upvotes, eq(upvotes.reportId, reports.id))
    .leftJoin(comments, and(eq(comments.reportId, reports.id), eq(comments.isHidden, false)))
    .where(and(eq(reports.isHidden, false), sql`${reports.createdAt} >= ${sevenDaysAgoISO}::timestamp`))
    .groupBy(reports.id)
    .orderBy(desc(sql`count(distinct ${upvotes.id}) + count(distinct ${comments.id})`))
    .limit(limit);

  return rows;
}