import { NextResponse } from 'next/server';
import { z } from 'zod';

/**
 * Log an unexpected error with its cause (Drizzle wraps the real Postgres
 * error there) and return a generic 500. Never send error.message to clients:
 * it can contain SQL, parameters and user data.
 */
export function serverError(error: unknown, context: string): NextResponse {
  const cause = error instanceof Error && error.cause instanceof Error ? error.cause.message : undefined;
  console.error(`[${context}]`, error, cause ? `\nCause: ${cause}` : '');
  return NextResponse.json({ error: 'Something went wrong. Please try again later.' }, { status: 500 });
}

export function badRequest(message: string, fields?: Record<string, string>): NextResponse {
  return NextResponse.json({ error: message, ...(fields ? { fields } : {}) }, { status: 400 });
}

export function notFound(message = 'Not found'): NextResponse {
  return NextResponse.json({ error: message }, { status: 404 });
}

/** Flatten zod issues into { "path.to.field": "message" }. */
export function fieldErrors(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join('.') || '_';
    if (!out[key]) out[key] = issue.message;
  }
  return out;
}

export function validationError(error: z.ZodError): NextResponse {
  return badRequest('Invalid input', fieldErrors(error));
}

type Parsed<T> = { ok: true; data: T } | { ok: false; response: NextResponse };

/** Parse and validate a JSON request body. */
export async function parseJsonBody<S extends z.ZodType>(
  request: Request,
  schema: S
): Promise<Parsed<z.output<S>>> {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return { ok: false, response: badRequest('Request body must be valid JSON') };
  }
  const result = schema.safeParse(raw);
  if (!result.success) return { ok: false, response: validationError(result.error) };
  return { ok: true, data: result.data };
}

/** Validate URL query parameters (first value of each key). */
export function parseQuery<S extends z.ZodType>(
  searchParams: URLSearchParams,
  schema: S
): Parsed<z.output<S>> {
  const raw: Record<string, string> = {};
  for (const [k, v] of searchParams) {
    if (!(k in raw)) raw[k] = v;
  }
  const result = schema.safeParse(raw);
  if (!result.success) return { ok: false, response: validationError(result.error) };
  return { ok: true, data: result.data };
}

/**
 * Client IP for rate limiting. Forwarding headers are only believed when a trusted proxy
 * sets them: on Vercel (which overwrites them), or when TRUST_PROXY=1 says the app sits
 * behind a proxy that does. Otherwise a client could send a fresh fake IP with every
 * request and dodge every per-IP limit, so all untrusted traffic shares one bucket.
 */
export function clientIp(request: Request): string {
  const h = request.headers;
  const first = (v: string | null) => v?.split(',')[0].trim() || '';
  if (process.env.VERCEL) {
    return first(h.get('x-vercel-forwarded-for')) || first(h.get('x-forwarded-for')) || 'unknown';
  }
  if (process.env.TRUST_PROXY === '1' || process.env.NODE_ENV === 'test') {
    return first(h.get('x-forwarded-for')) || h.get('x-real-ip')?.trim() || 'unknown';
  }
  return 'direct';
}

/** Postgres unique_violation (23505), whether thrown directly or wrapped by Drizzle. */
export function isUniqueViolation(error: unknown): boolean {
  const code = (e: unknown) => (e && typeof e === 'object' && 'code' in e ? (e as { code?: unknown }).code : undefined);
  return code(error) === '23505' || (error instanceof Error && code(error.cause) === '23505');
}

/** Read a JSON object body without schema validation (400 when it is not an object). */
export async function readJsonObject(
  request: Request
): Promise<{ ok: true; data: Record<string, unknown> } | { ok: false; response: NextResponse }> {
  try {
    const data: unknown = await request.json();
    if (data && typeof data === 'object' && !Array.isArray(data)) {
      return { ok: true, data: data as Record<string, unknown> };
    }
  } catch {
    // fall through
  }
  return { ok: false, response: badRequest('Request body must be a JSON object') };
}
