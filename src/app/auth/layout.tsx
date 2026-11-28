import { ClerkProvider } from '@clerk/nextjs';
import Link from 'next/link';

/**
 * Clerk is loaded only on these pages (/auth/*): it proves who someone is, then
 * /auth/complete swaps that for a FixMyDistrict session. Without Clerk keys this
 * section explains that social sign-in isn't set up.
 */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  const publishableKey = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
  return (
    <main className="auth-container">
      <div className="auth-card">
        {publishableKey ? (
          <ClerkProvider publishableKey={publishableKey} signInUrl="/auth/continue" signUpUrl="/auth/continue" afterSignOutUrl="/login">
            {children}
          </ClerkProvider>
        ) : (
          <>
            <h2>Social sign-in isn’t set up</h2>
            <p className="auth-subtitle">This site doesn’t offer Google, LinkedIn or Facebook sign-in yet.</p>
            <Link href="/login" className="btn-primary">Sign in with email</Link>
          </>
        )}
      </div>
    </main>
  );
}
