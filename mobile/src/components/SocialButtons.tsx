import React, { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import * as AuthSession from 'expo-auth-session';
import { useSSO } from '@clerk/expo';
import { Ionicons } from '@expo/vector-icons';
import { radius, useTheme } from '@/theme';
import { clerkEnabled } from '@/lib/clerk';
import { haptic } from '@/lib/hooks';
import { T } from './ui';
import { toast } from './Toast';

WebBrowser.maybeCompleteAuthSession();

type Strategy = 'oauth_google' | 'oauth_linkedin_oidc' | 'oauth_facebook';
const PROVIDERS: { strategy: Strategy; label: string; icon: React.ComponentProps<typeof Ionicons>['name']; color: string }[] = [
  { strategy: 'oauth_google', label: 'Continue with Google', icon: 'logo-google', color: '#EA4335' },
  { strategy: 'oauth_linkedin_oidc', label: 'Continue with LinkedIn', icon: 'logo-linkedin', color: '#0A66C2' },
  { strategy: 'oauth_facebook', label: 'Continue with Facebook', icon: 'logo-facebook', color: '#1877F2' },
];

/** Google / LinkedIn / Facebook through Clerk; renders nothing when Clerk isn't configured. */
export function SocialButtons() {
  if (!clerkEnabled) return null;
  return <SocialButtonsInner />;
}

function SocialButtonsInner() {
  const { colors } = useTheme();
  const { startSSOFlow } = useSSO();
  const [busy, setBusy] = useState<Strategy | null>(null);

  const start = async (strategy: Strategy) => {
    haptic.light();
    setBusy(strategy);
    try {
      const { createdSessionId, setActive } = await startSSOFlow({
        strategy,
        redirectUrl: AuthSession.makeRedirectUri({ scheme: 'fixmydistrict', path: 'sso-callback' }),
      });
      if (createdSessionId && setActive) {
        await setActive({ session: createdSessionId });
        router.push('/auth/social');
      }
    } catch (e) {
      toast((e as Error).message || 'Sign-in was cancelled');
    } finally {
      setBusy(null);
    }
  };

  return (
    <View style={{ gap: 10 }}>
      {PROVIDERS.map((p) => (
        <Pressable
          key={p.strategy}
          accessibilityRole="button"
          accessibilityLabel={p.label}
          disabled={!!busy}
          onPress={() => start(p.strategy)}
          style={({ pressed }) => [styles.btn, { borderColor: colors.border, backgroundColor: colors.bgElevated, opacity: pressed ? 0.85 : 1 }]}
        >
          {busy === p.strategy ? <ActivityIndicator color={p.color} /> : <Ionicons name={p.icon} size={20} color={p.color} />}
          <T v="bodyStrong">{p.label}</T>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  btn: { minHeight: 50, borderRadius: radius.full, borderWidth: StyleSheet.hairlineWidth, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 },
});
