import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Animated, FlatList, Pressable, RefreshControl, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useInfiniteQuery } from '@tanstack/react-query';
import { useScrollToTop } from 'expo-router';
import { useBottomTabBarHeight } from 'expo-router/js-tabs';
import { api, PAGE_SIZE } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useUpvote } from '@/lib/hooks';
import { useCurrentLocation } from '@/lib/location';
import { useHideOnScroll, useNavProgress } from '@/lib/navScroll';
import type { FeedFilters, Post } from '@/lib/types';
import { brand, radius, useTheme } from '@/theme';
import { PostCard, PostCardSkeleton } from '@/components/PostCard';
import { FilterSheet, activeFilterCount } from '@/components/FilterSheet';
import { Avatar, Button, EmptyState, Icon, IconButton, T } from '@/components/ui';

type Mode = 'forYou' | 'nearby';

export default function HomeScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const onUpvote = useUpvote();
  const listRef = useRef<FlatList<Post>>(null);
  useScrollToTop(listRef);
  // Twitter-style: the top bar slides up and the tab bar down while scrolling the feed.
  const tabBarHeight = useBottomTabBarHeight();
  const hideOnScroll = useHideOnScroll();
  const navProgress = useNavProgress();
  const [headerHeight, setHeaderHeight] = useState(insets.top + 52 + 48);

  const [mode, setMode] = useState<Mode>('forYou');
  const [filters, setFilters] = useState<FeedFilters>({});
  const [radiusKm, setRadiusKm] = useState(25);
  const [filterOpen, setFilterOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchText, setSearchText] = useState('');
  const loc = useCurrentLocation();
  const locStatus = loc.state.status;
  const requestLocation = loc.request;

  // Debounce typing into the keyword filter.
  useEffect(() => {
    const id = setTimeout(() => setFilters((f) => ({ ...f, keyword: searchText.trim() || undefined })), 350);
    return () => clearTimeout(id);
  }, [searchText]);

  useEffect(() => {
    if (mode === 'nearby' && locStatus === 'idle') requestLocation();
  }, [mode, locStatus, requestLocation]);

  const coords = loc.state.status === 'ok' ? loc.state.coords : null;
  const nearbyReady = mode === 'nearby' ? !!coords : true;

  const feed = useInfiniteQuery({
    queryKey: ['feed', mode, filters, mode === 'nearby' ? { coords, radiusKm } : null],
    enabled: nearbyReady,
    initialPageParam: 0,
    queryFn: ({ pageParam, signal }) =>
      api.feed(
        {
          ...filters,
          offset: pageParam,
          ...(mode === 'nearby' && coords ? { radiusLat: coords.lat, radiusLng: coords.lng, radiusKm } : {}),
        },
        signal
      ),
    getNextPageParam: (last, pages) => (last.length < PAGE_SIZE ? undefined : pages.length * PAGE_SIZE),
  });

  const posts = useMemo(() => {
    const seen = new Set<string>();
    return (feed.data?.pages.flat() ?? []).filter((p) => (seen.has(p.id) ? false : (seen.add(p.id), true)));
  }, [feed.data]);

  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      if (mode === 'nearby') await loc.request();
      await feed.refetch();
    } finally {
      setRefreshing(false);
    }
  }, [feed, loc, mode]);

  const renderItem = useCallback(({ item }: { item: Post }) => <PostCard post={item} onUpvote={onUpvote} />, [onUpvote]);
  const filterCount = activeFilterCount(filters);

  const headerShift = navProgress.interpolate({ inputRange: [0, 1], outputRange: [0, -(headerHeight - insets.top)] });
  const header = (
    <Animated.View
      onLayout={(e) => setHeaderHeight(e.nativeEvent.layout.height)}
      style={[styles.header, { backgroundColor: colors.bg, paddingTop: insets.top, transform: [{ translateY: searchOpen ? 0 : headerShift }] }]}
    >
      <View style={styles.topBar}>
        {searchOpen ? (
          <View style={[styles.searchBox, { backgroundColor: colors.bgTertiary }]}>
            <Icon name="search" size={17} color={colors.textSecondary} />
            <TextInput
              autoFocus
              value={searchText}
              onChangeText={setSearchText}
              placeholder="Search posts"
              placeholderTextColor={colors.textTertiary}
              returnKeyType="search"
              accessibilityLabel="Search posts"
              style={[styles.searchInput, { color: colors.text }]}
            />
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Close search"
              hitSlop={10}
              onPress={() => {
                setSearchText('');
                setSearchOpen(false);
              }}
            >
              <T v="smallStrong" color="accent">Cancel</T>
            </Pressable>
          </View>
        ) : (
          <>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={user ? 'Your account' : 'Sign in'}
              onPress={() => router.push(user ? '/account' : '/auth/welcome')}
              style={styles.leftSlot}
            >
              {user ? <Avatar name={user.displayName} seed={user.id} size={32} /> : <Icon name="person-circle-outline" size={30} color={colors.textSecondary} />}
            </Pressable>
            <View style={styles.brandMark} accessible accessibilityRole="header" accessibilityLabel="FixMyDistrict">
              <Image source={require('../../../assets/splash-icon.png')} style={{ width: 30, height: 30 }} />
            </View>
            <View style={styles.rightSlot}>
              <IconButton name="search" label="Search" onPress={() => setSearchOpen(true)} size={21} />
              <View>
                <IconButton name="options-outline" label={`Filters${filterCount ? `, ${filterCount} active` : ''}`} onPress={() => setFilterOpen(true)} size={21} />
                {filterCount ? (
                  <View style={styles.filterBadge} pointerEvents="none">
                    <T v="tiny" color="#fff" style={{ fontSize: 9 }}>{filterCount}</T>
                  </View>
                ) : null}
              </View>
            </View>
          </>
        )}
      </View>
      <View style={[styles.segments, { borderBottomColor: colors.border }]}>
        {(['forYou', 'nearby'] as const).map((m) => {
          const active = mode === m;
          return (
            <Pressable
              key={m}
              onPress={() => {
                setMode(m);
                listRef.current?.scrollToOffset({ offset: 0, animated: false });
              }}
              accessibilityRole="tab"
              accessibilityState={{ selected: active }}
              style={styles.segment}
            >
              <T v="bodyStrong" color={active ? 'primary' : 'secondary'} style={{ fontWeight: active ? '700' : '500' }}>
                {m === 'forYou' ? 'For you' : 'Nearby'}
              </T>
              <View style={[styles.indicator, { backgroundColor: active ? brand.purpleStart : 'transparent' }]} />
            </Pressable>
          );
        })}
      </View>
    </Animated.View>
  );

  let empty: React.ReactNode = null;
  if (mode === 'nearby' && !coords) {
    if (loc.state.status === 'loading' || loc.state.status === 'idle') empty = <Loading />;
    else
      empty = (
        <EmptyState
          icon="location-outline"
          title="See what's near you"
          body={
            loc.state.status === 'denied'
              ? 'Location is off for FixMyDistrict. Turn it on in Settings to see posts around you.'
              : "We couldn't get your location. Check that location services are on and try again."
          }
          action={<Button title="Try again" icon="locate" onPress={() => loc.request()} />}
        />
      );
  } else if (feed.isLoading) {
    empty = (
      <View>
        <PostCardSkeleton />
        <PostCardSkeleton photo={false} />
        <PostCardSkeleton />
      </View>
    );
  } else if (feed.isError) {
    empty = (
      <EmptyState
        icon="cloud-offline-outline"
        title="Couldn't load posts"
        body={(feed.error as Error).message}
        action={<Button title="Retry" onPress={() => feed.refetch()} />}
      />
    );
  } else {
    empty = (
      <EmptyState
        icon={filters.keyword || filterCount ? 'search-outline' : 'sparkles-outline'}
        title={filters.keyword || filterCount ? 'No matching posts' : mode === 'nearby' ? 'Nothing nearby yet' : 'No posts yet'}
        body={
          filters.keyword || filterCount
            ? 'Try different words or clear some filters.'
            : mode === 'nearby'
              ? `No posts within ${radiusKm} km. Spotted a problem? Be the first to post it.`
              : 'Spotted a problem? Be the first to post it.'
        }
        action={
          filters.keyword || filterCount ? (
            <Button
              title="Clear filters"
              variant="secondary"
              onPress={() => {
                setFilters({});
                setSearchText('');
              }}
            />
          ) : undefined
        }
      />
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <FlatList
        ref={listRef}
        {...(searchOpen ? {} : hideOnScroll)}
        data={nearbyReady && !feed.isLoading ? posts : []}
        keyExtractor={(p) => p.id}
        renderItem={renderItem}
        ListEmptyComponent={empty as React.ReactElement}
        ListHeaderComponent={
          mode === 'nearby' && coords && posts.length ? (
            <View style={[styles.nearbyNote, { borderBottomColor: colors.border }]}>
              <Icon name="navigate" size={13} color={colors.accentText} />
              <T v="small" color="secondary">Within {radiusKm} km of you</T>
            </View>
          ) : undefined
        }
        onEndReachedThreshold={0.6}
        onEndReached={() => {
          if (feed.hasNextPage && !feed.isFetchingNextPage) feed.fetchNextPage();
        }}
        ListFooterComponent={
          feed.isFetchingNextPage ? (
            <View style={{ padding: 20 }}>
              <ActivityIndicator color={brand.purpleStart} />
            </View>
          ) : posts.length > 0 && !feed.hasNextPage ? (
            <View style={{ padding: 24, alignItems: 'center' }}>
              <T v="small" color="tertiary">You're all caught up</T>
            </View>
          ) : undefined
        }
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={brand.purpleStart}
            colors={[brand.purpleStart]}
            progressViewOffset={headerHeight}
          />
        }
        keyboardDismissMode="on-drag"
        removeClippedSubviews
        windowSize={9}
        initialNumToRender={6}
        contentContainerStyle={{ paddingTop: headerHeight, paddingBottom: tabBarHeight + 24 }}
        scrollIndicatorInsets={{ top: headerHeight - insets.top, bottom: tabBarHeight }}
      />
      {header}
      {/* Keeps the status bar area solid while the header is slid away. */}
      <View pointerEvents="none" style={[styles.statusCover, { height: insets.top, backgroundColor: colors.bg }]} />
      <FilterSheet
        visible={filterOpen}
        onClose={() => setFilterOpen(false)}
        value={filters}
        onApply={(f) => setFilters({ ...f, keyword: filters.keyword })}
        radiusKm={radiusKm}
        onRadius={setRadiusKm}
        showRadius={mode === 'nearby'}
      />
    </View>
  );
}

function Loading() {
  return (
    <View style={{ padding: 48, alignItems: 'center' }}>
      <ActivityIndicator color={brand.purpleStart} />
    </View>
  );
}

const styles = StyleSheet.create({
  header: { position: 'absolute', top: 0, left: 0, right: 0, zIndex: 2 },
  statusCover: { position: 'absolute', top: 0, left: 0, right: 0, zIndex: 3 },
  topBar: { height: 52, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8 },
  leftSlot: { width: 88, height: 44, justifyContent: 'center', paddingLeft: 6 },
  brandMark: { flex: 1, alignItems: 'center' },
  rightSlot: { width: 88, flexDirection: 'row', justifyContent: 'flex-end' },
  searchBox: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, height: 40, borderRadius: radius.full, paddingHorizontal: 14, marginHorizontal: 6 },
  searchInput: { flex: 1, fontSize: 16, height: 40 },
  segments: { flexDirection: 'row', borderBottomWidth: StyleSheet.hairlineWidth },
  segment: { flex: 1, alignItems: 'center', paddingTop: 10, minHeight: 44 },
  indicator: { height: 4, width: 56, borderRadius: 2, marginTop: 10 },
  filterBadge: {
    position: 'absolute',
    top: 6,
    right: 6,
    minWidth: 15,
    height: 15,
    borderRadius: 8,
    backgroundColor: brand.purpleStart,
    alignItems: 'center',
    justifyContent: 'center',
  },
  nearbyNote: { flexDirection: 'row', gap: 6, alignItems: 'center', paddingHorizontal: 16, paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth },
});
