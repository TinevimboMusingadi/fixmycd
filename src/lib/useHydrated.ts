'use client';

import { useSyncExternalStore } from 'react';

const subscribe = () => () => {};

/**
 * False during server rendering and hydration, true once React is in control.
 * Form submit buttons use it so a click on a slow device can't trigger a plain
 * browser submit (a full reload that loses what was typed) before the page is ready.
 */
export function useHydrated(): boolean {
  return useSyncExternalStore(subscribe, () => true, () => false);
}
