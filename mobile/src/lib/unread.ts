import { useQuery } from '@tanstack/react-query';
import { api } from './api';
import { useAuth } from './auth';

/** Unread notification count for the Alerts tab badge (polled every minute while signed in). */
export function useUnreadCount(): number {
  const { user } = useAuth();
  const q = useQuery({
    queryKey: ['unread', user?.id],
    queryFn: async () => (await api.unreadCount()).unreadCount,
    enabled: !!user,
    refetchInterval: 60_000,
  });
  return user ? (q.data ?? 0) : 0;
}
