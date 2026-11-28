import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

/**
 * The app's session token. It lives in the platform's secure storage (iOS Keychain,
 * Android Keystore-encrypted storage), readable only by this app on this device: it is not
 * included in backups or restored to another phone. The server ends it after 30 days, or
 * 14 days without use, and an admin can revoke it at any time.
 */
const KEY = 'fmd.session.v1';
const OPTIONS: SecureStore.SecureStoreOptions = { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY };

let token: string | null = null;
let loaded: Promise<string | null> | null = null;
const listeners = new Set<() => void>();

export function loadSessionToken(): Promise<string | null> {
  loaded ??= (async () => {
    try {
      token = Platform.OS === 'web' ? (globalThis.sessionStorage?.getItem(KEY) ?? null) : await SecureStore.getItemAsync(KEY, OPTIONS);
    } catch {
      token = null;
    }
    return token;
  })();
  return loaded;
}

export function currentSessionToken(): string | null {
  return token;
}

export async function setSessionToken(value: string | null): Promise<void> {
  token = value;
  loaded = Promise.resolve(value);
  try {
    if (Platform.OS === 'web') {
      // The web build is for testing; keep it to this tab.
      if (value) globalThis.sessionStorage?.setItem(KEY, value);
      else globalThis.sessionStorage?.removeItem(KEY);
    } else if (value) {
      await SecureStore.setItemAsync(KEY, value, OPTIONS);
    } else {
      await SecureStore.deleteItemAsync(KEY, OPTIONS);
    }
  } catch {
    // If secure storage fails the session still works until the app closes.
  }
}

/** Called when the server says the session is no longer valid (expired, revoked, account disabled). */
export function onSessionEnded(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export async function endSession(): Promise<void> {
  const had = !!token;
  await setSessionToken(null);
  if (had) listeners.forEach((fn) => fn());
}
