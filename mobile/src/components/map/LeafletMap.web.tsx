import React, { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import { useTheme } from '@/theme';
import { leafletHtml, type MapCommand, type MapEvent } from './leafletHtml';
import type { LeafletMapHandle, LeafletMapProps } from './types';

/** Web preview: the same Leaflet page in an iframe (react-native-webview has no web support). */
export const LeafletMap = forwardRef<LeafletMapHandle, LeafletMapProps>(function LeafletMap(
  { center, zoom = 13, markers = [], selectedId, interactive = true, style, onMarkerPress, onMove, onMapPress, accessibilityLabel },
  ref
) {
  const { scheme, colors } = useTheme();
  const frame = useRef<HTMLIFrameElement | null>(null);
  const ready = useRef(false);
  const pendingView = useRef<MapCommand | null>(null);
  const initial = useRef({ center, zoom, markers, selectedId, dark: scheme === 'dark' });
  const html = useMemo(
    () =>
      leafletHtml({
        lat: initial.current.center.lat,
        lng: initial.current.center.lng,
        zoom: initial.current.zoom,
        dark: initial.current.dark,
        interactive,
        markers: initial.current.markers,
        selectedId: initial.current.selectedId,
      }),
    [interactive]
  );

  const run = useCallback((cmd: MapCommand) => {
    if (!ready.current) return;
    frame.current?.contentWindow?.postMessage({ __fmdCmd: true, cmd }, '*');
  }, []);

  useImperativeHandle(
    ref,
    () => ({
      setView: (lat, lng, z) => {
        const cmd: MapCommand = { type: 'view', lat, lng, zoom: z };
        if (ready.current) run(cmd);
        else pendingView.current = cmd;
      },
    }),
    [run]
  );
  useEffect(() => run({ type: 'markers', markers, selectedId }), [markers, selectedId, run]);
  useEffect(() => run({ type: 'theme', dark: scheme === 'dark' }), [scheme, run]);

  const latest = useRef({ onMarkerPress, onMove, onMapPress, markers, selectedId, scheme });
  latest.current = { onMarkerPress, onMove, onMapPress, markers, selectedId, scheme };

  useEffect(() => {
    const handler = (e: MessageEvent) => {
      if (e.source !== frame.current?.contentWindow) return;
      const d = e.data as { __fmdMap?: boolean; payload?: MapEvent };
      if (!d?.__fmdMap || !d.payload) return;
      const msg = d.payload;
      const l = latest.current;
      if (msg.type === 'ready') {
        ready.current = true;
        if (pendingView.current) {
          run(pendingView.current);
          pendingView.current = null;
        }
        run({ type: 'markers', markers: l.markers, selectedId: l.selectedId });
        run({ type: 'theme', dark: l.scheme === 'dark' });
      } else if (msg.type === 'markerPress') l.onMarkerPress?.(msg.id);
      else if (msg.type === 'move') l.onMove?.(msg);
      else if (msg.type === 'mapPress') l.onMapPress?.();
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, [run]);

  return (
    <View style={[styles.wrap, { backgroundColor: colors.bgTertiary }, style]} accessibilityLabel={accessibilityLabel}>
      {React.createElement('iframe', {
        ref: frame,
        srcDoc: html,
        title: accessibilityLabel ?? 'Map',
        style: { border: 0, width: '100%', height: '100%', pointerEvents: interactive ? 'auto' : 'none' },
      })}
    </View>
  );
});

const styles = StyleSheet.create({ wrap: { overflow: 'hidden' } });
