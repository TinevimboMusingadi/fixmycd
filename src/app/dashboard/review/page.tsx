'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { REPORT_STATUSES } from '../../../lib/categories';
import { MediaLabel } from '@/components/MediaIntegrity';
import { isAllowedMediaUrl } from '@/lib/media-url';

interface QueueReport {
  id: string;
  referenceNo: string;
  title: string;
  status: string;
  severity: number;
  createdAt: string;
  submitterName: string | null;
}

interface QueueFlag {
  id: string;
  targetType: string;
  targetId: string;
  reason: string;
}

interface MediaItem {
  id: string;
  reportId: string;
  mediaKind: string;
  verdict: string;
  score: number;
  detectors: string;
  title: string;
  referenceNo: string;
  imageUrl: string | null;
  videoUrl: string | null;
  isHidden: boolean;
  submitterName: string | null;
  strikes: number;
  signals: { id: string; weight: number; reason: string; conclusive: boolean }[];
  contentCredentials: { validation?: string; generator?: string } | null;
  capturedInApp: boolean;
}

type Tab = 'posts' | 'flags' | 'media';

const MEDIA_ACTIONS: { action: 'confirm_ai' | 'authentic' | 'recheck' | 'hide'; label: string; primary?: boolean }[] = [
  { action: 'confirm_ai', label: 'Confirm AI', primary: true },
  { action: 'authentic', label: 'Looks real' },
  { action: 'recheck', label: 'Re-check' },
  { action: 'hide', label: 'Hide post' },
];

export default function ReviewPage() {
  const [tab, setTab] = useState<Tab>('posts');
  const [reports, setReports] = useState<QueueReport[]>([]);
  const [flags, setFlags] = useState<QueueFlag[]>([]);
  const [media, setMedia] = useState<MediaItem[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const loadMedia = useCallback(() => {
    fetch('/api/review/media')
      .then((r) => (r.ok ? r.json() : []))
      .then((rows) => setMedia(Array.isArray(rows) ? rows : []))
      .catch(() => {});
  }, []);

  useEffect(() => {
    fetch('/api/review/queue')
      .then((r) => r.json())
      .then((data) => {
        setReports(data.reports || []);
        setFlags(data.flags || []);
      });
    loadMedia();
  }, [loadMedia]);

  const updateStatus = async (id: string, status: string) => {
    const reviewNote = status === 'resubmit' ? prompt('Note for submitter:') : undefined;
    await fetch(`/api/review/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status, reviewNote }),
    });
    setReports((prev) => prev.map((r) => (r.id === id ? { ...r, status } : r)));
  };

  const resolveFlag = async (id: string, status: 'accepted' | 'dismissed') => {
    setBusy(id);
    const res = await fetch(`/api/review/flags/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    });
    setBusy(null);
    if (res.ok) setFlags((prev) => prev.filter((f) => f.id !== id));
  };

  const decide = async (item: MediaItem, action: (typeof MEDIA_ACTIONS)[number]['action']) => {
    if (action === 'confirm_ai' && !confirm(`Confirm that "${item.title}" uses AI-generated media? The poster will be told and get a strike.`)) return;
    setBusy(item.id);
    setMessage(null);
    const res = await fetch(`/api/review/media/${item.id}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action }),
    });
    setBusy(null);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setMessage(data.error || 'That didn’t work. Try again.');
      return;
    }
    setMessage(
      action === 'recheck' ? `Re-checked: ${String(data.verdict).replace(/_/g, ' ')}` : action === 'hide' ? 'Post hidden.' : 'Saved.'
    );
    loadMedia();
  };

  return (
    <div>
      <div className="feed-header"><h2>Review Queue</h2></div>

      <div className="review-tabs" role="tablist" aria-label="Review sections">
        {([
          ['posts', `Posts`],
          ['flags', `Flags${flags.length ? ` (${flags.length})` : ''}`],
          ['media', `Media integrity${media.length ? ` (${media.length})` : ''}`],
        ] as [Tab, string][]).map(([key, label]) => (
          <button
            key={key}
            role="tab"
            aria-selected={tab === key}
            className={`btn-sm ${tab === key ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setTab(key)}
          >
            {label}
          </button>
        ))}
      </div>

      {message && <p className="review-message" role="status" style={{ padding: '8px 16px' }}>{message}</p>}

      {tab === 'flags' && (
        <section className="review-section">
          <h3>Pending flags</h3>
          {flags.length === 0 && <p className="report-ref">No open flags.</p>}
          {flags.map((f) => (
            <div key={f.id} className="review-item">
              <p>{f.targetType} · {f.reason}</p>
              {f.targetType === 'report' && <Link href={`/dashboard/reports/${f.targetId}`}>View post</Link>}
              <div className="review-actions">
                <button className="btn-sm btn-primary" disabled={busy === f.id} onClick={() => resolveFlag(f.id, 'accepted')}>Accept</button>
                <button className="btn-sm btn-secondary" disabled={busy === f.id} onClick={() => resolveFlag(f.id, 'dismissed')}>Dismiss</button>
              </div>
            </div>
          ))}
        </section>
      )}

      {tab === 'media' && (
        <section className="review-section">
          <h3>Possibly AI-generated media</h3>
          <p className="report-ref">
            Found by automatic checks (Content Credentials, photo metadata{media.some((m) => m.detectors.includes('gemini')) ? ', AI detector' : ''}).
            Confirming adds a strike to the poster’s account.
          </p>
          {media.length === 0 && <p className="report-ref">Nothing waiting for review.</p>}
          {media.map((m) => (
            <div key={m.id} className="review-item review-media">
              <div>
                {m.mediaKind === 'video' && m.videoUrl && isAllowedMediaUrl(m.videoUrl, 'video') ? (
                  <video src={m.videoUrl} controls preload="metadata" />
                ) : m.imageUrl && isAllowedMediaUrl(m.imageUrl, 'image') ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={m.imageUrl} alt="" referrerPolicy="no-referrer" />
                ) : null}
              </div>
              <div>
                <Link href={`/dashboard/reports/${m.reportId}`}><strong>{m.title}</strong></Link>{' '}
                <MediaLabel verdict={m.verdict} />
                <p className="report-ref">
                  {m.referenceNo} · {m.submitterName || 'Anonymous'} · strikes: {m.strikes} · authenticity {m.score}/100
                  {m.isHidden ? ' · hidden' : ''}
                </p>
                <ul className="review-signals">
                  {m.signals.map((s) => (
                    <li key={s.id} className={s.weight > 0 ? 'sig-ai' : ''}>
                      {s.weight > 0 ? '▲ ' : '▼ '}{s.reason}{s.conclusive ? ' (conclusive)' : ''}
                    </li>
                  ))}
                </ul>
                <div className="review-actions">
                  {MEDIA_ACTIONS.map((a) => (
                    <button
                      key={a.action}
                      className={`btn-sm ${a.primary ? 'btn-primary' : 'btn-secondary'}`}
                      disabled={busy === m.id || (a.action === 'hide' && m.isHidden)}
                      onClick={() => decide(m, a.action)}
                    >
                      {a.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </section>
      )}

      {tab === 'posts' && (
        <section className="review-section">
          <h3>Posts</h3>
          {reports.map((r) => (
            <div key={r.id} className="review-item">
              <Link href={`/dashboard/reports/${r.id}`}><strong>{r.title}</strong></Link>
              <p className="report-ref">{r.referenceNo} · {r.submitterName} · Severity {r.severity}</p>
              <div className="review-actions">
                {REPORT_STATUSES.map((s) => (
                  <button key={s} className={`btn-sm ${r.status === s ? 'btn-primary' : 'btn-secondary'}`} onClick={() => updateStatus(r.id, s)}>
                    {s.replace('_', ' ')}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </section>
      )}
    </div>
  );
}
