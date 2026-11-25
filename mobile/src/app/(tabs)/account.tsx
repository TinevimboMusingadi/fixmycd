import React from 'react';
import { Alert, Platform, Pressable, ScrollView, StyleSheet, Switch, View } from 'react-native';
import { router } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import Constants from 'expo-constants';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { ME_KEY, useAuth } from '@/lib/auth';
import { API_BASE_URL, webUrl } from '@/lib/config';
import { handleFor } from '@/lib/format';
import { brand, radius, tint, useTheme, type ThemePreference } from '@/theme';
import { ScreenHeader } from '@/components/ScreenHeader';
import { Avatar, Button, Chip, Divider, Icon, type IconName, SectionTitle, T } from '@/components/ui';
import { toast } from '@/components/Toast';

const ROLE_LABEL: Record<string, string> = {
  viewer: 'Viewer',
  submitter: 'Member',
  referee: 'Expert referee',
  admin: 'Admin',
  super_admin: 'Super admin',
};

export default function AccountScreen() {
  const { colors } = useTheme();
  const { user, isAdmin, logout } = useAuth();
  const qc = useQueryClient();

  const profile = useQuery({ queryKey: ['user', user?.id], queryFn: () => api.user(user!.id), enabled: !!user });

  const emailPref = useMutation({
    mutationFn: (on: boolean) => api.updateProfile(user!.id, { emailNotifications: on }),
    onMutate: (on) => qc.setQueryData(ME_KEY, { ...user!, emailNotifications: on }),
    onError: (e) => {
      qc.invalidateQueries({ queryKey: ME_KEY });
      toast((e as Error).message);
    },
  });

  const confirmLogout = () => {
    const go = async () => {
      await logout();
      toast('Signed out');
    };
    if (Platform.OS === 'web') return void go();
    Alert.alert('Log out?', 'You can keep browsing posts as a guest.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Log out', style: 'destructive', onPress: go },
    ]);
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScreenHeader title="Account" />
      <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
        {user ? (
          <View style={styles.profile}>
            <Avatar name={user.displayName} seed={user.id} size={64} />
            <View style={{ flex: 1, gap: 3 }}>
              <T v="heading" numberOfLines={1}>{user.displayName || 'Member'}</T>
              <T v="small" color="secondary" numberOfLines={1}>@{handleFor(user.displayName)} · {user.email}</T>
              <View style={{ flexDirection: 'row', gap: 6, marginTop: 4 }}>
                <Chip label={ROLE_LABEL[user.role] ?? user.role} color={brand.purpleStart} icon={isAdmin ? 'shield' : 'person'} />
                {profile.data ? <Chip label={`${profile.data.reports.length}${profile.data.reports.length === 20 ? '+' : ''} posts`} color={brand.blue} /> : null}
              </View>
            </View>
          </View>
        ) : (
          <View style={[styles.guest, { backgroundColor: colors.accentSoft }]}>
            <T v="heading">You're browsing as a guest</T>
            <T v="body" color="secondary">Join to post problems, upvote, comment and get alerts when things change.</T>
            <View style={{ flexDirection: 'row', gap: 10, marginTop: 6 }}>
              <Button title="Sign in" style={{ flex: 1 }} onPress={() => router.push('/auth/login')} />
              <Button title="Create account" variant="secondary" style={{ flex: 1 }} onPress={() => router.push('/auth/signup')} />
            </View>
          </View>
        )}

        {isAdmin ? (
          <View style={[styles.note, { backgroundColor: tint(brand.yellow, 0.12), borderColor: tint(brand.yellow, 0.35) }]}>
            <Icon name="information-circle" size={20} color={brand.yellow} />
            <T v="small" color="body" style={{ flex: 1 }}>
              Review queues, user approvals and other admin tools are on the web. Open{' '}
              <T v="smallStrong" color="accent" onPress={() => WebBrowser.openBrowserAsync(webUrl('/dashboard/review'))}>
                {API_BASE_URL.replace(/^https?:\/\//, '')}
              </T>{' '}
              in your browser.
            </T>
          </View>
        ) : null}

        <SectionTitle>Appearance</SectionTitle>
        <AppearanceSwitch />

        {user ? (
          <>
            <SectionTitle>You</SectionTitle>
            <Row icon="document-text-outline" label="My posts" onPress={() => router.push({ pathname: '/user/[id]', params: { id: user.id } })} />
            <Row icon="stats-chart-outline" label="Analytics" onPress={() => router.push('/analytics')} />
            <Row
              icon="mail-outline"
              label="Email notifications"
              right={
                <Switch
                  value={user.emailNotifications ?? true}
                  onValueChange={(v) => emailPref.mutate(v)}
                  trackColor={{ true: brand.purpleStart, false: colors.borderStrong }}
                  thumbColor="#fff"
                  accessibilityLabel="Email notifications"
                />
              }
            />
          </>
        ) : null}

        <SectionTitle>FixMyDistrict</SectionTitle>
        <Row icon="shield-checkmark-outline" label="Code of Ethics" onPress={() => router.push('/ethics')} />
        <Row icon="heart-outline" label="Donate" hint="Opens in your browser" onPress={() => WebBrowser.openBrowserAsync(webUrl('/donate'))} />
        <Row icon="globe-outline" label="Open the website" onPress={() => WebBrowser.openBrowserAsync(webUrl('/dashboard'))} />

        {user ? (
          <View style={{ paddingHorizontal: 16, marginTop: 24 }}>
            <Button title="Log out" variant="danger" icon="log-out-outline" onPress={confirmLogout} />
          </View>
        ) : null}

        <T v="small" color="tertiary" style={{ textAlign: 'center', marginTop: 24 }}>
          FixMyDistrict {Constants.expoConfig?.version ?? ''} · {API_BASE_URL.replace(/^https?:\/\//, '')}
        </T>
      </ScrollView>
    </View>
  );
}

function AppearanceSwitch() {
  const { colors, preference, setPreference } = useTheme();
  const options: { v: ThemePreference; label: string; icon: IconName }[] = [
    { v: 'system', label: 'System', icon: 'phone-portrait-outline' },
    { v: 'light', label: 'Light', icon: 'sunny-outline' },
    { v: 'dark', label: 'Dark', icon: 'moon-outline' },
  ];
  return (
    <View style={[styles.segmented, { backgroundColor: colors.bgTertiary }]} accessibilityRole="radiogroup">
      {options.map((o) => {
        const active = preference === o.v;
        return (
          <Pressable
            key={o.v}
            onPress={() => setPreference(o.v)}
            accessibilityRole="radio"
            accessibilityState={{ checked: active }}
            accessibilityLabel={`${o.label} appearance`}
            style={[styles.segment, active && { backgroundColor: colors.bgElevated, shadowOpacity: 0.12 }]}
          >
            <Icon name={o.icon} size={16} color={active ? colors.accentText : colors.textSecondary} />
            <T v="smallStrong" color={active ? 'primary' : 'secondary'}>{o.label}</T>
          </Pressable>
        );
      })}
    </View>
  );
}

function Row({ icon, label, hint, onPress, right }: { icon: IconName; label: string; hint?: string; onPress?: () => void; right?: React.ReactNode }) {
  const { colors } = useTheme();
  return (
    <>
      <Pressable
        onPress={onPress}
        disabled={!onPress}
        accessibilityRole={onPress ? 'button' : undefined}
        accessibilityLabel={label}
        style={({ pressed }) => [styles.row, pressed && { backgroundColor: colors.bgSecondary }]}
      >
        <View style={[styles.rowIcon, { backgroundColor: colors.bgTertiary }]}>
          <Icon name={icon} size={18} color={colors.text} />
        </View>
        <View style={{ flex: 1 }}>
          <T v="body" style={{ fontWeight: '500' }}>{label}</T>
          {hint ? <T v="small" color="tertiary">{hint}</T> : null}
        </View>
        {right ?? (onPress ? <Icon name="chevron-forward" size={18} color={colors.textTertiary} /> : null)}
      </Pressable>
      <Divider inset={62} />
    </>
  );
}

const styles = StyleSheet.create({
  profile: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 16 },
  guest: { margin: 16, padding: 16, borderRadius: radius.lg, gap: 6 },
  note: { flexDirection: 'row', gap: 10, marginHorizontal: 16, padding: 12, borderRadius: radius.md, borderWidth: 1, alignItems: 'flex-start' },
  segmented: { flexDirection: 'row', marginHorizontal: 16, borderRadius: radius.md, padding: 3 },
  segment: {
    flex: 1,
    flexDirection: 'row',
    gap: 6,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 40,
    borderRadius: 10,
    shadowColor: '#000',
    shadowOpacity: 0,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 16, minHeight: 54 },
  rowIcon: { width: 32, height: 32, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
});
