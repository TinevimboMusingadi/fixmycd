import React from 'react';
import { ClerkProvider } from '@clerk/expo';
import { tokenCache } from '@clerk/expo/token-cache';
import { CLERK_PUBLISHABLE_KEY } from './config';

/** Social sign-in is offered only when the app was built with a Clerk publishable key. */
export const clerkEnabled = !!CLERK_PUBLISHABLE_KEY;

/**
 * Clerk only proves who someone is (Google, LinkedIn, Facebook). The app then swaps that for its
 * own FixMyDistrict session (api.clerkExchange) and signs out of Clerk. Clerk's own short-lived
 * tokens are cached in secure storage by `tokenCache`.
 */
export function ClerkGate({ children }: { children: React.ReactNode }) {
  if (!clerkEnabled) return <>{children}</>;
  return (
    <ClerkProvider publishableKey={CLERK_PUBLISHABLE_KEY} tokenCache={tokenCache}>
      {children}
    </ClerkProvider>
  );
}
