import Constants from 'expo-constants';

const fromConfig = (Constants.expoConfig?.extra as { apiBaseUrl?: string } | undefined)?.apiBaseUrl;

/**
 * Base URL of the FixMyDistrict API (the Next.js app). Set in app.config.ts
 * (`extra.apiBaseUrl`) and overridable with EXPO_PUBLIC_API_URL.
 */
export const API_BASE_URL: string = (
  process.env.EXPO_PUBLIC_API_URL ||
  fromConfig ||
  'https://fixmycd.vercel.app'
).replace(/\/+$/, '');

/** Public link to a post, used for sharing (opens the post on the web). */
export const publicPostUrl = (id: string) => `${API_BASE_URL}/r/${encodeURIComponent(id)}`;

/** Website pages opened in the browser. */
export const webUrl = (path: string) => `${API_BASE_URL}${path}`;
