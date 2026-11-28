import { Platform } from 'react-native';
import { API_BASE_URL } from './config';
import type {
  AnalyticsSummary,
  CardDetails,
  Comment,
  EndorsementsResponse,
  Ethics,
  FeedFilters,
  GeocodeResult,
  NotificationsResponse,
  Post,
  PostDetail,
  SessionUser,
  UploadResponse,
  UserProfile,
} from './types';

/**
 * Auth: the API keeps the session in an httpOnly `fmd_session` cookie set by
 * POST /api/auth/login (and /api/verify). React Native's networking layer
 * (NSHTTPCookieStorage on iOS, the OkHttp cookie jar on Android) stores it and
 * sends it back on every request to the same host, so we only need
 * `credentials: 'include'`. Native requests carry no Origin/Sec-Fetch-Site
 * header, which the API's CSRF check (src/lib/csrf.ts) treats as a non-browser
 * client and lets through to normal authentication.
 */

export class ApiError extends Error {
  status: number;
  fields?: Record<string, string>;
  constructor(message: string, status: number, fields?: Record<string, string>) {
    super(message);
    this.status = status;
    this.fields = fields;
  }
}

type Query = Record<string, string | number | boolean | undefined | null>;

function buildUrl(path: string, query?: Query): string {
  const url = `${API_BASE_URL}${path}`;
  if (!query) return url;
  const params = Object.entries(query)
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
    .join('&');
  return params ? `${url}?${params}` : url;
}

async function request<T>(
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
  path: string,
  opts: { query?: Query; body?: unknown; form?: FormData; signal?: AbortSignal } = {}
): Promise<T> {
  const headers: Record<string, string> = { Accept: 'application/json' };
  let body: BodyInit | undefined;
  if (opts.form) {
    body = opts.form as unknown as BodyInit;
  } else if (opts.body !== undefined) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(opts.body);
  }

  let res: Response;
  try {
    res = await fetch(buildUrl(path, opts.query), {
      method,
      headers,
      body,
      credentials: 'include',
      signal: opts.signal,
    });
  } catch (e) {
    if ((e as Error)?.name === 'AbortError') throw e;
    throw new ApiError("Can't reach FixMyDistrict. Check your connection and try again.", 0);
  }

  const text = await res.text();
  let data: unknown = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = null;
    }
  }

  if (!res.ok) {
    const d = (data ?? {}) as { error?: string; fields?: Record<string, string> };
    let message = d.error || `Request failed (${res.status})`;
    if (res.status === 429) message = d.error || 'Too many requests. Please wait a moment and try again.';
    if (d.fields && message === 'Invalid input') {
      const first = Object.values(d.fields)[0];
      if (first) message = first;
    }
    throw new ApiError(message, res.status, d.fields);
  }
  return data as T;
}

export const PAGE_SIZE = 15;

export const api = {
  // --- Posts -------------------------------------------------------------
  feed: (params: FeedFilters & { userId?: string; offset?: number; limit?: number; radiusLat?: number; radiusLng?: number; radiusKm?: number }, signal?: AbortSignal) =>
    request<Post[]>('GET', '/api/reports', {
      query: { limit: PAGE_SIZE, ...params } as Query,
      signal,
    }),
  postsInBox: (box: { west: number; south: number; east: number; north: number }, limit = 100) =>
    request<Post[]>('GET', '/api/reports', { query: { ...box, limit } }),
  post: (id: string) => request<PostDetail>('GET', `/api/reports/${encodeURIComponent(id)}`),
  createPost: (body: Record<string, unknown>) => request<{ id: string }>('POST', '/api/reports', { body }),
  upvote: (id: string, on: boolean) =>
    request<{ upvoted: boolean; upvoteCount: number }>(on ? 'POST' : 'DELETE', `/api/reports/${encodeURIComponent(id)}/upvote`),
  comments: (id: string) => request<Comment[]>('GET', `/api/reports/${encodeURIComponent(id)}/comments`),
  addComment: (id: string, body: string) =>
    request<Comment>('POST', `/api/reports/${encodeURIComponent(id)}/comments`, { body: { body } }),
  endorsements: (id: string) =>
    request<EndorsementsResponse>('GET', `/api/reports/${encodeURIComponent(id)}/endorsements`),
  flag: (id: string, reason: string) =>
    request<{ success: boolean }>('POST', `/api/reports/${encodeURIComponent(id)}/flag`, { body: { reason, targetType: 'report' } }),

  // --- Media & places ------------------------------------------------------
  /** Short-lived token proving a photo is taken with the app's own camera (see the server's media-integrity/capture). */
  captureToken: () => request<{ token: string }>('POST', '/api/capture-token'),
  upload: async (file: { uri: string; name: string; mimeType: string }, captureToken?: string | null) => {
    const form = new FormData();
    if (captureToken) form.append('captureToken', captureToken);
    if (Platform.OS === 'web') {
      const blob = await (await fetch(file.uri)).blob();
      form.append('file', blob, file.name);
    } else {
      // React Native's FormData accepts { uri, name, type } for file parts.
      form.append('file', { uri: file.uri, name: file.name, type: file.mimeType } as unknown as Blob);
    }
    return request<UploadResponse>('POST', '/api/upload', { form });
  },
  reverseGeocode: (lat: number, lng: number) => request<GeocodeResult>('GET', '/api/geocode', { query: { lat, lng } }),
  geocode: (q: string) => request<GeocodeResult>('GET', '/api/geocode', { query: { q } }),

  // --- Auth ------------------------------------------------------------------
  me: async (): Promise<SessionUser | null> => {
    try {
      const r = await request<{ authenticated: boolean; user?: SessionUser }>('GET', '/api/auth/me');
      return r.authenticated && r.user ? r.user : null;
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) return null;
      throw e;
    }
  },
  login: (email: string, password: string) =>
    request<{ success: true; user: SessionUser }>('POST', '/api/auth/login', { body: { email, password } }),
  signup: (body: { email: string; password: string; displayName: string; acceptEthics: true }) =>
    request<{ success: true; pending: true; message: string }>('POST', '/api/auth/signup', { body }),
  logout: () => request<{ success: true }>('POST', '/api/auth/logout'),
  verify: (body: { email: string; password: string; card: CardDetails }) =>
    request<{ success: true; verified: true; demo: true }>('POST', '/api/verify', { body }),

  // --- People & notifications -----------------------------------------------
  user: (id: string) => request<UserProfile>('GET', `/api/users/${encodeURIComponent(id)}`),
  updateProfile: (id: string, body: { displayName?: string; bio?: string; emailNotifications?: boolean }) =>
    request<unknown>('PATCH', `/api/users/${encodeURIComponent(id)}`, { body }),
  notifications: (before?: string) =>
    request<NotificationsResponse>('GET', '/api/notifications', { query: { limit: 30, before } }),
  unreadCount: () =>
    request<NotificationsResponse>('GET', '/api/notifications', { query: { limit: 1, unread: 'true' } }),
  markAllRead: () => request<{ success: true }>('PATCH', '/api/notifications', { body: { markAllRead: true } }),
  markRead: (ids: string[]) => request<{ success: true }>('PATCH', '/api/notifications', { body: { ids } }),

  // --- Misc ------------------------------------------------------------------
  ethics: () => request<Ethics>('GET', '/api/ethics'),
  analyticsSummary: () => request<{ data: AnalyticsSummary }>('GET', '/api/analytics/summary'),
};
