/**
 * Kept in memory only (never persisted or put in a URL) so the "pending approval"
 * screen can run the $1 verification right after signup without retyping the password.
 */
let pending: { email: string; password: string } | null = null;

export function rememberPendingCredentials(email: string, password: string) {
  pending = { email, password };
}

export function takePendingCredentials(): { email: string; password: string } | null {
  return pending;
}

export function clearPendingCredentials() {
  pending = null;
}
