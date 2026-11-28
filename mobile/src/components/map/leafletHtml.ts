import { API_BASE_URL } from '@/lib/config';
import { LEAFLET_CSS, LEAFLET_JS } from './leafletAssets';

// Leaflet is inlined (see scripts/vendor-leaflet.mjs) so maps never depend on a CDN.
const inlineScript = (code: string) => code.replace(/<\/script/gi, '<\\/script');

export interface MapMarker {
  id: string;
  lat: number;
  lng: number;
  color: string;
}

export interface MapBounds {
  west: number;
  south: number;
  east: number;
  north: number;
}

export type MapEvent =
  | { type: 'ready' }
  | { type: 'markerPress'; id: string }
  | { type: 'move'; lat: number; lng: number; zoom: number; bounds: MapBounds }
  | { type: 'mapPress' };

export type MapCommand =
  | { type: 'markers'; markers: MapMarker[]; selectedId?: string | null }
  | { type: 'view'; lat: number; lng: number; zoom?: number; animate?: boolean }
  | { type: 'theme'; dark: boolean };

/** Origin the map page pretends to be loaded from, so OSM tile requests carry a Referer. */
export const MAP_BASE_URL = API_BASE_URL;

/**
 * A self-contained Leaflet + OpenStreetMap page. It talks to React Native via
 * window.ReactNativeWebView.postMessage (native) or window.parent.postMessage
 * (web iframe) and accepts commands through window.__fmd.run(cmd) or message events.
 * Leaflet is inlined and tiles come from OpenStreetMap, so no API keys are needed.
 */
export function leafletHtml(opts: {
  lat: number;
  lng: number;
  zoom: number;
  dark: boolean;
  interactive: boolean;
  markers: MapMarker[];
  selectedId?: string | null;
}): string {
  const init = JSON.stringify(opts).replace(/</g, '\\u003c');
  return `<!doctype html>
<html><head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" />
<style>${LEAFLET_CSS}</style>
<style>
  html, body, #map { margin: 0; padding: 0; height: 100%; width: 100%; }
  body { background: ${opts.dark ? '#0b0b0f' : '#f0f0f3'}; -webkit-tap-highlight-color: transparent; }
  .dark .leaflet-tile-pane { filter: invert(100%) hue-rotate(180deg) brightness(95%) contrast(90%); }
  .leaflet-control-attribution { font-size: 9px; background: rgba(255,255,255,0.7) !important; }
  .dark .leaflet-control-attribution { background: rgba(0,0,0,0.6) !important; color: #aaa; }
  .dark .leaflet-control-attribution a { color: #c4b5fd; }
  .leaflet-control-zoom { display: none; }
</style>
</head><body>
<div id="map"></div>
<script>${inlineScript(LEAFLET_JS)}</script>
<script>
(function () {
  var init = ${init};
  function send(msg) {
    var s = JSON.stringify(msg);
    if (window.ReactNativeWebView) window.ReactNativeWebView.postMessage(s);
    // srcdoc frames share the app's origin, so address the parent by it rather than '*'.
    else if (window.parent && window.parent !== window) window.parent.postMessage({ __fmdMap: true, payload: msg }, window.origin && window.origin !== 'null' ? window.origin : '*');
  }
  if (init.dark) document.documentElement.className = 'dark';
  var map = L.map('map', {
    zoomControl: false,
    attributionControl: true,
    dragging: init.interactive,
    touchZoom: init.interactive,
    scrollWheelZoom: init.interactive,
    doubleClickZoom: init.interactive,
    boxZoom: false,
    keyboard: false,
    tap: init.interactive
  }).setView([init.lat, init.lng], init.zoom);
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; OpenStreetMap'
  }).addTo(map);
  map.attributionControl.setPrefix(false);

  var layer = L.layerGroup().addTo(map);
  function setMarkers(list, selectedId) {
    layer.clearLayers();
    (list || []).forEach(function (m) {
      var sel = m.id === selectedId;
      var c = L.circleMarker([m.lat, m.lng], {
        radius: sel ? 11 : 7,
        color: '#ffffff',
        weight: sel ? 3 : 2,
        fillColor: m.color,
        fillOpacity: 1
      });
      c.on('click', function (e) { L.DomEvent.stopPropagation(e); send({ type: 'markerPress', id: m.id }); });
      c.addTo(layer);
      if (sel) c.bringToFront();
    });
  }
  function emitMove() {
    var c = map.getCenter(), b = map.getBounds();
    send({ type: 'move', lat: c.lat, lng: c.lng, zoom: map.getZoom(),
      bounds: { west: b.getWest(), south: b.getSouth(), east: b.getEast(), north: b.getNorth() } });
  }
  map.on('moveend', emitMove);
  map.on('click', function () { send({ type: 'mapPress' }); });

  function run(cmd) {
    if (!cmd) return;
    if (cmd.type === 'markers') setMarkers(cmd.markers, cmd.selectedId);
    else if (cmd.type === 'view') map.setView([cmd.lat, cmd.lng], cmd.zoom || map.getZoom(), { animate: cmd.animate !== false });
    else if (cmd.type === 'theme') document.documentElement.className = cmd.dark ? 'dark' : '';
  }
  window.__fmd = { run: run };
  window.addEventListener('message', function (e) {
    // Commands only from the app: the native bridge (no source) or the hosting page.
    if (e.source && e.source !== window.parent) return;
    var d = e.data;
    if (typeof d === 'string') { try { d = JSON.parse(d); } catch (_) { return; } }
    if (d && d.__fmdCmd) run(d.cmd);
  });
  document.addEventListener('message', function (e) {
    try { var d = JSON.parse(e.data); if (d && d.__fmdCmd) run(d.cmd); } catch (_) {}
  });
  setMarkers(init.markers, init.selectedId);
  send({ type: 'ready' });
  setTimeout(emitMove, 50);
})();
</script>
</body></html>`;
}
