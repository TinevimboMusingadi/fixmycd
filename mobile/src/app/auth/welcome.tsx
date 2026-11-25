import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { brand, tint, useTheme } from '@/theme';
import { Button, Icon, type IconName, IconButton, T } from '@/components/ui';

const POINTS: { icon: IconName; title: string; body: string }[] = [
  { icon: 'camera-outline', title: 'Post what you see', body: 'Potholes, outages, broken lights — pinned on the map with a photo.' },
  { icon: 'arrow-up-circle-outline', title: 'Upvote what matters', body: 'Neighbours push the most urgent problems to the top.' },
  { icon: 'shield-checkmark-outline', title: 'Experts weigh in', body: 'Referees endorse severity so agencies know where to act.' },
];

export default function Welcome() {
  const { colors, scheme } = useTheme();
  const insets = useSafeAreaInsets();
  const closeToFeed = () => (router.canGoBack() ? router.back() : router.replace('/'));
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <LinearGradient
        colors={scheme === 'dark' ? [tint(brand.purpleEnd, 0.45), 'transparent'] : [tint(brand.purpleStart, 0.22), 'transparent']}
        style={StyleSheet.absoluteFill}
        start={{ x: 0, y: 0 }}
        end={{ x: 0.4, y: 0.55 }}
      />
      <View style={{ paddingTop: insets.top + 4, paddingHorizontal: 6, flexDirection: 'row', justifyContent: 'flex-end' }}>
        <IconButton name="close" label="Close" onPress={closeToFeed} />
      </View>
      <View style={styles.body}>
        <Image source={require('../../../assets/splash-icon.png')} style={styles.logo} accessibilityLabel="FixMyDistrict logo" />
        <T v="title" style={styles.headline} accessibilityRole="header">
          Fix your district,{'\n'}together.
        </T>
        <T v="body" color="secondary" style={{ fontSize: 16, lineHeight: 22 }}>
          Report broken infrastructure, follow it to resolution, and see what's happening around you.
        </T>
        <View style={{ gap: 16, marginTop: 28 }}>
          {POINTS.map((p) => (
            <View key={p.title} style={{ flexDirection: 'row', gap: 14, alignItems: 'flex-start' }}>
              <View style={[styles.pointIcon, { backgroundColor: colors.accentSoft }]}>
                <Icon name={p.icon} size={20} color={colors.accentText} />
              </View>
              <View style={{ flex: 1 }}>
                <T v="bodyStrong">{p.title}</T>
                <T v="small" color="secondary">{p.body}</T>
              </View>
            </View>
          ))}
        </View>
      </View>
      <View style={[styles.actions, { paddingBottom: insets.bottom + 16 }]}>
        <Button title="Create account" size="lg" onPress={() => router.push('/auth/signup')} />
        <Button title="Sign in" size="lg" variant="secondary" onPress={() => router.push('/auth/login')} />
        <Pressable onPress={closeToFeed} accessibilityRole="button" style={styles.guest}>
          <T v="smallStrong" color="secondary">Browse as a guest</T>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  body: { flex: 1, paddingHorizontal: 24, paddingTop: 8 },
  logo: { width: 56, height: 56, marginBottom: 22 },
  headline: { fontSize: 32, lineHeight: 36, letterSpacing: -0.8, marginBottom: 10 },
  pointIcon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  actions: { paddingHorizontal: 24, gap: 10 },
  guest: { alignItems: 'center', justifyContent: 'center', minHeight: 44 },
});
