'use client';

import { useEffect, useState } from 'react';

/** Below this scroll position the bars always show. */
export const SHOW_NEAR_TOP_PX = 64;
/** Ignore movements smaller than this (finger jitter, momentum settling). */
export const SCROLL_DELTA_PX = 6;

/**
 * Whether the navigation should be hidden after the page scrolled from prevY to y.
 * Scrolling down hides it, scrolling up (or reaching the top) brings it back.
 */
export function nextNavHidden(hidden: boolean, prevY: number, y: number): boolean {
  if (y <= SHOW_NEAR_TOP_PX) return false;
  const delta = y - prevY;
  if (Math.abs(delta) < SCROLL_DELTA_PX) return hidden;
  return delta > 0;
}

/**
 * Twitter-style hide-on-scroll for phone layouts: true while the user scrolls down
 * through content, false as soon as they scroll back up. Only tracks the window
 * while `media` matches, and resets whenever `resetKey` (e.g. the pathname) changes.
 */
export function useHideOnScroll(resetKey: string, media = '(max-width: 768px)', enabled = true): boolean {
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    if (!enabled || typeof window === 'undefined') return;
    const mq = window.matchMedia(media);
    let prevY = window.scrollY;
    let current = false;
    let frame = 0;

    const update = () => {
      frame = 0;
      const y = window.scrollY;
      const next = mq.matches ? nextNavHidden(current, prevY, y) : false;
      // Only move prevY once the change counted, so slow scrolls still add up.
      if (Math.abs(y - prevY) >= SCROLL_DELTA_PX || y <= SHOW_NEAR_TOP_PX) prevY = y;
      if (next !== current) {
        current = next;
        setHidden(next);
      }
    };
    const onScroll = () => {
      if (!frame) frame = window.requestAnimationFrame(update);
    };
    const onMedia = () => update();

    window.addEventListener('scroll', onScroll, { passive: true });
    mq.addEventListener('change', onMedia);
    return () => {
      window.removeEventListener('scroll', onScroll);
      mq.removeEventListener('change', onMedia);
      if (frame) window.cancelAnimationFrame(frame);
      setHidden(false);
    };
  }, [resetKey, media, enabled]);

  return enabled && hidden;
}
