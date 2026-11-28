'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useAuth, useUser } from '@clerk/nextjs';
import { DemoCheckout, postPayment } from '@/components/DemoCheckout';

type Step =
  | { kind: 'working' }
  | { kind: 'needs_ethics' }
  | { kind: 'needs_phone' }
  | { kind: 'pending'; canVerifyByCard: boolean }
  | { kind: 'error'; message: string };

/**
 * After Clerk has signed someone in: swap the Clerk session for a FixMyDistrict one
 * (/api/auth/clerk), walking new people through the Code of Ethics, an SMS phone check and
 * account verification first. The Clerk session is ended once ours exists.
 */
export default function CompletePage() {
  const { isLoaded, isSignedIn, getToken, signOut } = useAuth();
  const { user } = useUser();
  const [step, setStep] = useState<Step>({ kind: 'working' });
  const started = useRef(false);

  const finish = useCallback(async () => {
    // Our own session now exists; Clerk's isn't needed any more.
    await signOut().catch(() => {});
    window.location.replace('/dashboard');
  }, [signOut]);

  const exchange = useCallback(
    async (extra: { acceptEthics?: boolean; displayName?: string } = {}) => {
      setStep({ kind: 'working' });
      try {
        const token = await getToken();
        if (!token) throw new Error('Your sign-in expired. Please try again.');
        const res = await fetch('/api/auth/clerk', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token, ...extra }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || 'Sign-in failed. Please try again.');
        if (data.status === 'signed_in') return finish();
        if (data.status === 'needs_ethics') return setStep({ kind: 'needs_ethics' });
        if (data.status === 'needs_phone') return setStep({ kind: 'needs_phone' });
        if (data.status === 'pending') return setStep({ kind: 'pending', canVerifyByCard: !!data.canVerifyByCard });
        throw new Error('Unexpected answer from the server.');
      } catch (e) {
        setStep({ kind: 'error', message: e instanceof Error ? e.message : 'Sign-in failed.' });
      }
    },
    [getToken, finish]
  );

  useEffect(() => {
    if (!isLoaded || started.current) return;
    started.current = true;
    if (!isSignedIn) window.location.replace('/auth/continue');
    // Deferred so the exchange's state updates don't run inside this effect.
    else queueMicrotask(() => void exchange());
  }, [isLoaded, isSignedIn, exchange]);

  if (step.kind === 'working') return <p className="auth-subtitle">Signing you in…</p>;

  if (step.kind === 'error') {
    return (
      <>
        <h2>Something went wrong</h2>
        <div className="auth-error" role="alert">{step.message}</div>
        <Link href="/auth/continue" className="btn-primary">Try again</Link>
      </>
    );
  }

  if (step.kind === 'needs_ethics') return <EthicsStep defaultName={user?.fullName ?? ''} onAgree={(displayName) => exchange({ acceptEthics: true, displayName })} />;

  if (step.kind === 'needs_phone') return <PhoneStep onVerified={() => exchange()} />;

  return (
    <>
      <h2>Almost there</h2>
      <p className="auth-subtitle">
        Every account is verified before it can post, so FixMyDistrict stays real people reporting real problems.
        {step.canVerifyByCard ? ' Verify now with a $1 check, or wait for an admin to approve you.' : ' An admin will review your account; we’ll email you.'}
      </p>
      {step.canVerifyByCard && (
        <DemoCheckout
          amountCents={100}
          buttonLabel="Verify with $1"
          onPay={async (card) => {
            const clerkToken = await getToken();
            const result = await postPayment('/api/verify', { clerkToken, card });
            if (result.ok) await finish();
            return result;
          }}
        />
      )}
      <p className="auth-footer"><Link href="/">Back to home</Link></p>
    </>
  );
}

function EthicsStep({ defaultName, onAgree }: { defaultName: string; onAgree: (displayName: string) => void }) {
  const [name, setName] = useState(defaultName);
  const [agreed, setAgreed] = useState(false);
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (agreed && name.trim()) onAgree(name.trim());
      }}
    >
      <h2>Welcome to FixMyDistrict</h2>
      <p className="auth-subtitle">One step before your account is created.</p>
      <div className="form-group">
        <label htmlFor="display-name">Your name</label>
        <input id="display-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} required autoComplete="name" />
      </div>
      <label className="filter-checkbox ethics-agree">
        <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} />
        <span>
          I agree to the <Link href="/ethics" target="_blank">Code of Ethics</Link>: honest posts about real places, respect for others, and no fake or AI-made evidence.
        </span>
      </label>
      <button type="submit" className="btn-primary auth-btn" disabled={!agreed || !name.trim()}>Create my account</button>
    </form>
  );
}

/** Adds and verifies a phone number on the Clerk account (Clerk sends the SMS code). */
function PhoneStep({ onVerified }: { onVerified: () => void }) {
  const { user } = useUser();
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const phoneId = useRef<string | null>(null);

  const clerkError = (e: unknown) =>
    (e as { errors?: { longMessage?: string; message?: string }[] })?.errors?.[0]?.longMessage ??
    (e as { errors?: { message?: string }[] })?.errors?.[0]?.message ??
    (e instanceof Error ? e.message : 'That didn’t work. Check the number and try again.');

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setBusy(true);
    setError(null);
    try {
      const existing = user.phoneNumbers.find((p) => p.phoneNumber === phone.trim());
      const p = existing ?? (await user.createPhoneNumber({ phoneNumber: phone.trim() }));
      await p.prepareVerification();
      phoneId.current = p.id;
      setSentTo(p.phoneNumber);
    } catch (err) {
      setError(clerkError(err));
    } finally {
      setBusy(false);
    }
  };

  const verify = async (e: React.FormEvent) => {
    e.preventDefault();
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
    } catch (err) {
      setError(clerkError(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <h2>Confirm your phone</h2>
      <p className="auth-subtitle">
        We text a code to make sure each account is a real person. Your number is never shown on the site.
      </p>
      {error && <div className="auth-error" role="alert">{error}</div>}
      {!sentTo ? (
        <form onSubmit={send}>
          <div className="form-group">
            <label htmlFor="phone">Mobile number (with country code)</label>
            <input id="phone" type="tel" inputMode="tel" autoComplete="tel" placeholder="+1 555 123 4567" value={phone} onChange={(e) => setPhone(e.target.value)} required />
          </div>
          <button type="submit" className="btn-primary auth-btn" disabled={busy || phone.trim().length < 7}>{busy ? 'Sending…' : 'Text me a code'}</button>
        </form>
      ) : (
        <form onSubmit={verify}>
          <div className="form-group">
            <label htmlFor="code">Code sent to {sentTo}</label>
            <input id="code" inputMode="numeric" autoComplete="one-time-code" value={code} onChange={(e) => setCode(e.target.value)} maxLength={8} required />
          </div>
          <button type="submit" className="btn-primary auth-btn" disabled={busy || code.trim().length < 4}>{busy ? 'Checking…' : 'Verify'}</button>
          <button type="button" className="btn-secondary auth-btn" onClick={() => { setSentTo(null); setCode(''); }}>Use a different number</button>
        </form>
      )}
    </>
  );
}
