// FixMyDistrict Service Worker
const CACHE_NAME = 'fixmydistrict-v1';
const APP_SHELL = [
  '/',
  '/dashboard',
  '/dashboard/explore',
  '/dashboard/notifications',
  '/dashboard/profile',
  '/login',
  '/signup',
  '/public',
  '/manifest.json',
  '/logo.svg',
];

// Install — cache app shell
self.addEventListener('install', (event) => {
  console.log('[SW] Installing…');
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

// Activate — clean old caches
self.addEventListener('activate', (event) => {
  console.log('[SW] Activating…');
  event.waitUntil(
    caches
      .keys()
      .then((names) =>
        Promise.all(
          names
            .filter((name) => name !== CACHE_NAME)
            .map((name) => caches.delete(name))
        )
      )
      .then(() => self.clients.claim())
  );
});

// Fetch — network first, cache fallback for navigation
self.addEventListener('fetch', (event) => {
  const { request } = event;

  // Skip non-GET and cross-origin
  if (request.method !== 'GET') return;
  if (!request.url.startsWith(self.location.origin)) return;

  // Skip API routes
  if (request.url.includes('/api/')) return;

  event.respondWith(
    fetch(request)
      .then((response) => {
        // Cache successful responses
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(request, clone);
          });
        }
        return response;
      })
      .catch(() => {
        // Offline — try cache
        return caches.match(request).then((cached) => {
          if (cached) return cached;
          // Fallback for navigation requests
          if (request.mode === 'navigate') {
            return caches.match('/dashboard');
          }
          return new Response('Offline', { status: 503 });
        });
      })
  );
});