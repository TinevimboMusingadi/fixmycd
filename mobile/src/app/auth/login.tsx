import React, { useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, type TextInputInstance, View } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '@/lib/auth';
import { ApiError } from '@/lib/api';
import { haptic } from '@/lib/hooks';
import { useCloseAuth } from '@/lib/nav';
import { rememberPendingCredentials } from '@/lib/pendingCredentials';
import { brand, tint, useTheme } from '@/theme';
import { Button, Field, Icon, T } from '@/components/ui';
import { toast } from '@/components/Toast';

export default function Login() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { login } = useAuth();
  const closeAuth = useCloseAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pwRef = useRef<TextInputInstance>(null);

  const submit = async () => {
    if (!email.trim() || !password) {
      setError('Enter your email and password');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const u = await login(email, password);
      haptic.success();
      toast(`Welcome back${u.displayName ? `, ${u.displayName.split(' ')[0]}` : ''}`);
      closeAuth();
    } catch (e) {
      haptic.error();
      const err = e as ApiError;
      if (err.status === 403 && /pending/i.test(err.message)) {
        rememberPendingCredentials(email.trim(), password);
        router.push({ pathname: '/auth/pending', params: { email: email.trim() } });
        return;
      }
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={{ padding: 24, gap: 16, paddingBottom: insets.bottom + 24 }} keyboardShouldPersistTaps="handled">
        <View style={{ gap: 6, marginBottom: 6 }}>
          <T v="title" style={{ fontSize: 28 }} accessibilityRole="header">Sign in</T>
          <T v="body" color="secondary">Welcome back to FixMyDistrict.</T>
        </View>
        <Field
          label="Email"
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          autoComplete="email"
          keyboardType="email-address"
          textContentType="username"
          returnKeyType="next"
          onSubmitEditing={() => pwRef.current?.focus()}
          placeholder="you@example.com"
        />
        <View>
          <Field
            ref={pwRef}
            label="Password"
            value={password}
            onChangeText={setPassword}
            secureTextEntry={!show}
            autoComplete="current-password"
            textContentType="password"
            returnKeyType="go"
            onSubmitEditing={submit}
            placeholder="Your password"
            style={{ paddingRight: 52 }}
          />
          <Pressable
            onPress={() => setShow((s) => !s)}
            accessibilityRole="button"
            accessibilityLabel={show ? 'Hide password' : 'Show password'}
            style={{ position: 'absolute', right: 2, top: 24, width: 48, height: 48, alignItems: 'center', justifyContent: 'center' }}
          >
            <Icon name={show ? 'eye-off-outline' : 'eye-outline'} size={20} color={colors.textSecondary} />
          </Pressable>
        </View>
        {error ? (
          <View style={{ flexDirection: 'row', gap: 8, padding: 12, borderRadius: 12, backgroundColor: tint(brand.red, 0.08) }} accessibilityLiveRegion="polite">
            <Icon name="alert-circle" size={18} color={brand.red} />
            <T v="small" color="danger" style={{ flex: 1 }}>{error}</T>
          </View>
        ) : null}
        <Button title="Sign in" size="lg" onPress={submit} loading={busy} style={{ marginTop: 4 }} />
        <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 4, marginTop: 4 }}>
          <T v="body" color="secondary">New here?</T>
          <T v="bodyStrong" color="accent" onPress={() => router.replace('/auth/signup')} accessibilityRole="link">
            Create an account
          </T>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
