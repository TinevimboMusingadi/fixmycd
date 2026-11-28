import React, { memo, useRef } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { brand, radius, type as t, useTheme } from '@/theme';
import { compactNumber, handleFor, relativeTime, fullDate } from '@/lib/format';
import { sharePost } from '@/lib/hooks';
import type { Post } from '@/lib/types';
import { Avatar, CategoryChip, Chip, SeverityChip, StatusChip, Skeleton } from './ui';

interface Props {
  post: Post;
  onUpvote: (post: Post) => void;
}

function PostCardInner({ post, onUpvote }: Props) {
  const { colors } = useTheme();
  const scale = useRef(new Animated.Value(1)).current;
  const open = () => router.push({ pathname: '/post/[id]', params: { id: post.id } });
  const openProfile = () => router.push({ pathname: '/user/[id]', params: { id: post.submitterId } });

  const upvote = () => {
    if (!post.userHasUpvoted) {
      scale.setValue(0.7);
      Animated.spring(scale, { toValue: 1, friction: 3, tension: 200, useNativeDriver: true }).start();
    }
    onUpvote(post);
  };

  const name = post.userDisplayName || 'Anonymous';
  const upColor = post.userHasUpvoted ? brand.purpleStart : colors.textSecondary;

  return (
    <Pressable
      onPress={open}
      accessibilityRole="link"
      accessibilityLabel={`Post by ${name}: ${post.title}`}
      style={({ pressed }) => [styles.card, { borderBottomColor: colors.border, backgroundColor: pressed ? colors.bgSecondary : colors.bg }]}
    >
      <Pressable onPress={openProfile} accessibilityRole="button" accessibilityLabel={`${name}'s profile`} hitSlop={4}>
        <Avatar name={name} seed={post.submitterId} size={42} />
      </Pressable>

      <View style={styles.body}>
        <View style={styles.header}>
          <Text style={[t.bodyStrong, { color: colors.text, flexShrink: 1, maxWidth: '60%' }]} numberOfLines={1} onPress={openProfile}>
            {name}
          </Text>
          <Text style={[t.body, { color: colors.textSecondary, flexShrink: 1 }]} numberOfLines={1}>
            @{handleFor(post.userDisplayName)}
          </Text>
          <Text style={[t.body, { color: colors.textSecondary, flexShrink: 0 }]} numberOfLines={1} accessibilityLabel={fullDate(post.createdAt)}>
            · {relativeTime(post.createdAt)}
          </Text>
        </View>

        <View style={styles.chips}>
          <StatusChip status={post.status} />
          <SeverityChip severity={post.severity} />
          <CategoryChip category={post.category} subcategory={post.subcategory} />
          {post.featured ? <Chip label="Featured" color={brand.purpleStart} icon="star" /> : null}
          {post.mediaVerdict === 'ai_confirmed' ? (
            <Chip label="AI-generated media" color={brand.red} icon="warning" />
          ) : post.mediaVerdict === 'suspected_ai' ? (
            <Chip label="Possibly AI" color={brand.yellow} icon="warning" />
          ) : null}
        </View>

        <Text style={[t.bodyStrong, { color: colors.text, marginTop: 6 }]}>{post.title}</Text>
        {post.description ? (
          <Text style={[t.body, { color: colors.textBody, marginTop: 2 }]} numberOfLines={3}>
            {post.description}
          </Text>
        ) : null}

        {post.imageUrl ? (
          <Image
            source={{ uri: post.imageUrl }}
            style={[styles.photo, { borderColor: colors.border, backgroundColor: colors.bgTertiary }]}
            contentFit="cover"
            transition={180}
            recyclingKey={post.id}
            accessibilityLabel={`Photo for ${post.title}`}
          />
        ) : post.videoUrl ? (
          <View style={[styles.photo, styles.videoStub, { borderColor: colors.border, backgroundColor: colors.bgTertiary }]}>
            <Ionicons name="play-circle" size={48} color={colors.textSecondary} />
            <Text style={[t.small, { color: colors.textSecondary }]}>Video</Text>
          </View>
        ) : null}

        <View style={styles.actions}>
          <Action icon="chatbubble-outline" label={`${post.commentCount} comments`} count={post.commentCount} onPress={open} color={colors.textSecondary} />
          <Pressable
            onPress={upvote}
            accessibilityRole="button"
            accessibilityLabel={post.userHasUpvoted ? 'Remove upvote' : 'Upvote'}
            accessibilityState={{ selected: post.userHasUpvoted }}
            accessibilityValue={{ text: `${post.upvoteCount} upvotes` }}
            hitSlop={4}
            style={({ pressed }) => [styles.action, pressed && { backgroundColor: 'rgba(139,92,246,0.10)' }]}
          >
            <Animated.View style={{ transform: [{ scale }] }}>
              <Ionicons name={post.userHasUpvoted ? 'arrow-up-circle' : 'arrow-up-circle-outline'} size={21} color={upColor} />
            </Animated.View>
            <Text style={[t.small, { color: upColor, fontWeight: post.userHasUpvoted ? '700' : '400' }]}>{compactNumber(post.upvoteCount)}</Text>
          </Pressable>
          {post.endorsementCount ? (
            <View style={styles.action} accessibilityLabel={`${post.endorsementCount} expert endorsement${post.endorsementCount === 1 ? '' : 's'}`}>
              <Ionicons name="shield-checkmark-outline" size={18} color={brand.green} />
              <Text style={[t.small, { color: brand.green }]}>{post.endorsementCount}</Text>
            </View>
          ) : (
            <View style={styles.action} />
          )}
          <Action icon="share-outline" label="Share" onPress={() => sharePost(post)} color={colors.textSecondary} />
        </View>
      </View>
    </Pressable>
  );
}

function Action({ icon, count, label, onPress, color }: { icon: React.ComponentProps<typeof Ionicons>['name']; count?: number; label: string; onPress: () => void; color: string }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={4}
      style={({ pressed }) => [styles.action, pressed && { backgroundColor: 'rgba(139,92,246,0.10)' }]}
    >
      <Ionicons name={icon} size={18} color={color} />
      {count !== undefined ? <Text style={[t.small, { color }]}>{compactNumber(count)}</Text> : null}
    </Pressable>
  );
}

export const PostCard = memo(PostCardInner);

export function PostCardSkeleton({ photo = true }: { photo?: boolean }) {
  const { colors } = useTheme();
  return (
    <View style={[styles.card, { borderBottomColor: colors.border }]}>
      <Skeleton width={42} height={42} radius={21} />
      <View style={[styles.body, { gap: 8 }]}>
        <Skeleton width="55%" height={14} />
        <View style={{ flexDirection: 'row', gap: 6 }}>
          <Skeleton width={64} height={16} radius={8} />
          <Skeleton width={90} height={16} radius={8} />
        </View>
        <Skeleton width="85%" height={14} />
        <Skeleton width="95%" height={12} />
        <Skeleton width="70%" height={12} />
        {photo ? <Skeleton width="100%" height={180} radius={radius.lg} /> : null}
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingRight: 24 }}>
          <Skeleton width={36} height={14} />
          <Skeleton width={36} height={14} />
          <Skeleton width={36} height={14} />
          <Skeleton width={24} height={14} />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 4,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  body: { flex: 1, minWidth: 0 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 5, marginTop: 4 },
  photo: {
    width: '100%',
    aspectRatio: 16 / 10,
    borderRadius: radius.lg,
    marginTop: 10,
    borderWidth: StyleSheet.hairlineWidth,
  },
  videoStub: { alignItems: 'center', justifyContent: 'center', gap: 4 },
  actions: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 4, marginLeft: -10, paddingRight: 8 },
  action: { flexDirection: 'row', alignItems: 'center', gap: 5, minHeight: 44, minWidth: 56, paddingHorizontal: 10, borderRadius: 22 },
});
