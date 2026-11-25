import { useCallback, useState } from 'react';
import * as Location from 'expo-location';

export type Coords = { lat: number; lng: number };
export type LocationState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'denied' }
  | { status: 'error'; message: string }
  | { status: 'ok'; coords: Coords };

/** Ask for foreground location once, on demand. */
export async function getCurrentCoords(): Promise<Coords> {
  const perm = await Location.requestForegroundPermissionsAsync();
  if (perm.status !== 'granted') {
    const err = new Error('Location permission was not granted');
    (err as Error & { denied: boolean }).denied = true;
    throw err;
  }
  const last = await Location.getLastKnownPositionAsync({ maxAge: 5 * 60_000 }).catch(() => null);
  if (last) return { lat: last.coords.latitude, lng: last.coords.longitude };
  const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
  return { lat: pos.coords.latitude, lng: pos.coords.longitude };
}

export function useCurrentLocation() {
  const [state, setState] = useState<LocationState>({ status: 'idle' });
  const request = useCallback(async () => {
    setState({ status: 'loading' });
    try {
      const coords = await getCurrentCoords();
      setState({ status: 'ok', coords });
      return coords;
    } catch (e) {
      if ((e as { denied?: boolean }).denied) setState({ status: 'denied' });
      else setState({ status: 'error', message: (e as Error).message || 'Could not get your location' });
      return null;
    }
  }, []);
  return { state, request };
}
