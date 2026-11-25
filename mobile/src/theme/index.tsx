import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { useColorScheme } from 'react-native';
import { storage } from '@/lib/storage';

/** Brand colours from the web app's globals.css. */
export const brand = {
  purpleStart: '#8b5cf6',
  purpleEnd: '#6d28d9',
  gradient: ['#8b5cf6', '#6d28d9'] as const,
  red: '#ef4444',
  yellow: '#eab308',
  blue: '#3b82f6',
  green: '#22c55e',
  orange: '#f97316',
  grey: '#71717a',
};

export interface Colors {
  bg: string;
  bgSecondary: string;
  bgTertiary: string;
  bgElevated: string;
  text: string;
  textBody: string;
  textSecondary: string;
  textTertiary: string;
  border: string;
  borderStrong: string;
  accent: string;
  accentText: string;
  accentSoft: string;
  skeleton: string;
  skeletonHighlight: string;
  overlay: string;
  danger: string;
  success: string;
  tabBar: string;
}

const light: Colors = {
  bg: '#ffffff',
  bgSecondary: '#f7f7f9',
  bgTertiary: '#f0f0f3',
  bgElevated: '#ffffff',
  text: '#0b0b0f',
  textBody: '#27272a',
  textSecondary: '#52525b',
  textTertiary: '#71717a',
  border: '#e4e4e7',
  borderStrong: '#d4d4d8',
  accent: brand.purpleStart,
  accentText: '#6d28d9',
  accentSoft: 'rgba(139, 92, 246, 0.12)',
  skeleton: '#ececf0',
  skeletonHighlight: '#f7f7f9',
  overlay: 'rgba(15, 15, 20, 0.45)',
  danger: brand.red,
  success: '#16a34a',
  tabBar: 'rgba(255,255,255,0.96)',
};

const dark: Colors = {
  bg: '#000000',
  bgSecondary: '#0a0a0a',
  bgTertiary: '#111111',
  bgElevated: '#121212',
  text: '#ffffff',
  textBody: '#d4d4d8',
  textSecondary: '#a0a0a0',
  textTertiary: '#6b6b6b',
  border: '#1e1e1e',
  borderStrong: '#2a2a2a',
  accent: brand.purpleStart,
  accentText: '#c4b5fd',
  accentSoft: 'rgba(139, 92, 246, 0.18)',
  skeleton: '#1a1a1a',
  skeletonHighlight: '#2a2a2a',
  overlay: 'rgba(0, 0, 0, 0.7)',
  danger: brand.red,
  success: brand.green,
  tabBar: 'rgba(0,0,0,0.96)',
};

/** Tight type scale on the system font (SF Pro / Roboto). */
export const type = {
  title: { fontSize: 22, fontWeight: '800' as const, letterSpacing: -0.4 },
  heading: { fontSize: 18, fontWeight: '800' as const, letterSpacing: -0.2 },
  subheading: { fontSize: 15, fontWeight: '700' as const },
  body: { fontSize: 15, fontWeight: '400' as const, lineHeight: 20 },
  bodyStrong: { fontSize: 15, fontWeight: '700' as const, lineHeight: 20 },
  small: { fontSize: 13, fontWeight: '400' as const, lineHeight: 17 },
  smallStrong: { fontSize: 13, fontWeight: '600' as const },
  tiny: { fontSize: 11, fontWeight: '600' as const, letterSpacing: 0.1 },
};

export const radius = { sm: 8, md: 12, lg: 16, xl: 20, full: 999 };
export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24 };

export type ThemePreference = 'system' | 'light' | 'dark';

interface ThemeContextValue {
  colors: Colors;
  scheme: 'light' | 'dark';
  preference: ThemePreference;
  setPreference: (p: ThemePreference) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);
const PREF_KEY = 'fmd.theme';

export function AppThemeProvider({ children }: { children: React.ReactNode }) {
  const system = useColorScheme();
  const [preference, setPref] = useState<ThemePreference>('system');

  useEffect(() => {
    storage.get(PREF_KEY).then((v) => {
      if (v === 'light' || v === 'dark' || v === 'system') setPref(v);
    });
  }, []);

  const value = useMemo<ThemeContextValue>(() => {
    const scheme = preference === 'system' ? (system === 'dark' ? 'dark' : 'light') : preference;
    return {
      colors: scheme === 'dark' ? dark : light,
      scheme,
      preference,
      setPreference: (p) => {
        setPref(p);
        storage.set(PREF_KEY, p);
      },
    };
  }, [preference, system]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used inside AppThemeProvider');
  return ctx;
}

// --- Status & severity chips (match .report-badge / .sev-chip on the web) ---

export const STATUS_META: Record<string, { label: string; color: string }> = {
  submitted: { label: 'Submitted', color: brand.purpleStart },
  in_review: { label: 'In review', color: brand.yellow },
  accepted: { label: 'Accepted', color: brand.green },
  in_progress: { label: 'In progress', color: brand.blue },
  resolved: { label: 'Resolved', color: brand.green },
  resubmit: { label: 'Resubmit', color: brand.orange },
  duplicate: { label: 'Duplicate', color: brand.grey },
  not_an_issue: { label: 'Not an issue', color: brand.grey },
};

export function statusMeta(status: string) {
  return STATUS_META[status] ?? { label: status.replace(/_/g, ' '), color: brand.purpleStart };
}

export function severityMeta(severity: number | null | undefined) {
  if (!severity) return null;
  if (severity >= 4) return { label: 'Critical', color: brand.red };
  if (severity === 3) return { label: 'Medium', color: brand.yellow };
  return { label: 'Low', color: brand.blue };
}

/** Translucent background for a chip of the given colour (web uses 15% alpha). */
export function tint(hex: string, alpha = 0.15): string {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
