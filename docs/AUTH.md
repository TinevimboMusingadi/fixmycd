# Sign-in setup (Clerk: Google, LinkedIn, Facebook)

Social sign-in is off until these are set. Everything else (email + password, the $1 check, admin
approval) works without them.

## 1. Create the Clerk application

1. Sign in at dashboard.clerk.com and create an application (e.g. "FixMyDistrict").
2. **User & authentication → Social connections**: enable **Google**, **LinkedIn (OIDC)** and **Facebook**.
   Development instances can use Clerk's shared credentials. For production, create your own OAuth apps
   (Google Cloud Console, LinkedIn Developers, Meta for Developers) and paste their client id/secret in Clerk,
   using the redirect URI Clerk shows for each.
3. **Email**: require a verified email (on by default). **Phone**: enable phone numbers with **SMS
   verification** (used for the "Confirm your phone" step). Optional: turn on multi-factor (TOTP).
4. **Attack protection**: keep bot protection on for sign-up.
5. **Paths/allowed origins**: add `https://fixmycd.vercel.app` (and any custom domain).
6. **Native apps** (for the phone app): allow the redirect `fixmydistrict://sso-callback`.

## 2. Keys

| Where | Name | Value |
| --- | --- | --- |
| Vercel (all environments) | `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | `pk_live_…` / `pk_test_…` (public) |
| Vercel | `CLERK_SECRET_KEY` | `sk_live_…` (secret — never in the app or the repo) |
| Vercel (optional) | `CLERK_WEBHOOK_SECRET` | `whsec_…` from step 3 |
| Vercel (optional) | `CLERK_AUTHORIZED_PARTIES` | extra origins, comma separated (the base URL and Vercel URLs are added automatically) |
| Phone app build | `EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY` | same publishable key |

Redeploy after setting them (the publishable key is read at build time).

## 3. Webhook (recommended)

Clerk dashboard → Webhooks → add endpoint `https://fixmycd.vercel.app/api/webhooks/clerk` with events
`user.deleted` and `user.updated`. Copy the signing secret into `CLERK_WEBHOOK_SECRET`. Deleting a person in
Clerk then disables their FixMyDistrict account and signs them out everywhere.

## How it fits together

```
Login page ─ "Continue with Google/LinkedIn/Facebook" ─▶ /auth/continue (Clerk widget)
   ─▶ /auth/complete ─ POST /api/auth/clerk {Clerk token}
        new person   → Code of Ethics → SMS phone check → pending ($1 check or admin)
        approved     → FixMyDistrict session (cookie on web, bearer token in the app); Clerk is signed out
```

Our server stays the authority: roles, approval, revocation and every API check use our own sessions.

## Other production settings from the security pass

- `PAYMENTS_DEMO=1` — keep the demo $1 checkout (off in production otherwise).
- `BLOB_PUBLIC_HOST` — optional; the Blob store host is otherwise derived from `BLOB_READ_WRITE_TOKEN`.
- `TRUST_PROXY=1` — only if self-hosting behind a proxy that sets `X-Forwarded-For` (not needed on Vercel).
- `CAPTURE_TOKEN_SECRET` — optional; signs in-app camera tokens (falls back to `UNSUBSCRIBE_SECRET`).
- `GEMINI_API_KEY` — optional AI-media deep check (`docs/MEDIA_INTEGRITY.md`).
