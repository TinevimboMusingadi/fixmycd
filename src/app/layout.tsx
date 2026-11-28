import type { Metadata, Viewport } from 'next';
import { headers } from 'next/headers';
import { PWARegister } from '@/components/PWARegister';
import { ThemeController } from '@/components/ThemeToggle';
import { themeInitScript } from '@/lib/theme';
import './globals.css';

export const metadata: Metadata = {
  title: 'FixMyDistrict',
  description: 'Post and track infrastructure failures in your district.',
  manifest: '/manifest.json',
  applicationName: 'FixMyDistrict',
  appleWebApp: {
    capable: true,
    title: 'FixMyDistrict',
    statusBarStyle: 'default',
  },
  formatDetection: {
    telephone: false,
  },
  icons: {
    icon: [
      { url: '/logo.svg', type: 'image/svg+xml' },
      { url: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
    ],
    apple: '/icons/apple-touch-icon.png',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  // Lets the app paint under the notch / home indicator; padding uses env(safe-area-inset-*).
  viewportFit: 'cover',
  themeColor: '#8b5cf6',
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Set by src/proxy.ts; the enforced CSP only runs inline scripts that carry it.
  const nonce = (await headers()).get('x-nonce') ?? undefined;
  return (
    // Light is the default; the inline script swaps in a saved choice (or the device
    // setting for "System") before the first paint, so the DOM wins over hydration.
    <html lang="en" data-theme="light" suppressHydrationWarning>
      <head>
        <script nonce={nonce} dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body>
        {children}
        <ThemeController />
        <PWARegister />
      </body>
    </html>
  );
}