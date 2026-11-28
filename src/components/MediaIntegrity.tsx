import React from 'react';

export type MediaVerdict = 'ai_confirmed' | 'suspected_ai' | 'unverified' | 'likely_authentic';
export type MediaIntegrity = { checkId?: string; verdict: MediaVerdict; score?: number; reasons: string[] };

export const isWarning = (v: string | null | undefined): v is 'ai_confirmed' | 'suspected_ai' =>
  v === 'ai_confirmed' || v === 'suspected_ai';

/** Shown in the composer right after upload. The poster can still post; the post gets a label and a review. */
export function MediaWarning({ kind, integrity }: { kind: 'image' | 'video'; integrity: MediaIntegrity }) {
  const confirmed = integrity.verdict === 'ai_confirmed';
  return (
    <div className={`media-warning ${confirmed ? 'media-warning-strong' : ''}`} role="status">
      <strong>{confirmed ? `This ${kind === 'image' ? 'photo' : 'video'} looks AI-generated` : `This ${kind === 'image' ? 'photo' : 'video'} may be AI-generated`}</strong>
      {integrity.reasons.length > 0 && (
        <ul>
          {integrity.reasons.map((r) => <li key={r}>{r}</li>)}
        </ul>
      )}
      <p>
        FixMyDistrict is for real problems you’ve seen. You can still post, but it will be labelled and checked by a
        reviewer, and confirmed AI media counts against your account. If this is a real photo, consider taking one with
        the in-app camera.
      </p>
    </div>
  );
}

/** Small label on posts whose media looks AI-generated. */
export function MediaLabel({ verdict, compact = false }: { verdict: string | null | undefined; compact?: boolean }) {
  if (!isWarning(verdict)) return null;
  const confirmed = verdict === 'ai_confirmed';
  const text = confirmed ? 'AI-generated media' : 'Possibly AI-generated';
  return (
    <span
      className={`media-label ${confirmed ? 'media-label-strong' : ''}`}
      title={confirmed ? 'This post’s photo or video was made with AI.' : 'Automatic checks suggest this media may be AI-generated. A reviewer will check it.'}
    >
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" aria-hidden="true">
        <path d="M12 9v4M12 17h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" />
      </svg>
      {compact ? (confirmed ? 'AI' : 'AI?') : text}
    </span>
  );
}
