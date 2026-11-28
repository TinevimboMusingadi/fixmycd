# Security model

How FixMyDistrict authenticates people, decides what they may do, and
handles untrusted input. Keep this up to date when changing any of it.

## Accounts and sessions

- **Passwords** are hashed with bcrypt (cost 12 for new hashes; older
  hashes keep working). New passwords must be 8–72 bytes (bcrypt ignores
  anything past 72 bytes). Emails are stored trimmed and lowercased and
  matched case-insensitively.
- **Sessions** live in the `sessions` table. Login creates a random
  256-bit token, sends it in the `fmd_session` cookie (`HttpOnly`,
  `SameSite=Lax`, `Secure` in production, 7 days) and stores only its
  SHA-256 hash. `getSessionUser()` (`src/lib/auth.ts`) accepts a token only
  if the session is unexpired and the account is `approved` and not
  disabled. Logout deletes the session server-side.
- The pre-October `session_user_id` cookie held the raw user id and was
  forgeable; it is ignored and cleared.
- **Disabling, rejecting or changing the role of an account** deletes all
  its sessions immediately.
- **Signup** creates a `pending` account that cannot log in until an admin
  approves it. The response is the same whether or not the email is
  already registered.
- **Login** returns the same error for unknown emails and wrong passwords,
  and only reveals "disabled"/"pending" after a correct password.
- **Session lifetimes**: web sessions last at most 7 days and end after 3 days
  without use; the phone app's last 30 days and end after 14 idle days. Each
  session records how it was created (password, $1 check, Google/LinkedIn/
  Facebook) and a short device label. People can see their **Signed-in
  devices** (Account › Profile) and sign out one or all others
  (`/api/auth/sessions`).
- **Phone app**: login endpoints called with `X-Client: mobile-app` return the
  token instead of setting a cookie. The app keeps it in the iOS Keychain /
  Android Keystore-backed storage (`WHEN_UNLOCKED_THIS_DEVICE_ONLY`, never in
  backups: `allowBackup=false`) and sends `Authorization: Bearer`. Any 401
  wipes it. Nothing secret ships in the app (a unit test scans `mobile/` for
  keys and server-only settings).
- **Social sign-in (Clerk)**: Clerk proves identity (Google, LinkedIn,
  Facebook, email code, SMS); `/api/auth/clerk` verifies the Clerk token
  server-side, requires a verified email, links or creates the account and
  issues *our* session — Clerk never authorizes API calls. New social accounts
  agree to the Code of Ethics, verify a phone number, and stay `pending` until
  the $1 check or an admin approves them. A signed Clerk webhook disables the
  account when the Clerk user is deleted. Setup: `docs/AUTH.md`.
- **Timing**: unknown emails are checked against a dummy hash of the same cost,
  and signup always hashes, so response times don't reveal which emails exist.
- **Rate limits** key on the client IP only where a trusted proxy sets it
  (Vercel, or `TRUST_PROXY=1`); failed logins are limited per account+IP (10 /
  15 min) with a higher per-account ceiling (50 / hour) so a stranger can't
  lock the owner out.
- **Content-Security-Policy** is enforced with a per-request nonce and
  `strict-dynamic` (`src/proxy.ts`, `src/lib/csp.ts`); Clerk's hosts are only
  allowed on the sign-in pages.
- **Media**: uploads are checked for AI generation and stripped of EXIF/GPS
  before storage — see `docs/MEDIA_INTEGRITY.md`.

## Roles

| Role | Can |
| --- | --- |
| viewer / submitter | post, comment, upvote, flag, follow; analytics without reporter data; create and revoke their own share links |
| referee | + review queue, change post status, endorse |
| admin | + manage non-admin users, full analytics (reporters, data quality, saved views), all share links, CSV import, beta launch email, publish the Code of Ethics |
| super_admin | + manage admins and grant super_admin |

### Analytics for members

`/api/analytics/*` serves every signed-in user; `/api/admin/analytics/*`
keeps the admin-only paths. Both run `src/lib/analytics-endpoint.ts`. For
non-admins, post rows and CSV exports drop reporter ids, emails, roles and
account flags (`toPublicReportRows`, as public share links do), reporter
filters and per-person grouping are ignored, and the `users` / `quality`
endpoints return 403. Share links created by members never store reporter
filters. `tests/integration/member-analytics.test.ts` checks all of this.

### $1 identity check and Code of Ethics

New accounts start `pending`. Paying the $1 check (`/api/verify`) activates
the account without an admin; it requires the account's email **and
password**, so it reveals nothing about which emails are registered. The
checkout is a demo: only the test card is accepted and only the last 4
digits are stored (see `docs/PAYMENTS.md`). Signup requires agreeing to the
current Code of Ethics; the version is stored on the user. Publishing a new
version is admin-only and audited (`ethics.publish`).

Nobody can change their own role, status or disabled flag through the
admin API. Every admin change is written to `admin_audit_log`.
`tests/integration/authorization-matrix.test.ts` checks every protected
route against every role.

## Rate limits

Postgres-backed fixed windows (`src/lib/rate-limit.ts`, table
`rate_limits`); exceeding one returns `429` with `Retry-After`.

| Action | Limit |
| --- | --- |
| login | 30 / 15 min per IP, 10 / 15 min per account |
| signup, beta subscribe | 5 / hour per IP |
| create report | 20 / hour per user |
| comment | 20 / 10 min per user+IP |
| flag | 20 / hour per user |
| upload | 30 / 10 min per user+IP |
| geocode | 60 / min per IP |
| PDF export | 20 / min per IP |
| $1 check, donation | 10 / hour per IP (+ the per-account login limit for the $1 check) |

## Input and output

- Every request body and query string is validated with zod
  (`src/lib/validation.ts`); invalid input gets `400` with per-field
  messages. User text has control characters (incl. NUL) stripped.
- Unexpected errors are logged with their cause and answered with a
  generic `500` (`serverError()` in `src/lib/http.ts`). Never return
  `error.message` to clients: Drizzle errors contain SQL and parameters.
- Public responses never include emails, password hashes or reporter ids
  for share links (`tests/integration/privacy-moderation.test.ts` scans
  them). Hidden reports/comments and content from disabled accounts are
  not served.
- User text is rendered by React (escaped). The explore map builds popups
  with `textContent`. Emails HTML-escape every value and strip line breaks
  from subjects. CSV exports prefix formula-like cells with `'`.

## Media and uploads

- `/api/upload` identifies files by their first bytes (JPEG, PNG, WebP,
  GIF, HEIC, MP4/MOV, WebM, MP3/M4A/OGG/WAV); SVG and HTML are refused.
  Files are stored under server-generated names with an explicit
  content type. Max 10 MB.
- Report media URLs must be on the allowlist in `src/lib/media-url.ts`
  (Vercel Blob, `images.unsplash.com`, Google Street View stills, small
  base64 `data:` URLs from the local upload fallback).
- The PDF export fetches images only from that allowlist, without
  following redirects, with a 5 MB cap and timeout (prevents server-side
  request forgery).

## Browser protections

- Headers (`next.config.ts`): HSTS, `X-Content-Type-Options: nosniff`,
  `X-Frame-Options: DENY`, `Referrer-Policy`, `Permissions-Policy`
  (camera/microphone/geolocation for this site only).
- Content-Security-Policy is sent as **Report-Only**. Once no unexpected
  violations show up, rename the header to `Content-Security-Policy`.
- The proxy (`src/proxy.ts`) rejects state-changing `/api` requests whose
  `Origin`/`Sec-Fetch-Site` says they come from another site.
- The service worker never caches `/dashboard`, `/api` or RSC responses,
  and logout clears all caches.

## Secrets and environment

| Variable | Needed for |
| --- | --- |
| `DATABASE_URL` | everything (migrations run on each Vercel build) |
| `UNSUBSCRIBE_SECRET` | one-click unsubscribe links in emails |
| `HASH_SALT` | stable visitor de-duplication for share-link views |
| `RESEND_API_KEY`, `EMAIL_FROM`, `NEXT_PUBLIC_BASE_URL` | emails |

The demo seed accounts (`seed.ts`) use the documented demo password; never
run the seed scripts against a database with real users unless that is
intended, because they reset the demo accounts' passwords.

## Reporting a vulnerability

Please email the maintainers instead of opening a public issue.
