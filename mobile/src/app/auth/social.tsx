import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Linking, Platform, Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth as useClerkAuth, useUser } from '@clerk/expo';
import { api, ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { webUrl } from '@/lib/config';
import { haptic } from '@/lib/hooks';
import { useCloseAuth } from '@/lib/nav';
import { brand, tint, useTheme } from '@/theme';
import { Button, Card, Field, Icon, T } from '@/components/ui';
import { toast } from '@/components/Toast';

type Step =
  | { kind: 'working' }
  | { kind: 'needs_ethics' }
  | { kind: 'needs_phone' }
  | { kind: 'pending'; canVerifyByCard: boolean }
  | { kind: 'error'; message: string };

/**
 * After Google / LinkedIn / Facebook (through Clerk): swap the Clerk sign-in for a FixMyDistrict
 * session. New people agree to the Code of Ethics, confirm a phone number by SMS, then verify
 * ($1 demo check) or wait for an admin. The Clerk session is ended once ours exists.
 */
export default function SocialComplete() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { isLoaded, isSignedIn, getToken, signOut } = useClerkAuth();
  const { user } = useUser();
  const { refresh } = useAuth();
  const closeAuth = useCloseAuth();
  const [step, setStep] = useState<Step>({ kind: 'working' });
  const started = useRef(false);

  const finish = useCallback(async () => {
    await signOut().catch(() => {});
    haptic.success();
    await refresh();
    toast('Welcome to FixMyDistrict!');
    closeAuth();
  }, [signOut, refresh, closeAuth]);

  const exchange = useCallback(
    async (extra: { acceptEthics?: boolean; displayName?: string } = {}) => {
      setStep({ kind: 'working' });
      try {
        const token = await getToken();
        if (!token) throw new Error('Your sign-in expired. Please try again.');
        const r = await api.clerkExchange({ token, ...extra });
        if (r.status === 'signed_in') return finish();
        if (r.status === 'pending') return setStep({ kind: 'pending', canVerifyByCard: r.canVerifyByCard });
        setStep({ kind: r.status });
      } catch (e) {
        setStep({ kind: 'error', message: (e as Error).message });
      }
    },
    [getToken, finish]
  );

  useEffect(() => {
    if (!isLoaded || started.current) return;
    started.current = true;
    if (!isSignedIn) setStep({ kind: 'error', message: 'Sign-in was cancelled.' });
    else exchange();
  }, [isLoaded, isSignedIn, exchange]);

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={{ padding: 24, gap: 16, paddingBottom: insets.bottom + 24 }} keyboardShouldPersistTaps="handled">
        {step.kind === 'working' ? (
          <View style={{ paddingTop: 60, alignItems: 'center', gap: 12 }}>
            <ActivityIndicator color={brand.purpleStart} />
            <T v="body" color="secondary">Signing you in…</T>
          </View>
        ) : step.kind === 'error' ? (
          <>
            <T v="title" accessibilityRole="header">Something went wrong</T>
            <T v="body" color="danger">{step.message}</T>
            <Button title="Back" variant="secondary" onPress={closeAuth} />
          </>
        ) : step.kind === 'needs_ethics' ? (
          <EthicsStep defaultName={user?.fullName ?? ''} onAgree={(displayName) => exchange({ acceptEthics: true, displayName })} />
        ) : step.kind === 'needs_phone' ? (
          <PhoneStep onVerified={() => exchange()} />
        ) : (
          <PendingStep canVerifyByCard={step.canVerifyByCard} getToken={getToken} onVerified={finish} />
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function EthicsStep({ defaultName, onAgree }: { defaultName: string; onAgree: (name: string) => void }) {
  const { colors } = useTheme();
  const [name, setName] = useState(defaultName);
  const [agreed, setAgreed] = useState(false);
  return (
    <>
      <T v="title" accessibilityRole="header">Welcome to FixMyDistrict</T>
      <T v="body" color="secondary">One step before your account is created.</T>
      <Field label="Your name" value={name} onChangeText={setName} autoComplete="name" maxLength={80} />
      <Pressable
        accessibilityRole="checkbox"
        accessibilityState={{ checked: agreed }}
        onPress={() => setAgreed((a) => !a)}
        style={{ flexDirection: 'row', gap: 12, alignItems: 'flex-start', paddingVertical: 6 }}
      >
        <Icon name={agreed ? 'checkbox' : 'square-outline'} size={24} color={agreed ? brand.purpleStart : colors.textSecondary} />
        <T v="body" style={{ flex: 1 }}>
          I agree to the{' '}
          <T v="bodyStrong" color="accent" onPress={() => Linking.openURL(webUrl('/ethics'))}>Code of Ethics</T>: honest posts about
          real places, respect for others, and no fake or AI-made evidence.
        </T>
      </Pressable>
      <Button title="Create my account" size="lg" disabled={!agreed || !name.trim()} onPress={() => onAgree(name.trim())} />
    </>
  );
}

/** Adds and verifies a phone number on the Clerk account (Clerk sends the SMS). */
function PhoneStep({ onVerified }: { onVerified: () => void }) {
  const { user } = useUser();
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const phoneId = useRef<string | null>(null);

  const message = (e: unknown) =>
    (e as { errors?: { longMessage?: string; message?: string }[] })?.errors?.[0]?.longMessage ??
    (e as Error)?.message ??
    'That didn’t work. Check the number and try again.';

  const send = async () => {
    if (!user) return;
    setBusy(true);
    setError(null);
    try {
      const existing = user.phoneNumbers.find((p) => p.phoneNumber === phone.trim());
      const p = existing ?? (await user.createPhoneNumber({ phoneNumber: phone.trim() }));
      await p.prepareVerification();
      phoneId.current = p.id;
      setSentTo(p.phoneNumber);
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  };

  const verify = async () => {
    if (!user || !phoneId.current) return;
    setBusy(true);
    setError(null);
    try {
      const p = user.phoneNumbers.find((x) => x.id === phoneId.current);
      if (!p) throw new Error('Start again with your number.');
      const res = await p.attemptVerification({ code: code.trim() });
      if (res.verification.status !== 'verified') throw new Error('That code didn’t match.');
      await user.reload();
      onVerified();
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <T v="title" accessibilityRole="header">Confirm your phone</T>
      <T v="body" color="secondary">We text a code to make sure each account is a real person. Your number is never shown in the app.</T>
      {!sentTo ? (
        <>
          <Field label="Mobile number (with country code)" value={phone} onChangeText={setPhone} keyboardType="phone-pad" autoComplete="tel" placeholder="+1 555 123 4567" />
          <Button title="Text me a code" size="lg" loading={busy} disabled={phone.trim().length < 7} onPress={send} />
        </>
      ) : (
        <>
          <Field label={`Code sent to ${sentTo}`} value={code} onChangeText={setCode} keyboardType="number-pad" autoComplete="sms-otp" maxLength={8} />
          <Button title="Verify" size="lg" loading={busy} disabled={code.trim().length < 4} onPress={verify} />
          <Button title="Use a different number" variant="secondary" onPress={() => { setSentTo(null); setCode(''); }} />
        </>
      )}
      {error ? <T v="small" color="danger">{error}</T> : null}
    </>
  );
}

function PendingStep({ canVerifyByCard, getToken, onVerified }: { canVerifyByCard: boolean; getToken: () => Promise<string | null>; onVerified: () => void }) {
  const [number, setNumber] = useState('');
  const [expiry, setExpiry] = useState('');
  const [cvc, setCvc] = useState('');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pay = async () => {
    setBusy(true);
    setError(null);
    try {
      const clerkToken = await getToken();
      if (!clerkToken) throw new Error('Your sign-in expired. Please try again.');
      await api.verify({ clerkToken, card: { number, expiry, cvc, name } });
      onVerified();
    } catch (e) {
      haptic.error();
      setError((e as ApiError).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <View style={{ width: 56, height: 56, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: tint(brand.yellow, 0.15) }}>
        <Icon name="hourglass-outline" size={28} color={brand.yellow} />
      </View>
      <T v="title" accessibilityRole="header">Almost there</T>
      <T v="body" color="secondary">
        Every account is verified before it can post, so FixMyDistrict stays real people reporting real problems.
        {canVerifyByCard ? ' Verify now with a $1 check, or wait for an admin to approve you.' : ' An admin will review your account; you’ll get an email.'}
      </T>
      {canVerifyByCard ? (
        <Card style={{ gap: 12 }}>
          <T v="bodyStrong">$1 check · Demo — no real charge</T>
          <Pressable onPress={() => { setNumber('4242 4242 4242 4242'); setExpiry('12/30'); setCvc('123'); if (!name) setName('Test User'); }} accessibilityRole="button">
            <T v="smallStrong" color="accent">Use test card</T>
          </Pressable>
          <Field label="Card number" value={number} onChangeText={(v) => setNumber(v.replace(/\D/g, '').slice(0, 19).replace(/(\d{4})(?=\d)/g, '$1 '))} keyboardType="number-pad" autoComplete="cc-number" />
          <View style={{ flexDirection: 'row', gap: 12 }}>
            <View style={{ flex: 1 }}><Field label="Expiry" value={expiry} onChangeText={(v) => { const d = v.replace(/\D/g, '').slice(0, 4); setExpiry(d.length > 2 ? `${d.slice(0, 2)}/${d.slice(2)}` : d); }} keyboardType="number-pad" placeholder="MM/YY" /></View>
            <View style={{ flex: 1 }}><Field label="CVC" value={cvc} onChangeText={(v) => setCvc(v.replace(/\D/g, '').slice(0, 4))} keyboardType="number-pad" /></View>
          </View>
          <Field label="Name on card" value={name} onChangeText={setName} autoComplete="cc-name" />
          {error ? <T v="small" color="danger">{error}</T> : null}
          <Button title="Pay $1 and verify (demo)" loading={busy} disabled={!number || !expiry || !cvc || !name} onPress={pay} />
        </Card>
      ) : null}
    </>
  );
}
