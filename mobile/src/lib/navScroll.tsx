import React, { createContext, useCallback, useContext, useMemo, useRef } from 'react';
import { AccessibilityInfo, Animated, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native';
import { useFocusEffect } from 'expo-router';

/** Below this offset the bars always show. */
const SHOW_NEAR_TOP = 64;
/** Ignore smaller movements (finger jitter, momentum settling). */
const DELTA = 6;

type NavScroll = {
  /** 0 = bars shown, 1 = bars hidden. Animated on the native thread. */
  progress: Animated.Value;
  setHidden: (hidden: boolean) => void;
};

const Ctx = createContext<NavScroll | null>(null);

/** Shared state for Twitter-style hide-on-scroll: the tab bar and screen headers read `progress`. */
export function NavScrollProvider({ children }: { children: React.ReactNode }) {
  const progress = useRef(new Animated.Value(0)).current;
  const hiddenRef = useRef(false);
  const reduceMotion = useRef(false);

  React.useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then((v) => (reduceMotion.current = v)).catch(() => {});
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', (v) => (reduceMotion.current = v));
    return () => sub.remove();
  }, []);

  const setHidden = useCallback(
    (hidden: boolean) => {
      if (hiddenRef.current === hidden) return;
      hiddenRef.current = hidden;
      if (reduceMotion.current) {
        progress.setValue(hidden ? 1 : 0);
        return;
      }
      Animated.timing(progress, { toValue: hidden ? 1 : 0, duration: 220, useNativeDriver: true }).start();
    },
    [progress]
  );

  const value = useMemo(() => ({ progress, setHidden }), [progress, setHidden]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

const fallback: NavScroll = { progress: new Animated.Value(0), setHidden: () => {} };

export function useNavProgress(): Animated.Value {
  return (useContext(Ctx) ?? fallback).progress;
}

/**
 * Scroll props for a tab screen's list: scrolling down hides the navigation,
 * scrolling up (or reaching the top) shows it. Bars come back whenever the screen regains focus.
 */
export function useHideOnScroll() {
  const { setHidden } = useContext(Ctx) ?? fallback;
  const lastY = useRef(0);
  const hidden = useRef(false);

  useFocusEffect(
    useCallback(() => {
      hidden.current = false;
      setHidden(false);
    }, [setHidden])
  );

  const onScroll = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent;
      const y = contentOffset.y;
      const maxY = Math.max(0, contentSize.height - layoutMeasurement.height);
      let next = hidden.current;
      if (y <= SHOW_NEAR_TOP) next = false;
      else if (y >= maxY) next = hidden.current; // ignore the bounce at the end of the list
      else if (Math.abs(y - lastY.current) >= DELTA) next = y > lastY.current;
      if (Math.abs(y - lastY.current) >= DELTA || y <= SHOW_NEAR_TOP) lastY.current = y;
      if (next !== hidden.current) {
        hidden.current = next;
        setHidden(next);
      }
    },
    [setHidden]
  );

  return { onScroll, scrollEventThrottle: 16 } as const;
}
