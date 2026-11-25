import React, { useCallback, useMemo } from 'react';
import { ActivityIndicator, FlatList, RefreshControl, StyleSheet, View } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { api, PAGE_SIZE } from '@/lib/api';
import { handleFor } from '@/lib/format';
import { useUpvote } from '@/lib/hooks';
import type { Post } from '@/lib/types';
import { brand, useTheme } from '@/theme';
import { PostCard, PostCardSkeleton } from '@/components/PostCard';
import { Avatar, Chip, EmptyState, Icon, Skeleton, T } from '@/components/ui';

const ROLE: Record<string, string> = { referee: 'Expert referee', admin: 'Admin', super_admin: 'Admin' };

export default function ProfileScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { colors } = useTheme();
  const onUpvote = useUpvote();

  const profile = useQuery({ queryKey: ['user', id], queryFn: () => api.user(id), enabled: !!id });
  const feed = useInfiniteQuery({
    queryKey: ['feed', 'user', id],
    enabled: !!id,
    initialPageParam: 0,
    queryFn: ({ pageParam, signal }) => api.feed({ userId: id, offset: pageParam }, signal),
    getNextPageParam: (last, pages) => (last.length < PAGE_SIZE ? undefined : pages.length * PAGE_SIZE),
  });
  const posts = useMemo(() => feed.data?.pages.flat() ?? [], [feed.data]);
  const renderItem = useCallback(({ item }: { item: Post }) => <PostCard post={item} onUpvote={onUpvote} />, [onUpvote]);

  const u = profile.data;
  const header = (
    <View>
      <LinearGradient colors={[brand.purpleStart, brand.purpleEnd]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.banner} />
      <View style={styles.headerBody}>
        <View style={[styles.avatarRing, { borderColor: colors.bg, backgroundColor: colors.bg }]}>
          {u ? <Avatar name={u.displayName} seed={u.id} size={76} /> : <Skeleton width={76} height={76} radius={38} />}
        </View>
        {u ? (
          <>
            <T v="title" style={{ marginTop: 8 }}>{u.displayName || 'Member'}</T>
            <T v="body" color="secondary">@{handleFor(u.displayName)}</T>
            {u.bio ? <T v="body" color="body" style={{ marginTop: 8 }}>{u.bio}</T> : null}
            <View style={{ flexDirection: 'row', gap: 12, marginTop: 10, alignItems: 'center', flexWrap: 'wrap' }}>
              {ROLE[u.role] ? <Chip label={ROLE[u.role]} color={brand.green} icon="shield-checkmark" /> : null}
              <View style={{ flexDirection: 'row', gap: 4, alignItems: 'center' }}>
                <Icon name="calendar-outline" size={14} color={colors.textSecondary} />
                <T v="small" color="secondary">
                  Joined {new Date(u.createdAt).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}
                </T>
              </View>
            </View>
          </>
        ) : profile.isError ? (
          <T v="body" color="secondary" style={{ marginTop: 8 }}>{(profile.error as Error).message}</T>
        ) : (
          <View style={{ gap: 8, marginTop: 10 }}>
            <Skeleton width={160} height={18} />
            <Skeleton width={100} height={13} />
          </View>
        )}
      </View>
      <View style={[styles.tabRow, { borderBottomColor: colors.border }]}>
        <T v="bodyStrong">Posts</T>
        <View style={styles.indicator} />
      </View>
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Stack.Screen options={{ title: u?.displayName || 'Profile' }} />
      <FlatList
        data={posts}
        keyExtractor={(p) => p.id}
        renderItem={renderItem}
        ListHeaderComponent={header}
        ListEmptyComponent={
          feed.isLoading ? (
            <View>
              <PostCardSkeleton />
              <PostCardSkeleton photo={false} />
            </View>
          ) : (
            <EmptyState icon="document-text-outline" title="No posts yet" body="Posts from this person will show up here." />
          )
        }
        onEndReached={() => feed.hasNextPage && !feed.isFetchingNextPage && feed.fetchNextPage()}
        onEndReachedThreshold={0.5}
        ListFooterComponent={feed.isFetchingNextPage ? <ActivityIndicator style={{ padding: 20 }} color={brand.purpleStart} /> : undefined}
        refreshControl={
          <RefreshControl
            refreshing={feed.isRefetching && !feed.isFetchingNextPage}
            onRefresh={() => {
              profile.refetch();
              feed.refetch();
            }}
            tintColor={brand.purpleStart}
          />
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  banner: { height: 96 },
  headerBody: { paddingHorizontal: 16, marginTop: -40 },
  avatarRing: { width: 84, height: 84, borderRadius: 42, borderWidth: 4, alignItems: 'center', justifyContent: 'center' },
  tabRow: { alignItems: 'center', marginTop: 14, paddingTop: 8, borderBottomWidth: StyleSheet.hairlineWidth, alignSelf: 'stretch' },
  indicator: { height: 4, width: 48, borderRadius: 2, backgroundColor: brand.purpleStart, marginTop: 10 },
});
