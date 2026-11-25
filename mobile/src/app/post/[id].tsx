import React, { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { Image } from 'expo-image';
import * as WebBrowser from 'expo-web-browser';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { API_BASE_URL } from '@/lib/config';
import { compactNumber, fullDate, handleFor, relativeTime } from '@/lib/format';
import { haptic, patchPostInCache, sharePost, useUpvote } from '@/lib/hooks';
import type { Comment, Endorsement, PostDetail } from '@/lib/types';
import { brand, radius, severityMeta, statusMeta, tint, useTheme } from '@/theme';
import { LeafletMap } from '@/components/map/LeafletMap';
import { Sheet } from '@/components/Sheet';
import { Avatar, Button, CategoryChip, Chip, Divider, EmptyState, Icon, IconButton, SeverityChip, Skeleton, StatusChip, T } from '@/components/ui';
import { toast } from '@/components/Toast';

const FLAG_REASONS = ['Spam or advertising', 'Fake or misleading', 'Abusive or hateful', 'Private information', 'Wrong location'];

export default function PostScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { user, requireAuth } = useAuth();
  const qc = useQueryClient();
  const onUpvote = useUpvote();
  const [flagOpen, setFlagOpen] = useState(false);

  const post = useQuery({ queryKey: ['post', id], queryFn: () => api.post(id), enabled: !!id });
  const comments = useQuery({ queryKey: ['comments', id], queryFn: () => api.comments(id), enabled: !!id });
  const endorsements = useQuery({ queryKey: ['endorsements', id], queryFn: () => api.endorsements(id), enabled: !!id });

  const [draft, setDraft] = useState('');
  const addComment = useMutation({
    mutationFn: (body: string) => api.addComment(id, body),
    onSuccess: (c) => {
      haptic.success();
      setDraft('');
      qc.setQueryData<Comment[]>(['comments', id], (list) => [c, ...(list ?? [])]);
      patchPostInCache(qc, id, (p) => ({ commentCount: p.commentCount + 1 }));
    },
    onError: (e) => {
      haptic.error();
      toast((e as Error).message);
    },
  });

  const flag = useMutation({
    mutationFn: (reason: string) => api.flag(id, reason),
    onSuccess: () => {
      setFlagOpen(false);
      toast('Thanks — moderators will take a look');
    },
    onError: (e) => toast((e as Error).message),
  });

  const headerRight = () => (
    <IconButton name="ellipsis-horizontal" label="More options" onPress={() => requireAuth(() => setFlagOpen(true), 'Sign in to report a post to moderators.')} />
  );

  if (post.isLoading) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg, padding: 16, gap: 12 }}>
        <Stack.Screen options={{ title: 'Post' }} />
        <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}>
          <Skeleton width={44} height={44} radius={22} />
          <View style={{ gap: 6 }}>
            <Skeleton width={140} height={14} />
            <Skeleton width={90} height={12} />
          </View>
        </View>
        <Skeleton width="90%" height={22} />
        <Skeleton width="100%" height={14} />
        <Skeleton width="80%" height={14} />
        <Skeleton width="100%" height={220} radius={radius.lg} />
      </View>
    );
  }

  if (post.isError || !post.data) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg }}>
        <Stack.Screen options={{ title: 'Post' }} />
        <EmptyState
          icon="alert-circle-outline"
          title="Post unavailable"
          body={(post.error as Error | null)?.message ?? 'It may have been removed.'}
          action={<Button title="Go back" variant="secondary" onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} />}
        />
      </View>
    );
  }

  const p: PostDetail = post.data;
  const name = p.userDisplayName || 'Anonymous';
  const openPdf = () => WebBrowser.openBrowserAsync(`${API_BASE_URL}/api/reports/${encodeURIComponent(p.id)}/pdf`);
  const openInMaps = () => {
    const label = encodeURIComponent(p.title);
    const url =
      Platform.OS === 'ios'
        ? `http://maps.apple.com/?ll=${p.latitude},${p.longitude}&q=${label}`
        : Platform.OS === 'android'
          ? `geo:${p.latitude},${p.longitude}?q=${p.latitude},${p.longitude}(${label})`
          : `https://www.openstreetmap.org/?mlat=${p.latitude}&mlon=${p.longitude}#map=17/${p.latitude}/${p.longitude}`;
    Linking.openURL(url).catch(() => toast("Couldn't open maps"));
  };

  const submitComment = () => {
    const body = draft.trim();
    if (!body) return;
    requireAuth(() => addComment.mutate(body), 'Sign in to join the conversation.');
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={Platform.OS === 'ios' ? 64 + insets.top - 20 : 0}>
      <Stack.Screen options={{ title: 'Post', headerRight }} />
      <ScrollView contentContainerStyle={{ paddingBottom: 24 }} keyboardShouldPersistTaps="handled">
        <View style={styles.pad}>
          <Pressable
            style={styles.author}
            onPress={() => router.push({ pathname: '/user/[id]', params: { id: p.submitterId } })}
            accessibilityRole="button"
            accessibilityLabel={`${name}'s profile`}
          >
            <Avatar name={name} seed={p.submitterId} size={44} />
            <View style={{ flex: 1 }}>
              <T v="bodyStrong" numberOfLines={1}>{name}</T>
              <T v="small" color="secondary">@{handleFor(p.userDisplayName)}</T>
            </View>
          </Pressable>

          <View style={styles.chips}>
            <StatusChip status={p.status} />
            <SeverityChip severity={p.severity} />
            <CategoryChip category={p.category} subcategory={p.subcategory} />
            {p.featured ? <Chip label="Featured" color={brand.purpleStart} icon="star" /> : null}
          </View>

          <T v="title" style={{ marginTop: 10, fontSize: 21, lineHeight: 26 }}>{p.title}</T>
          {p.description ? <T v="body" color="body" style={{ marginTop: 6, fontSize: 16, lineHeight: 22 }}>{p.description}</T> : null}

          {p.aiSummary ? (
            <View style={[styles.summary, { backgroundColor: colors.bgTertiary }]}>
              <Icon name="sparkles" size={14} color={colors.accentText} />
              <T v="small" color="secondary" style={{ flex: 1, fontStyle: 'italic' }}>{p.aiSummary}</T>
            </View>
          ) : null}
        </View>

        {p.imageUrl ? (
          <Image
            source={{ uri: p.imageUrl }}
            style={[styles.photo, { borderColor: colors.border, backgroundColor: colors.bgTertiary }]}
            contentFit="cover"
            transition={200}
            accessibilityLabel={`Photo for ${p.title}`}
          />
        ) : null}
        {p.videoUrl ? (
          <Pressable
            onPress={() => WebBrowser.openBrowserAsync(p.videoUrl!)}
            accessibilityRole="button"
            accessibilityLabel="Play video"
            style={[styles.photo, styles.video, { borderColor: colors.border, backgroundColor: '#000' }]}
          >
            <Ionicons name="play-circle" size={64} color="#fff" />
            <T v="smallStrong" color="#fff">Play video</T>
          </Pressable>
        ) : null}
        {p.audioUrl ? (
          <View style={styles.pad}>
            <Button title="Play audio recording" icon="musical-notes-outline" variant="secondary" onPress={() => WebBrowser.openBrowserAsync(p.audioUrl!)} />
          </View>
        ) : null}

        <View style={[styles.pad, { marginTop: 12 }]}>
          <T v="small" color="secondary">
            {fullDate(p.createdAt)}
            {p.referenceNo ? ` · ${p.referenceNo}` : ''}
          </T>
        </View>

        <View style={[styles.stats, { borderColor: colors.border }]}>
          <Stat n={p.upvoteCount} label={p.upvoteCount === 1 ? 'Upvote' : 'Upvotes'} />
          <Stat n={p.commentCount} label={p.commentCount === 1 ? 'Comment' : 'Comments'} />
          {endorsements.data?.count ? (
            <Stat n={endorsements.data.count} label={endorsements.data.count === 1 ? 'Endorsement' : 'Endorsements'} />
          ) : null}
        </View>

        <View style={[styles.actions, { borderColor: colors.border }]}>
          <ActionBtn
            icon={p.userHasUpvoted ? 'arrow-up-circle' : 'arrow-up-circle-outline'}
            label={p.userHasUpvoted ? 'Upvoted' : 'Upvote'}
            color={p.userHasUpvoted ? brand.purpleStart : colors.textSecondary}
            onPress={() => onUpvote(p)}
            selected={p.userHasUpvoted}
          />
          <ActionBtn icon="share-outline" label="Share" color={colors.textSecondary} onPress={() => sharePost(p)} />
          <ActionBtn icon="document-text-outline" label="PDF sheet" color={colors.textSecondary} onPress={openPdf} />
          <ActionBtn icon="navigate-outline" label="Directions" color={colors.textSecondary} onPress={openInMaps} />
        </View>

        <View style={styles.pad}>
          <View style={[styles.mapWrap, { borderColor: colors.border }]}>
            <LeafletMap
              center={{ lat: p.latitude, lng: p.longitude }}
              zoom={15}
              interactive={false}
              markers={[{ id: p.id, lat: p.latitude, lng: p.longitude, color: statusMeta(p.status).color }]}
              selectedId={p.id}
              style={{ flex: 1 }}
              accessibilityLabel="Location of this post"
            />
            <Pressable style={StyleSheet.absoluteFill} onPress={openInMaps} accessibilityRole="button" accessibilityLabel="Open location in maps" />
          </View>
          <T v="small" color="tertiary" style={{ marginTop: 6 }}>
            {p.latitude.toFixed(5)}, {p.longitude.toFixed(5)}
          </T>
        </View>

        {endorsements.data && endorsements.data.count > 0 ? (
          <View style={[styles.pad, { marginTop: 18 }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <T v="heading">Expert endorsements</T>
              {endorsements.data.averageSeverity ? (
                <Chip label={`Avg severity ${endorsements.data.averageSeverity}/5`} color={brand.green} icon="shield-checkmark" />
              ) : null}
            </View>
            <View style={{ gap: 10, marginTop: 10 }}>
              {endorsements.data.items.map((e) => (
                <EndorsementRow key={e.id} e={e} />
              ))}
            </View>
          </View>
        ) : null}

        <View style={[styles.pad, { marginTop: 22, marginBottom: 4 }]}>
          <T v="heading">Comments</T>
        </View>
        {comments.isLoading ? (
          <View style={{ padding: 16, gap: 10 }}>
            <Skeleton width="70%" height={13} />
            <Skeleton width="50%" height={13} />
          </View>
        ) : comments.data && comments.data.length > 0 ? (
          comments.data.map((c, i) => (
            <View key={c.id}>
              <CommentRow c={c} />
              {i < comments.data!.length - 1 ? <Divider inset={60} /> : null}
            </View>
          ))
        ) : (
          <View style={[styles.pad, { paddingVertical: 12 }]}>
            <T v="body" color="secondary">No comments yet. Start the conversation.</T>
          </View>
        )}
      </ScrollView>

      <View style={[styles.composer, { borderTopColor: colors.border, backgroundColor: colors.bg, paddingBottom: Math.max(insets.bottom, 8) }]}>
        {user ? <Avatar name={user.displayName} seed={user.id} size={32} /> : <Icon name="person-circle-outline" size={32} color={colors.textTertiary} />}
        <TextInput
          value={draft}
          onChangeText={setDraft}
          placeholder={user ? 'Add a comment' : 'Sign in to comment'}
          placeholderTextColor={colors.textTertiary}
          multiline
          maxLength={1000}
          editable={!addComment.isPending}
          onFocus={() => {
            if (!user) requireAuth(() => {}, 'Sign in to join the conversation.');
          }}
          accessibilityLabel="Comment"
          style={[styles.input, { color: colors.text, backgroundColor: colors.bgTertiary }]}
        />
        <Pressable
          onPress={submitComment}
          disabled={!draft.trim() || addComment.isPending}
          accessibilityRole="button"
          accessibilityLabel="Send comment"
          style={({ pressed }) => [
            styles.send,
            { backgroundColor: draft.trim() ? brand.purpleStart : colors.bgTertiary, opacity: pressed ? 0.8 : 1 },
          ]}
        >
          {addComment.isPending ? <ActivityIndicator color="#fff" size="small" /> : <Ionicons name="arrow-up" size={20} color={draft.trim() ? '#fff' : colors.textTertiary} />}
        </Pressable>
      </View>

      <Sheet visible={flagOpen} onClose={() => setFlagOpen(false)} title="Report this post">
        <T v="body" color="secondary" style={{ marginBottom: 10 }}>
          Tell moderators what's wrong. They'll review it against the Code of Ethics.
        </T>
        {FLAG_REASONS.map((r) => (
          <Pressable
            key={r}
            onPress={() => flag.mutate(r)}
            disabled={flag.isPending}
            accessibilityRole="button"
            style={({ pressed }) => [styles.flagRow, { borderColor: colors.border, backgroundColor: pressed ? colors.bgTertiary : 'transparent' }]}
          >
            <T v="body">{r}</T>
            <Icon name="chevron-forward" size={16} color={colors.textTertiary} />
          </Pressable>
        ))}
      </Sheet>
    </KeyboardAvoidingView>
  );
}

function Stat({ n, label }: { n: number; label: string }) {
  return (
    <T v="body" color="secondary">
      <T v="bodyStrong">{compactNumber(n)}</T> {label}
    </T>
  );
}

function ActionBtn({ icon, label, color, onPress, selected }: { icon: React.ComponentProps<typeof Ionicons>['name']; label: string; color: string; onPress: () => void; selected?: boolean }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={selected !== undefined ? { selected } : undefined}
      style={({ pressed }) => [styles.actionBtn, pressed && { backgroundColor: tint(brand.purpleStart, 0.1) }]}
    >
      <Ionicons name={icon} size={22} color={color} />
      <T v="tiny" color={color}>{label}</T>
    </Pressable>
  );
}

function CommentRow({ c }: { c: Comment }) {
  return (
    <View style={styles.comment}>
      <Pressable onPress={() => router.push({ pathname: '/user/[id]', params: { id: c.userId } })} accessibilityLabel={`${c.userDisplayName ?? 'User'}'s profile`}>
        <Avatar name={c.userDisplayName} seed={c.userId} size={36} />
      </Pressable>
      <View style={{ flex: 1 }}>
        <View style={{ flexDirection: 'row', gap: 4, alignItems: 'center' }}>
          <T v="bodyStrong" numberOfLines={1} style={{ flexShrink: 1 }}>{c.userDisplayName || 'Member'}</T>
          <T v="small" color="secondary">· {relativeTime(c.createdAt)}</T>
        </View>
        <T v="body" color="body" style={{ marginTop: 2 }}>{c.body}</T>
      </View>
    </View>
  );
}

function EndorsementRow({ e }: { e: Endorsement }) {
  const { colors } = useTheme();
  const sev = severityMeta(e.severityLevel);
  return (
    <View style={[styles.endorse, { backgroundColor: colors.bgSecondary, borderColor: colors.border }]}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Icon name="shield-checkmark" size={18} color={brand.green} />
        <T v="bodyStrong" style={{ flex: 1 }} numberOfLines={1}>{e.expertName || 'Expert'}</T>
        <Chip label={`Severity ${e.severityLevel}/5`} color={sev?.color ?? brand.blue} />
      </View>
      <T v="tiny" color="secondary" style={{ marginTop: 2 }}>
        {e.expertRole === 'referee' ? 'Expert referee' : 'Admin'} · {relativeTime(e.createdAt, false)}
      </T>
      {e.note ? <T v="body" color="body" style={{ marginTop: 6 }}>{e.note}</T> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  pad: { paddingHorizontal: 16 },
  author: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingTop: 12, minHeight: 56 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 10 },
  summary: { flexDirection: 'row', gap: 8, padding: 10, borderRadius: radius.sm, marginTop: 10 },
  photo: { marginHorizontal: 16, marginTop: 12, aspectRatio: 4 / 3, borderRadius: radius.lg, borderWidth: StyleSheet.hairlineWidth },
  video: { alignItems: 'center', justifyContent: 'center', gap: 6 },
  stats: { flexDirection: 'row', gap: 16, marginHorizontal: 16, marginTop: 12, paddingVertical: 12, borderTopWidth: StyleSheet.hairlineWidth, flexWrap: 'wrap' },
  actions: { flexDirection: 'row', justifyContent: 'space-around', marginHorizontal: 16, paddingVertical: 4, borderTopWidth: StyleSheet.hairlineWidth, borderBottomWidth: StyleSheet.hairlineWidth, marginBottom: 16 },
  actionBtn: { alignItems: 'center', justifyContent: 'center', minWidth: 64, minHeight: 52, gap: 2, borderRadius: radius.md, paddingHorizontal: 6 },
  mapWrap: { height: 170, borderRadius: radius.lg, overflow: 'hidden', borderWidth: StyleSheet.hairlineWidth },
  endorse: { padding: 12, borderRadius: radius.md, borderWidth: StyleSheet.hairlineWidth },
  comment: { flexDirection: 'row', gap: 10, paddingHorizontal: 16, paddingVertical: 12 },
  composer: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, paddingHorizontal: 12, paddingTop: 8, borderTopWidth: StyleSheet.hairlineWidth },
  input: { flex: 1, minHeight: 40, maxHeight: 120, borderRadius: 20, paddingHorizontal: 14, paddingTop: 10, paddingBottom: 10, fontSize: 15 },
  send: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  flagRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', minHeight: 50, borderBottomWidth: StyleSheet.hairlineWidth, paddingHorizontal: 4 },
});
