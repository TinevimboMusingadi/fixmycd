import React, { createContext, useCallback, useContext, useMemo } from 'react';
import { Alert, Platform } from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { api } from './api';
import type { SessionUser } from './types';

interface AuthContextValue {
  user: SessionUser | null;
  loading: boolean;
  isAdmin: boolean;
  isExpert: boolean;
  login: (email: string, password: string) => Promise<SessionUser>;
  logout: () => Promise<void>;
  /** Re-read the session (after /api/verify signs the user in). */
  refresh: () => Promise<void>;
  /** Run `action` when signed in, otherwise offer to sign in. */
  requireAuth: (action: () => void, reason?: string) => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);
export const ME_KEY = ['me'] as const;

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const qc = useQueryClient();
  const me = useQuery({ queryKey: ME_KEY, queryFn: api.me, staleTime: 5 * 60_000, retry: 1 });
  const user = me.data ?? null;

  const refresh = useCallback(async () => {
    await qc.invalidateQueries({ queryKey: ME_KEY });
    await qc.refetchQueries({ queryKey: ME_KEY });
  }, [qc]);

  const login = useCallback(
    async (email: string, password: string) => {
      const res = await api.login(email.trim(), password);
      // Fetch the full profile and drop anything cached as a guest (upvote state, etc.).
      const full = (await api.me()) ?? res.user;
      qc.setQueryData(ME_KEY, full);
      qc.invalidateQueries({ predicate: (q) => q.queryKey[0] !== 'me' });
      return full;
    },
    [qc]
  );

  const logout = useCallback(async () => {
    try {
      await api.logout();
    } finally {
      qc.setQueryData(ME_KEY, null);
      qc.removeQueries({ predicate: (q) => q.queryKey[0] !== 'me' });
    }
  }, [qc]);

  const requireAuth = useCallback(
    (action: () => void, reason = 'Sign in to take part.') => {
      if (user) return action();
      if (Platform.OS === 'web') {
        router.push('/auth/welcome');
        return;
      }
      Alert.alert('Join FixMyDistrict', reason, [
        { text: 'Not now', style: 'cancel' },
        { text: 'Sign in', onPress: () => router.push('/auth/login') },
        { text: 'Create account', onPress: () => router.push('/auth/signup') },
      ]);
    },
    [user]
  );

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      loading: me.isLoading,
      isAdmin: !!user && (user.role === 'admin' || user.role === 'super_admin'),
      isExpert: !!user && (user.role === 'referee' || user.role === 'admin' || user.role === 'super_admin'),
      login,
      logout,
      refresh,
      requireAuth,
    }),
    [user, me.isLoading, login, logout, refresh, requireAuth]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
