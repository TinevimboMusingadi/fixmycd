import { useCallback, useRef } from 'react';
import { Share, Platform } from 'react-native';
import * as Haptics from 'expo-haptics';
import { type InfiniteData, type QueryClient, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from './api';
import { useAuth } from './auth';
import { publicPostUrl } from './config';
import type { Post } from './types';
import { toast } from '@/components/Toast';

export const haptic = {
  light: () => {
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
  },
  select: () => {
    if (Platform.OS !== 'web') Haptics.selectionAsync().catch(() => {});
  },
  success: () => {
    if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
  },
  warning: () => {
    if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
  },
  error: () => {
    if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
  },
};

type PostPatch = Partial<Pick<Post, 'upvoteCount' | 'userHasUpvoted' | 'commentCount'>>;

/** Apply a change to one post everywhere it is cached (feeds, map, detail). */
export function patchPostInCache(qc: QueryClient, id: string, patch: PostPatch | ((p: Post) => PostPatch)) {
  const apply = (p: Post): Post => (p.id === id ? { ...p, ...(typeof patch === 'function' ? patch(p) : patch) } : p);
  qc.setQueriesData<InfiniteData<Post[]>>({ queryKey: ['feed'] }, (data) =>
    data ? { ...data, pages: data.pages.map((page) => page.map(apply)) } : data
  );
  qc.setQueriesData<Post[]>({ queryKey: ['map'] }, (data) => (data ? data.map(apply) : data));
  qc.setQueryData<Post>(['post', id], (p) => (p ? apply(p) : p));
}

/** Optimistic upvote toggle with haptics; rolls back on failure. */
export function useUpvote() {
  const qc = useQueryClient();
  const { requireAuth } = useAuth();
  const inFlight = useRef(new Set<string>());

  const mutation = useMutation({
    mutationFn: ({ id, on }: { id: string; on: boolean }) => api.upvote(id, on),
    onMutate: async ({ id, on }) => {
      patchPostInCache(qc, id, (p) => ({
        userHasUpvoted: on,
        upvoteCount: Math.max(0, p.upvoteCount + (on ? 1 : -1)),
      }));
    },
    onSuccess: (res, { id }) => patchPostInCache(qc, id, { userHasUpvoted: res.upvoted, upvoteCount: res.upvoteCount }),
    onError: (err, { id, on }) => {
      patchPostInCache(qc, id, (p) => ({
        userHasUpvoted: !on,
        upvoteCount: Math.max(0, p.upvoteCount + (on ? -1 : 1)),
      }));
      haptic.error();
      toast((err as Error).message || 'Could not update your upvote');
    },
    onSettled: (_r, _e, { id }) => {
      inFlight.current.delete(id);
    },
  });

  return useCallback(
    (post: Pick<Post, 'id' | 'userHasUpvoted'>) =>
      requireAuth(() => {
        if (inFlight.current.has(post.id)) return;
        inFlight.current.add(post.id);
        const on = !post.userHasUpvoted;
        if (on) haptic.light();
        else haptic.select();
        mutation.mutate({ id: post.id, on });
      }, 'Sign in to upvote posts and help the right problems get fixed first.'),
    [mutation, requireAuth]
  );
}

export async function sharePost(post: Pick<Post, 'id' | 'title'>) {
  const url = publicPostUrl(post.id);
  try {
    if (Platform.OS === 'web') {
      const nav = globalThis.navigator as Navigator | undefined;
      if (nav?.share) await nav.share({ title: post.title, url });
      else if (nav?.clipboard) {
        await nav.clipboard.writeText(url);
        toast('Link copied');
      }
      return;
    }
    await Share.share(
      Platform.OS === 'ios' ? { url, message: post.title } : { message: `${post.title}\n${url}`, title: post.title },
      { dialogTitle: 'Share post' }
    );
  } catch {
    // Dismissed.
  }
}
