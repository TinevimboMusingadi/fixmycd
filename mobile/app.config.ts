import type { ConfigContext, ExpoConfig } from 'expo/config';

/**
 * Where the app talks to the FixMyDistrict API. Change it here, or set
 * EXPO_PUBLIC_API_URL when starting/exporting (e.g. a local `next start`).
 */
const DEFAULT_API_BASE_URL = 'https://fixmycd.vercel.app';

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: 'FixMyDistrict',
  slug: 'fixmydistrict',
  version: '1.0.0',
  orientation: 'portrait',
  scheme: 'fixmydistrict',
  icon: './assets/icon.png',
  userInterfaceStyle: 'automatic',
  ios: {
    bundleIdentifier: 'app.fixmydistrict.mobile',
    supportsTablet: true,
    infoPlist: {
      ITSAppUsesNonExemptEncryption: false,
    },
  },
  android: {
    package: 'app.fixmydistrict.mobile',
    adaptiveIcon: {
      foregroundImage: './assets/adaptive-icon.png',
      backgroundColor: '#111111',
    },
    permissions: ['ACCESS_COARSE_LOCATION', 'ACCESS_FINE_LOCATION', 'CAMERA'],
    blockedPermissions: ['android.permission.RECORD_AUDIO'],
    predictiveBackGestureEnabled: false,
  },
  web: {
    favicon: './assets/favicon.png',
    output: 'single',
  },
  plugins: [
    'expo-router',
    'expo-image',
    'expo-secure-store',
    'expo-web-browser',
    [
      'expo-splash-screen',
      {
        image: './assets/splash-icon.png',
        imageWidth: 120,
        resizeMode: 'contain',
        backgroundColor: '#ffffff',
        dark: { image: './assets/splash-icon.png', backgroundColor: '#000000' },
      },
    ],
    [
      'expo-location',
      {
        locationWhenInUsePermission:
          'FixMyDistrict uses your location to pin new posts and show problems near you.',
        locationAlwaysAndWhenInUsePermission: false,
        locationAlwaysPermission: false,
      },
    ],
    [
      'expo-image-picker',
      {
        photosPermission: 'FixMyDistrict needs your photos so you can attach evidence to a post.',
        cameraPermission: 'FixMyDistrict uses the camera so you can photograph a problem for a post.',
        microphonePermission: false,
      },
    ],
  ],
  extra: {
    apiBaseUrl: (process.env.EXPO_PUBLIC_API_URL || DEFAULT_API_BASE_URL).replace(/\/+$/, ''),
  },
});
