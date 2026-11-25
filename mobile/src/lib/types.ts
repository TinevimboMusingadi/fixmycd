/** Shapes returned by the FixMyDistrict API (see src/app/api/** in the web app). */

export type ReportStatus =
  | 'submitted'
  | 'in_review'
  | 'accepted'
  | 'resubmit'
  | 'duplicate'
  | 'in_progress'
  | 'resolved'
  | 'not_an_issue';

export type UserRole = 'viewer' | 'submitter' | 'referee' | 'admin' | 'super_admin';

/** A "Post" in the UI; `report` in the API. GET /api/reports */
export interface Post {
  id: string;
  referenceNo: string | null;
  title: string;
  description: string | null;
  latitude: number;
  longitude: number;
  severity: number | null;
  status: ReportStatus | string;
  category: string | null;
  subcategory: string | null;
  postAction?: string | null;
  postType?: string | null;
  parentReportId?: string | null;
  imageUrl: string | null;
  videoUrl: string | null;
  audioUrl: string | null;
  aiSummary: string | null;
  featured: boolean;
  createdAt: string;
  submitterId: string;
  userDisplayName: string | null;
  upvoteCount: number;
  commentCount: number;
  endorsementCount?: number;
  endorsementAverage?: number | null;
  userHasUpvoted: boolean;
}

/** GET /api/reports/[id] */
export interface PostDetail extends Post {
  compassDirection?: number | null;
  reviewNote?: string | null;
}

export interface Comment {
  id: string;
  body: string;
  createdAt: string;
  userId: string;
  userDisplayName: string | null;
}

export interface Endorsement {
  id: string;
  severityLevel: number;
  note: string | null;
  createdAt: string;
  updatedAt: string | null;
  expertName: string | null;
  expertRole: UserRole;
  isMine: boolean;
}

export interface EndorsementsResponse {
  items: Endorsement[];
  count: number;
  averageSeverity: number | null;
  myEndorsement: Endorsement | null;
}

export interface SessionUser {
  id: string;
  email: string;
  displayName: string | null;
  role: UserRole;
  bio?: string | null;
  emailNotifications?: boolean;
}

export interface NotificationItem {
  id: string;
  type: 'upvote' | 'comment' | 'endorsement' | 'status_change' | string;
  read: boolean;
  createdAt: string;
  reportId: string | null;
  metadata: Record<string, unknown> | null;
  actorDisplayName: string | null;
  reportTitle: string | null;
}

export interface NotificationsResponse {
  items: NotificationItem[];
  unreadCount: number;
  nextBefore: string | null;
}

export interface UploadResponse {
  url: string;
  kind: 'image' | 'video' | 'audio';
  contentType: string;
  fallback?: boolean;
}

export interface GeocodeResult {
  addressLine: string;
  city: string;
  stateProvince: string;
  postalCode: string;
  county: string;
  countryCode: string;
  source: string | null;
  lat: number;
  lng: number;
}

export interface Ethics {
  version: number;
  body: string;
  publishedAt: string | null;
}

export interface UserProfile {
  id: string;
  email?: string;
  displayName: string | null;
  bio: string | null;
  role: UserRole;
  createdAt: string;
  reports: { id: string; title: string; status: string; createdAt: string }[];
}

export interface AnalyticsSummary {
  totalReports: number;
  openBacklog: number;
  criticalReports: number;
  uniqueReporters: number;
  acceptanceRate: number;
  resolutionRate: number;
  estimatedCostTotal: number;
  actualCostTotal: number;
  peopleAffectedTotal: number;
  avgAgeDays: number;
  avgTimeToResolutionDays: number | null;
  previousPeriod?: { totalReports: number; openBacklog: number; criticalReports: number };
}

export interface CardDetails {
  number: string;
  expiry: string;
  cvc: string;
  name: string;
}

export interface FeedFilters {
  keyword?: string;
  category?: string;
  status?: ReportStatus;
  severityMin?: number;
}
