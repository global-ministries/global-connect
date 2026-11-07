import type { Metadata, Viewport } from 'next'
import { GeistSans } from 'geist/font/sans'
import { GeistMono } from 'geist/font/mono'
import './globals.css'
import { ThemeProvider } from '@/components/theme-provider'
import { Toaster } from '@/components/ui/sonner'
import { Analytics } from '@vercel/analytics/react'
import { SpeedInsights } from '@vercel/speed-insights/next'
import NextTopLoader from 'nextjs-toploader'

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#FAFAF8' },
    { media: '(prefers-color-scheme: dark)', color: '#0E0E12' },
  ],
}

export const metadata: Metadata = {
  title: 'Global Connect',
  description: 'Sistema para los miembros de Global Barquisimeto.',
  generator: 'Global Connect',
  applicationName: 'Global Connect',
  // Local files the middleware serves without a session (installing the app).
  icons: {
    icon: [
      { url: '/favicon.ico', sizes: '48x48' },
      { url: '/icons/icon-192.png', type: 'image/png', sizes: '192x192' },
      { url: '/icons/icon-512.png', type: 'image/png', sizes: '512x512' },
    ],
    shortcut: ['/favicon.ico'],
    apple: [{ url: '/apple-touch-icon.png', type: 'image/png', sizes: '180x180' }],
  },
  // iPhone "Agregar a pantalla de inicio": opens full screen with this title.
  appleWebApp: {
    capable: true,
    title: 'Global',
    statusBarStyle: 'default',
  },
  openGraph: {
    title: 'Global Connect',
    description: 'Sistema para los miembros de Global Barquisimeto.',
    images: [
      'https://wcnqocyqtksxhthnquta.supabase.co/storage/v1/object/public/logos/Logo%20global.jpg',
    ],
    locale: 'es_ES',
    siteName: 'Global Connect',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Global Connect',
    description: 'Sistema para los miembros de Global Barquisimeto.',
    images: [
      'https://wcnqocyqtksxhthnquta.supabase.co/storage/v1/object/public/logos/Logo%20global.jpg',
    ],
  },
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="es" className={`${GeistSans.variable} ${GeistMono.variable}`} suppressHydrationWarning>
      <head>
        <meta charSet="utf-8" />
      </head>
      <body className="font-sans antialiased">
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
          {/* Skip to content — accessibility */}
          <a href="#main-content" className="skip-to-content focus-ring">
            Saltar al contenido principal
          </a>
          <NextTopLoader
            color="#E96C20"
            initialPosition={0.08}
            crawlSpeed={200}
            height={3}
            crawl={true}
            showSpinner={false}
            easing="ease"
            speed={200}
          />
          <div id="main-content">
            {children}
          </div>
          <Toaster position="top-right" richColors closeButton />
        </ThemeProvider>
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  )
}
