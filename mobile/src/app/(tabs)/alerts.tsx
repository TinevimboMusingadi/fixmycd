import React, { useCallback, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, StyleSheet, View } from 'react-native';
import { router, useScrollToTop } from 'expo-router';
import { useBottomTabBarHeight } from 'expo-router/js-tabs';
import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useHideOnScroll } from '@/lib/navScroll';
import { relativeTime } from '@/lib/format';
import type { NotificationItem } from '@/lib/types';
import { brand, statusMeta, tint, useTheme } from '@/theme';
import { ScreenHeader } from '@/components/ScreenHeader';
import { GuestPrompt } from '@/components/GuestPrompt';
import { Avatar, Button, EmptyState, Skeleton, T } from '@/components/ui';
import { toast } from '@/components/Toast';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

function describe(n: NotificationItem): { icon: IconName; color: string; text: string } {
  const who = n.actorDisplayName || 'Someone';
  switch (n.type) {
    case 'upvote':
      return { icon: 'arrow-up-circle', color: brand.purpleStart, text: `${who} upvoted your post` };
    case 'comment':
      return { icon: 'chatbubble', color: brand.blue, text: `${who} commented on your post` };
    case 'endorsement': {
      const lvl = (n.metadata?.severityLevel as number | undefined) ?? null;
      return { icon: 'shield-checkmark', color: brand.green, text: `${who} endorsed your post${lvl ? ` · severity ${lvl}/5` : ''}` };
    }
    case 'status_change': {
      const to = n.metadata?.to as string | undefined;
      return { icon: 'flag', color: to ? statusMeta(to).color : brand.yellow, text: `Your post is now ${to ? statusMeta(to).label.toLowerCase() : 'updated'}` };
    }
    default:
      return { icon: 'notifications', color: brand.purpleStart, text: `${who} interacted with your post` };
  }
}

export default function AlertsScreen() {
  const { user, loading } = useAuth();
  const { colors } = useTheme();
  const qc = useQueryClient();
  const listRef = useRef<FlatList<NotificationItem>>(null);
  useScrollToTop(listRef);
  const tabBarHeight = useBottomTabBarHeight();
  const hideOnScroll = useHideOnScroll();

  const q = useInfiniteQuery({
    queryKey: ['notifications', user?.id],
    enabled: !!user,
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) => api.notifications(pageParam),
    getNextPageParam: (last) => last.nextBefore ?? undefined,
  });
  const items = useMemo(() => q.data?.pages.flatMap((p) => p.items) ?? [], [q.data]);
  const unread = q.data?.pages[0]?.unreadCount ?? 0;

  const markAll = useMutation({
    mutationFn: api.markAllRead,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['notifications'] });
      qc.setQueriesData({ queryKey: ['unread'] }, 0);
    },
    onError: (e) => toast((e as Error).message),
  });

  const open = useCallback(
    (n: NotificationItem) => {
      if (!n.read) {
        api.markRead([n.id]).then(() => {
          qc.invalidateQueries({ queryKey: ['notifications'] });
          qc.invalidateQueries({ queryKey: ['unread'] });
        }).catch(() => {});
      }
      if (n.reportId) router.push({ pathname: '/post/[id]', params: { id: n.reportId } });
    },
    [qc]
  );

  const [refreshing, setRefreshing] = useState(false);

  if (!user && !loading) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg, paddingBottom: tabBarHeight }}>
        <ScreenHeader title="Alerts" />
        <GuestPrompt icon="notifications-outline" title="Stay in the loop" body="Sign in to hear when people upvote, comment on or endorse your posts, and when their status changes." />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScreenHeader
        title="Alerts"
        right={
          unread > 0 ? (
            <Pressable onPress={() => markAll.mutate()} accessibilityRole="button" style={styles.markAll} hitSlop={6}>
              <T v="smallStrong" color="accent">Mark all read</T>
            </Pressable>
          ) : null
        }
      />
      <FlatList
        ref={listRef}
        data={items}
        keyExtractor={(n) => n.id}
        renderItem={({ item }) => <Row n={item} onPress={() => open(item)} />}
        {...hideOnScroll}
        contentContainerStyle={{ paddingBottom: tabBarHeight + 16 }}
        scrollIndicatorInsets={{ bottom: tabBarHeight }}
        ListEmptyComponent={
          q.isLoading ? (
            <View>
              {[0, 1, 2, 3, 4].map((i) => (
                <View key={i} style={[styles.row, { borderBottomColor: colors.border }]}>
                  <Skeleton width={36} height={36} radius={18} />
                  <View style={{ flex: 1, gap: 8 }}>
                    <Skeleton width="70%" height={13} />
                    <Skeleton width="45%" height={11} />
                  </View>
                </View>
              ))}
            </View>
          ) : q.isError ? (
            <EmptyState icon="cloud-offline-outline" title="Couldn't load alerts" body={(q.error as Error).message} action={<Button title="Retry" onPress={() => q.refetch()} />} />
          ) : (
            <EmptyState icon="notifications-outline" title="Nothing yet" body="When people upvote, comment on or endorse your posts, you'll see it here." />
          )
        }
        onEndReached={() => q.hasNextPage && !q.isFetchingNextPage && q.fetchNextPage()}
        onEndReachedThreshold={0.5}
        ListFooterComponent={q.isFetchingNextPage ? <ActivityIndicator style={{ padding: 20 }} color={brand.purpleStart} /> : undefined}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            tintColor={brand.purpleStart}
            colors={[brand.purpleStart]}
            onRefresh={async () => {
              setRefreshing(true);
              await Promise.all([q.refetch(), qc.invalidateQueries({ queryKey: ['unread'] })]);
              setRefreshing(false);
            }}
          />
        }
      />
    </View>
  );
}

function Row({ n, onPress }: { n: NotificationItem; onPress: () => void }) {
  const { colors } = useTheme();
  const d = describe(n);
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${n.read ? '' : 'Unread. '}${d.text}${n.reportTitle ? `: ${n.reportTitle}` : ''}`}
      style={({ pressed }) => [
        styles.row,
        { borderBottomColor: colors.border, backgroundColor: pressed ? colors.bgSecondary : n.read ? colors.bg : tint(brand.purpleStart, 0.06) },
      ]}
    >
      <View style={{ width: 36, alignItems: 'center' }}>
        <Ionicons name={d.icon} size={26} color={d.color} />
      </View>
      <View style={{ flex: 1, gap: 6 }}>
        {n.actorDisplayName ? <Avatar name={n.actorDisplayName} size={28} /> : null}
        <T v="body">
          <T v="bodyStrong">{d.text}</T>
          <T v="body" color="tertiary">{`  ·  ${relativeTime(n.createdAt)}`}</T>
        </T>
        {n.reportTitle ? (
          <T v="small" color="secondary" numberOfLines={2}>
            {n.reportTitle}
          </T>
        ) : null}
      </View>
      {!n.read ? <View style={styles.unreadDot} /> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 10, paddingHorizontal: 14, paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth },
  markAll: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 10 },
  unreadDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: brand.purpleStart, marginTop: 6 },
});
