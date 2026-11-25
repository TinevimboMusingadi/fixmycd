import React, { useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, type TextInputInstance, View } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { api, ApiError } from '@/lib/api';
import { haptic } from '@/lib/hooks';
import { rememberPendingCredentials } from '@/lib/pendingCredentials';
import { brand, radius, tint, useTheme } from '@/theme';
import { Button, Field, Icon, T } from '@/components/ui';

export default function Signup() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [agree, setAgree] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});
  const emailRef = useRef<TextInputInstance>(null);
  const pwRef = useRef<TextInputInstance>(null);

  const pwBytes = new TextEncoder().encode(password).length;
  const valid = name.trim().length > 0 && /\S+@\S+\.\S+/.test(email.trim()) && password.length >= 8 && pwBytes <= 72 && agree;

  const submit = async () => {
    if (!valid) {
      setError(!agree ? 'Please agree to the Code of Ethics to join' : 'Check the highlighted fields');
      return;
    }
    setBusy(true);
    setError(null);
    setFields({});
    try {
      await api.signup({ email: email.trim(), password, displayName: name.trim(), acceptEthics: true });
      haptic.success();
      rememberPendingCredentials(email.trim(), password);
      router.replace({ pathname: '/auth/pending', params: { email: email.trim(), fresh: '1' } });
    } catch (e) {
      haptic.error();
      const err = e as ApiError;
      setError(err.message);
      if (err.fields) setFields(err.fields);
    } finally {
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={{ padding: 24, gap: 16, paddingBottom: insets.bottom + 24 }} keyboardShouldPersistTaps="handled">
        <View style={{ gap: 6, marginBottom: 6 }}>
          <T v="title" style={{ fontSize: 28 }} accessibilityRole="header">Create your account</T>
          <T v="body" color="secondary">Join neighbours making the district better.</T>
        </View>
        <Field
          label="Display name"
          value={name}
          onChangeText={setName}
          autoComplete="name"
          textContentType="name"
          maxLength={80}
          returnKeyType="next"
          onSubmitEditing={() => emailRef.current?.focus()}
          placeholder="How others will see you"
          error={fields.displayName}
        />
        <Field
          ref={emailRef}
          label="Email"
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          autoComplete="email"
          keyboardType="email-address"
          textContentType="emailAddress"
          returnKeyType="next"
          onSubmitEditing={() => pwRef.current?.focus()}
          placeholder="you@example.com"
          error={fields.email}
        />
        <Field
          ref={pwRef}
          label="Password"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          autoComplete="new-password"
          textContentType="newPassword"
          placeholder="At least 8 characters"
          error={fields.password ?? (pwBytes > 72 ? 'Password must be at most 72 bytes' : null)}
          hint={password && password.length < 8 ? `${8 - password.length} more character${8 - password.length === 1 ? '' : 's'}` : 'At least 8 characters'}
        />

        <Pressable
          onPress={() => setAgree((a) => !a)}
          accessibilityRole="checkbox"
          accessibilityState={{ checked: agree }}
          accessibilityLabel="I agree to the FixMyDistrict Code of Ethics"
          style={[styles.agree, { borderColor: agree ? brand.purpleStart : colors.border, backgroundColor: agree ? colors.accentSoft : colors.bgSecondary }]}
        >
          <View style={[styles.box, { borderColor: agree ? brand.purpleStart : colors.borderStrong, backgroundColor: agree ? brand.purpleStart : 'transparent' }]}>
            {agree ? <Icon name="checkmark" size={16} color="#fff" /> : null}
          </View>
          <T v="small" color="body" style={{ flex: 1 }}>
            I agree to the{' '}
            <T v="smallStrong" color="accent" onPress={() => router.push('/ethics')}>Code of Ethics</T>: I'll be truthful, respectful and
            only post real problems I've seen.
          </T>
        </Pressable>

        {error ? (
          <View style={{ flexDirection: 'row', gap: 8, padding: 12, borderRadius: 12, backgroundColor: tint(brand.red, 0.08) }} accessibilityLiveRegion="polite">
            <Icon name="alert-circle" size={18} color={brand.red} />
            <T v="small" color="danger" style={{ flex: 1 }}>{error}</T>
          </View>
        ) : null}

        <Button title="Create account" size="lg" onPress={submit} loading={busy} disabled={!valid} />
        <T v="small" color="tertiary" style={{ textAlign: 'center' }}>
          New accounts are reviewed before they can post. You can skip the wait with a $1 identity check (demo).
        </T>
        <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 4 }}>
          <T v="body" color="secondary">Already have an account?</T>
          <T v="bodyStrong" color="accent" onPress={() => router.replace('/auth/login')} accessibilityRole="link">
            Sign in
          </T>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = {
  agree: { flexDirection: 'row' as const, gap: 12, padding: 14, borderRadius: radius.md, borderWidth: 1, alignItems: 'center' as const, minHeight: 56 },
  box: { width: 24, height: 24, borderRadius: 7, borderWidth: 2, alignItems: 'center' as const, justifyContent: 'center' as const },
};
