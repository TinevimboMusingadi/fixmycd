import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import * as Location from 'expo-location';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useCurrentLocation } from '@/lib/location';
import { relativeTime } from '@/lib/format';
import { categoryIcon } from '@/lib/categories';
import type { Post } from '@/lib/types';
import { brand, radius, statusMeta, useTheme } from '@/theme';
import { LeafletMap } from '@/components/map/LeafletMap';
import type { LeafletMapHandle } from '@/components/map/types';
import type { MapBounds } from '@/components/map/leafletHtml';
import { CategoryChip, Icon, SeverityChip, StatusChip, T } from '@/components/ui';
import { toast } from '@/components/Toast';

const DEFAULT_VIEW = { lat: 30, lng: -40, zoom: 2 };

export default function ExploreScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const mapRef = useRef<LeafletMapHandle>(null);
  const loc = useCurrentLocation();
  const [bounds, setBounds] = useState<MapBounds | null>(null);
  const [selected, setSelected] = useState<string | null>(null);

  // If location is already allowed, start the map where the user is.
  useEffect(() => {
    Location.getForegroundPermissionsAsync()
      .then(async (p) => {
        if (p.granted) {
          const c = await loc.request();
          if (c) mapRef.current?.setView(c.lat, c.lng, 12);
        }
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const roundedBox = useMemo(() => {
    if (!bounds) return null;
    const r = (n: number) => Math.round(n * 1000) / 1000;
    const clampLng = (n: number) => Math.max(-180, Math.min(180, n));
    const clampLat = (n: number) => Math.max(-90, Math.min(90, n));
    return { west: clampLng(r(bounds.west)), south: clampLat(r(bounds.south)), east: clampLng(r(bounds.east)), north: clampLat(r(bounds.north)) };
  }, [bounds]);

  const q = useQuery({
    queryKey: ['map', roundedBox],
    queryFn: () => api.postsInBox(roundedBox!, 100),
    enabled: !!roundedBox,
    placeholderData: keepPreviousData,
  });

  const posts = q.data ?? [];
  const markers = useMemo(
    () => posts.map((p) => ({ id: p.id, lat: p.latitude, lng: p.longitude, color: statusMeta(p.status).color })),
    [posts]
  );
  const selectedPost = posts.find((p) => p.id === selected) ?? null;

  const locate = async () => {
    const c = await loc.request();
    if (c) mapRef.current?.setView(c.lat, c.lng, 13);
    else toast('Turn on location to jump to where you are');
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <LeafletMap
        ref={mapRef}
        style={StyleSheet.absoluteFill}
        center={{ lat: DEFAULT_VIEW.lat, lng: DEFAULT_VIEW.lng }}
        zoom={DEFAULT_VIEW.zoom}
        markers={markers}
        selectedId={selected}
        onMarkerPress={setSelected}
        onMapPress={() => setSelected(null)}
        onMove={(e) => setBounds(e.bounds)}
        accessibilityLabel="Map of posts"
      />

      <View style={[styles.top, { top: insets.top + 8 }]} pointerEvents="box-none">
        <View style={[styles.pill, { backgroundColor: colors.bgElevated, borderColor: colors.border }]}>
          <Icon name="map" size={16} color={colors.accentText} />
          <T v="smallStrong">
            {q.isFetching && !q.data ? 'Loading posts…' : `${posts.length}${posts.length === 100 ? '+' : ''} posts in view`}
          </T>
          {q.isFetching ? <ActivityIndicator size="small" color={brand.purpleStart} /> : null}
        </View>
      </View>

      <Pressable
        onPress={locate}
        accessibilityRole="button"
        accessibilityLabel="Show my location"
        style={({ pressed }) => [
          styles.fab,
          { bottom: (selectedPost ? 170 : 20), backgroundColor: colors.bgElevated, borderColor: colors.border, opacity: pressed ? 0.8 : 1 },
        ]}
      >
        {loc.state.status === 'loading' ? <ActivityIndicator color={brand.purpleStart} /> : <Icon name="locate" size={22} color={colors.accentText} />}
      </Pressable>

      {selectedPost ? (
        <Preview post={selectedPost} />
      ) : (
        <View style={[styles.legend, { backgroundColor: colors.bgElevated, borderColor: colors.border }]} pointerEvents="none">
          {['submitted', 'in_review', 'in_progress', 'accepted'].map((s) => (
            <View key={s} style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: statusMeta(s).color }]} />
              <T v="tiny" color="secondary">{statusMeta(s).label}</T>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

function Preview({ post }: { post: Post }) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={() => router.push({ pathname: '/post/[id]', params: { id: post.id } })}
      accessibilityRole="link"
      accessibilityLabel={`Open post: ${post.title}`}
      style={({ pressed }) => [styles.preview, { backgroundColor: colors.bgElevated, borderColor: colors.border, opacity: pressed ? 0.92 : 1 }]}
    >
      {post.imageUrl ? (
        <Image source={{ uri: post.imageUrl }} style={styles.thumb} contentFit="cover" transition={150} />
      ) : (
        <View style={[styles.thumb, { backgroundColor: colors.accentSoft, alignItems: 'center', justifyContent: 'center' }]}>
          <Icon name={categoryIcon(post.category)} size={28} color={colors.accentText} />
        </View>
      )}
      <View style={{ flex: 1, gap: 4 }}>
        <View style={{ flexDirection: 'row', gap: 5, flexWrap: 'wrap' }}>
          <StatusChip status={post.status} />
          <SeverityChip severity={post.severity} />
        </View>
        <T v="bodyStrong" numberOfLines={2}>{post.title}</T>
        <T v="small" color="secondary" numberOfLines={1}>
          {post.userDisplayName || 'Anonymous'} · {relativeTime(post.createdAt)} · ▲ {post.upvoteCount}
        </T>
        <CategoryChip category={post.category} subcategory={post.subcategory} />
      </View>
      <Icon name="chevron-forward" size={18} color={colors.textTertiary} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  top: { position: 'absolute', left: 0, right: 0, alignItems: 'center' },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    height: 38,
    borderRadius: radius.full,
    borderWidth: StyleSheet.hairlineWidth,
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  fab: {
    position: 'absolute',
    right: 14,
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
  legend: {
    position: 'absolute',
    left: 12,
    bottom: 20,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    gap: 4,
  },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendDot: { width: 9, height: 9, borderRadius: 5, borderWidth: 1.5, borderColor: '#fff' },
  preview: {
    position: 'absolute',
    left: 12,
    right: 12,
    bottom: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 10,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  thumb: { width: 84, height: 84, borderRadius: radius.md },
});
