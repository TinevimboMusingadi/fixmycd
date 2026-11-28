'use client';

import { SignIn } from '@clerk/nextjs';

/** Clerk's sign-in: Google, LinkedIn, Facebook, email code. New people are signed up in the same flow. */
export default function ContinuePage() {
  return (
    <>
      <h2>Continue to FixMyDistrict</h2>
      <p className="auth-subtitle">Use Google, LinkedIn, Facebook or an email code. New accounts are verified before they can post.</p>
      <div className="clerk-widget">
        <SignIn
          routing="hash"
          withSignUp
          forceRedirectUrl="/auth/complete"
          signUpForceRedirectUrl="/auth/complete"
          appearance={{ variables: { colorPrimary: '#7c3aed', borderRadius: '12px' } }}
        />
      </div>
    </>
  );
}
