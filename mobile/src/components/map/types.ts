import type { StyleProp, ViewStyle } from 'react-native';
import type { MapBounds, MapMarker } from './leafletHtml';

export interface LeafletMapProps {
  center: { lat: number; lng: number };
  zoom?: number;
  markers?: MapMarker[];
  selectedId?: string | null;
  interactive?: boolean;
  style?: StyleProp<ViewStyle>;
  onMarkerPress?: (id: string) => void;
  onMove?: (e: { lat: number; lng: number; zoom: number; bounds: MapBounds }) => void;
  onMapPress?: () => void;
  accessibilityLabel?: string;
}

export interface LeafletMapHandle {
  setView: (lat: number, lng: number, zoom?: number) => void;
}
