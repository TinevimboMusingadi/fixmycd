import React, { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { api, ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { haptic } from '@/lib/hooks';
import { useCloseAuth } from '@/lib/nav';
import { clearPendingCredentials, takePendingCredentials } from '@/lib/pendingCredentials';
import { brand, radius, tint, useTheme } from '@/theme';
import { Button, Card, Field, Icon, T } from '@/components/ui';
import { toast } from '@/components/Toast';

const TEST_CARD = '4242 4242 4242 4242';

function formatCard(v: string) {
  return v.replace(/\D/g, '').slice(0, 19).replace(/(\d{4})(?=\d)/g, '$1 ');
}
function formatExpiry(v: string) {
  const d = v.replace(/\D/g, '').slice(0, 4);
  return d.length > 2 ? `${d.slice(0, 2)}/${d.slice(2)}` : d;
}

export default function Pending() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ email?: string; fresh?: string }>();
  const { refresh } = useAuth();
  const closeAuth = useCloseAuth();
  const remembered = takePendingCredentials();

  const [showVerify, setShowVerify] = useState(false);
  const [email, setEmail] = useState(remembered?.email ?? params.email ?? '');
  const [password, setPassword] = useState(remembered?.password ?? '');
  const [number, setNumber] = useState('');
  const [expiry, setExpiry] = useState('');
  const [cvc, setCvc] = useState('');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});

  const verify = async () => {
    setBusy(true);
    setError(null);
    setFields({});
    try {
      await api.verify({ email: email.trim(), password, card: { number, expiry, cvc, name } });
      clearPendingCredentials();
      haptic.success();
      await refresh();
      toast("You're verified — welcome to FixMyDistrict!");
      closeAuth();
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
        <View style={[styles.hero, { backgroundColor: tint(brand.yellow, 0.15) }]}>
          <Icon name="hourglass-outline" size={30} color={brand.yellow} />
        </View>
        <T v="title" style={{ fontSize: 26 }} accessibilityRole="header">
          {params.fresh ? "You're almost in" : 'Your account is pending'}
        </T>
        <T v="body" color="secondary" style={{ fontSize: 16, lineHeight: 22 }}>
          {params.fresh ? 'Thanks for signing up! ' : ''}An admin reviews new accounts to keep FixMyDistrict trustworthy. You can browse posts while you wait, and
          sign in once you're approved.
        </T>

        <Card style={{ gap: 10 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <Icon name="flash" size={20} color={colors.accentText} />
            <T v="bodyStrong" style={{ flex: 1 }}>Skip the wait with a $1 check</T>
            <View style={[styles.demo, { backgroundColor: tint(brand.yellow, 0.18) }]}>
              <T v="tiny" color="#ca8a04">DEMO</T>
            </View>
          </View>
          <T v="small" color="secondary">
            A one-time $1 card check proves you're a real person and activates your account instantly.{' '}
            <T v="smallStrong" color="body">Demo — no real charge.</T> Use the test card {TEST_CARD}.
          </T>
          {!showVerify ? (
            <Button title="Verify for $1" icon="card-outline" onPress={() => setShowVerify(true)} />
          ) : null}
        </Card>

        {showVerify ? (
          <View style={{ gap: 14 }}>
            <Field label="Email" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" autoComplete="email" />
            <Field label="Password" value={password} onChangeText={setPassword} secureTextEntry autoComplete="current-password" hint="Confirms the account is yours" />
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <T v="smallStrong" color="secondary">Card (Demo — no real charge)</T>
              <Pressable
                onPress={() => {
                  setNumber(TEST_CARD);
                  setExpiry('12/30');
                  setCvc('123');
                  if (!name) setName('Test User');
                }}
                accessibilityRole="button"
                style={{ minHeight: 36, justifyContent: 'center' }}
              >
                <T v="smallStrong" color="accent">Use test card</T>
              </Pressable>
            </View>
            <Field
              label="Card number"
              value={number}
              onChangeText={(v) => setNumber(formatCard(v))}
              keyboardType="number-pad"
              placeholder={TEST_CARD}
              autoComplete="cc-number"
              error={fields.number}
            />
            <View style={{ flexDirection: 'row', gap: 12 }}>
              <View style={{ flex: 1 }}>
                <Field label="Expiry" value={expiry} onChangeText={(v) => setExpiry(formatExpiry(v))} keyboardType="number-pad" placeholder="MM/YY" error={fields.expiry} />
              </View>
              <View style={{ flex: 1 }}>
                <Field label="CVC" value={cvc} onChangeText={(v) => setCvc(v.replace(/\D/g, '').slice(0, 4))} keyboardType="number-pad" placeholder="123" error={fields.cvc} />
              </View>
            </View>
            <Field label="Name on card" value={name} onChangeText={setName} autoComplete="cc-name" error={fields.name} />
            {error ? (
              <View style={{ flexDirection: 'row', gap: 8, padding: 12, borderRadius: 12, backgroundColor: tint(brand.red, 0.08) }} accessibilityLiveRegion="polite">
                <Icon name="alert-circle" size={18} color={brand.red} />
                <T v="small" color="danger" style={{ flex: 1 }}>{error}</T>
              </View>
            ) : null}
            <Button title="Pay $1 and verify (demo)" size="lg" onPress={verify} loading={busy} disabled={!email || !password || !number || !expiry || !cvc || !name} />
          </View>
        ) : null}

        <Button title="Keep browsing" variant="secondary" onPress={closeAuth} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  hero: { width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center' },
  demo: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.full },
});
