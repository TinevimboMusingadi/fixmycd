# FixMyDistrict mobile

Native Android and iPhone app for FixMyDistrict, built with Expo (SDK 58) and Expo Router.
It talks to the existing FixMyDistrict API (the Next.js app in the repo root) without any backend changes.

- **Home**: the feed with *For you* and *Nearby* (25 km by default), search, filters, pull to refresh and infinite scroll
- **Explore**: a map of posts (Leaflet + OpenStreetMap in a WebView, no Google Maps key needed)
- **Post** (centre "+"): a four-step flow covering what, where (GPS + adjustable pin + address lookup), evidence (camera or library photo) and review
- **Alerts**: notifications with an unread badge and mark all read
- **Account**: profile, Light/Dark/System appearance, email notifications, analytics, Code of Ethics, donate, log out
- Post detail with photo, map, upvote, comments, expert endorsements, share and the PDF incident sheet
- Welcome, sign in, sign up (Code of Ethics agreement) and the *pending approval* screen with the $1 demo verification

A user's submission is called a **Post** in the app. The API still calls it a `report` (see `../docs/GLOSSARY.md`).

## Run it

```bash
cd mobile
npm install
npx expo start            # press a for Android, i for iOS, w for web
```

The app uses native modules that Expo Go does not have, such as WebView, image manipulator and secure store. For a device build, use a development build:

```bash
npx expo run:android      # needs the Android SDK
npx expo run:ios          # needs Xcode (macOS)
```

To preview in a browser, run `npm run web` (port 8160). In a browser, the API must be on the same origin or allow CORS, so use a local API (see below) or a proxy.

## Configure the API URL

The default is production, `https://fixmycd.vercel.app`, set in `app.config.ts` (`extra.apiBaseUrl`).
To override it, set `EXPO_PUBLIC_API_URL` when you start or build:

```bash
EXPO_PUBLIC_API_URL=http://192.168.1.20:3000 npx expo start
```

To use a local API, run it from the repo root:

```bash
DATABASE_URL=postgres://... npm run build && npx next start -p 3000
```

A phone reaches your computer by its LAN IP, not `localhost`. Release builds only allow HTTPS.

### How sign-in works

The API keeps the session in an httpOnly `fmd_session` cookie, set by `POST /api/auth/login` and `POST /api/verify`.
React Native's native networking stores that cookie and sends it back automatically: NSHTTPCookieStorage on iOS and the OkHttp cookie jar on Android.
Every request uses `credentials: 'include'` (`src/lib/api.ts`), and the app never sees or stores the token.
Native requests carry no `Origin` or `Sec-Fetch-Site` header, so the API's CSRF check (`src/lib/csrf.ts`) does not block them.

## Build a release APK locally

You need JDK 17 and the Android SDK (`ANDROID_HOME`, e.g. `/opt/android-sdk`):

```bash
cd mobile
npm ci
npx expo prebuild --platform android --clean
cd android
./gradlew assembleRelease
# APK: android/app/build/outputs/apk/release/app-release.apk
```

The generated project signs release builds with the debug keystore, which is fine for sideloading and testing.
For the Play Store, create an upload keystore and configure `signingConfigs.release` in `android/app/build.gradle`, or use EAS Build (`npx eas-cli build -p android`).
`android/` and `ios/` are generated, so don't commit them. Make native changes in `app.config.ts` or config plugins.

## Build for iPhone (EAS)

Building for iOS needs macOS/Xcode or EAS Build in the cloud:

```bash
npm i -g eas-cli
eas login
eas build:configure        # creates eas.json, links the project
eas build -p ios --profile production
eas submit -p ios          # upload to App Store Connect / TestFlight
```

Bundle id `app.fixmydistrict.mobile`, scheme `fixmydistrict`. With a Mac you can also run `npx expo prebuild --platform ios` and archive in Xcode.

## Checks

```bash
npm run typecheck                    # tsc --noEmit
npx expo-doctor
npx expo export --platform android   # proves the JS bundle compiles
npx expo export --platform ios
```

## Layout

```
app.config.ts             app name, ids, icons, splash, permissions, API URL
src/app/                  routes (Expo Router)
  (tabs)/                 index (Home), explore, post (+), alerts, account
  post/[id].tsx           post detail
  user/[id].tsx           profile
  compose.tsx             create-post flow
  auth/                   welcome, login, signup, pending
  analytics.tsx, ethics.tsx
src/components/           PostCard, ui kit, Sheet, FilterSheet, map/
src/lib/                  api client, auth, hooks (optimistic upvotes, share), location, media
src/theme/                brand colours, light/dark palettes, type scale
scripts/vendor-leaflet.mjs  inlines Leaflet into src/components/map/leafletAssets.ts
```

The map page inlines Leaflet (`npm run vendor:leaflet` regenerates it), so maps never depend on a CDN. Only the OpenStreetMap tiles are fetched.
