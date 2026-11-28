'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { formatRelativeTime } from '@/lib/utils';

type Device = { id: string; client: string; method: string | null; device: string | null; createdAt: string; lastSeenAt: string; current: boolean };

const METHOD: Record<string, string> = {
  password: 'password',
  card_demo: '$1 verification',
  'clerk:google': 'Google',
  'clerk:linkedin_oidc': 'LinkedIn',
  'clerk:linkedin': 'LinkedIn',
  'clerk:facebook': 'Facebook',
  'clerk:email': 'email code',
};

/** Where this account is signed in, with sign-out per device or everywhere else. */
export function SignedInDevices() {
  const [devices, setDevices] = useState<Device[] | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    fetch('/api/auth/sessions')
      .then((r) => (r.ok ? r.json() : []))
      .then(setDevices)
      .catch(() => setDevices([]));
  }, []);
  useEffect(load, [load]);

  const remove = async (body: { id: string } | { others: true }) => {
    setBusy(true);
    await fetch('/api/auth/sessions', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    setBusy(false);
    load();
  };

  return (
    <section className="profile-appearance" aria-labelledby="devices-heading">
      <h3 id="devices-heading">Signed-in devices</h3>
      <p>Sign out anything you don’t recognise. Sessions also end on their own after a few days without use.</p>
      {devices === null ? (
        <p>Loading…</p>
      ) : (
        <div className="devices-list">
          {devices.map((d) => (
            <div key={d.id} className="device-row">
              <div>
                <strong>{d.device || (d.client === 'mobile' ? 'FixMyDistrict app' : 'Browser')}</strong>
                {d.current && <span className="featured-chip" style={{ marginLeft: 8 }}>This device</span>}
                <small>
                  Signed in with {METHOD[d.method ?? 'password'] ?? d.method} · active {formatRelativeTime(d.lastSeenAt)}
                </small>
              </div>
              {!d.current && (
                <button className="btn-secondary btn-sm" disabled={busy} onClick={() => remove({ id: d.id })}>Sign out</button>
              )}
            </div>
          ))}
          {devices.filter((d) => !d.current).length > 0 && (
            <button className="btn-secondary btn-sm" disabled={busy} onClick={() => remove({ others: true })}>Sign out all other devices</button>
          )}
        </div>
      )}
    </section>
  );
}
