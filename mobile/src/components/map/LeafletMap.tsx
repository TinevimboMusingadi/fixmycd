import React, { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import { WebView as RNWebView, type WebViewMessageEvent, type WebViewProps } from 'react-native-webview';

// react-native-webview's class typings collapse to `never` props under this TS version; type the bits we use.
type WebViewHandle = { injectJavaScript: (script: string) => void };
const WebView = RNWebView as unknown as React.ComponentType<WebViewProps & { ref?: React.Ref<WebViewHandle> }>;
import { useTheme } from '@/theme';
import { leafletHtml, MAP_BASE_URL, type MapCommand, type MapEvent } from './leafletHtml';
import type { LeafletMapHandle, LeafletMapProps } from './types';

/** OpenStreetMap via Leaflet inside a WebView (no Google Maps key needed). */
export const LeafletMap = forwardRef<LeafletMapHandle, LeafletMapProps>(function LeafletMap(
  { center, zoom = 13, markers = [], selectedId, interactive = true, style, onMarkerPress, onMove, onMapPress, accessibilityLabel },
  ref
) {
  const { scheme, colors } = useTheme();
  const webRef = useRef<WebViewHandle>(null);
  const ready = useRef(false);
  const pendingView = useRef<MapCommand | null>(null);

  // Build the page once; later changes are sent as commands so the map keeps its position.
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
    webRef.current?.injectJavaScript(`window.__fmd && window.__fmd.run(${JSON.stringify(cmd)}); true;`);
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

  const onMessage = (e: WebViewMessageEvent) => {
    let msg: MapEvent;
    try {
      msg = JSON.parse(e.nativeEvent.data);
    } catch {
      return;
    }
    if (msg.type === 'ready') {
      ready.current = true;
      if (pendingView.current) {
        run(pendingView.current);
        pendingView.current = null;
      }
      run({ type: 'markers', markers, selectedId });
      run({ type: 'theme', dark: scheme === 'dark' });
    } else if (msg.type === 'markerPress') onMarkerPress?.(msg.id);
    else if (msg.type === 'move') onMove?.(msg);
    else if (msg.type === 'mapPress') onMapPress?.();
  };

  return (
    <View style={[styles.wrap, { backgroundColor: colors.bgTertiary }, style]} accessibilityLabel={accessibilityLabel}>
      <WebView
        ref={webRef}
        source={{ html, baseUrl: MAP_BASE_URL }}
        originWhitelist={['about:*', MAP_BASE_URL]}
        // The map never navigates; refuse any attempt to load another page inside it.
        onShouldStartLoadWithRequest={(req) => req.url.startsWith('about:') || req.url.startsWith(MAP_BASE_URL)}
        onMessage={onMessage}
        javaScriptEnabled
        domStorageEnabled
        scrollEnabled={false}
        bounces={false}
        overScrollMode="never"
        setSupportMultipleWindows={false}
        style={{ flex: 1, backgroundColor: 'transparent' }}
        pointerEvents={interactive ? 'auto' : 'none'}
      />
    </View>
  );
});

const styles = StyleSheet.create({ wrap: { overflow: 'hidden' } });
