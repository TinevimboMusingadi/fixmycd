import Link from 'next/link';
import React from 'react';

/**
 * "Continue with Google / LinkedIn / Facebook". All three open Clerk's sign-in (which also offers
 * email codes); only shown when Clerk is set up for this deployment.
 */
export function SocialSignIn({ mode }: { mode: 'login' | 'signup' }) {
  if (!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY) return null;
  const providers = [
    { name: 'Google', icon: <GoogleIcon /> },
    { name: 'LinkedIn', icon: <LinkedInIcon /> },
    { name: 'Facebook', icon: <FacebookIcon /> },
  ];
  return (
    <div className="social-signin">
      {providers.map((p) => (
        <Link key={p.name} href="/auth/continue" className="btn-secondary social-btn" prefetch={false}>
          {p.icon}
          <span>Continue with {p.name}</span>
        </Link>
      ))}
      <p className="social-note">
        {mode === 'signup'
          ? 'New accounts confirm a phone number and are verified before they can post.'
          : 'Or use your email and password below.'}
      </p>
      <div className="auth-divider"><span>or</span></div>
    </div>
  );
}

const GoogleIcon = () => (
  <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
    <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
    <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
    <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
    <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C36.9 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
  </svg>
);
const LinkedInIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
    <rect width="24" height="24" rx="4" fill="#0A66C2" />
    <path fill="#fff" d="M7.1 9.5h-2.4v8.2h2.4V9.5zM5.9 5.6a1.4 1.4 0 1 0 0 2.8 1.4 1.4 0 0 0 0-2.8zM19.3 12.9c0-2.4-1.3-3.6-3.1-3.6-1.4 0-2.1.8-2.4 1.3V9.5h-2.4v8.2h2.4v-4.4c0-1.1.4-1.9 1.4-1.9s1.6.8 1.6 1.9v4.4h2.5v-4.8z" />
  </svg>
);
const FacebookIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
    <circle cx="12" cy="12" r="12" fill="#1877F2" />
    <path fill="#fff" d="M13.4 19.5v-6h2l.3-2.4h-2.3V9.6c0-.7.2-1.2 1.2-1.2h1.2V6.3c-.2 0-1-.1-1.8-.1-1.8 0-3 1.1-3 3.1v1.8H9v2.4h2v6h2.4z" />
  </svg>
);
