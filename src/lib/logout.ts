import { clearOfflineCaches } from './pwa-client';

/** End the session, drop offline caches, and go to the login page. */
export async function logOut(): Promise<void> {
  await fetch('/api/auth/logout', { method: 'POST' });
  await clearOfflineCaches();
  window.location.href = '/login';
}
