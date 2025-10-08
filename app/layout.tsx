import type { Metadata } from 'next'
import { GeistSans } from 'geist/font/sans'
import { GeistMono } from 'geist/font/mono'
import './globals.css'
import { Analytics } from '@vercel/analytics/react'

export const metadata: Metadata = {
  title: 'Global Connect',
  description: 'Sistema para los miembros de Global Barquisimeto.',
  generator: 'Global Connect',
  icons: {
    icon: [
      {
        url: 'https://wcnqocyqtksxhthnquta.supabase.co/storage/v1/object/public/logos/favicon%20global.webp',
        type: 'image/webp',
  sizes: '512x512',
      },
    ],
    shortcut: [
      {
        url: 'https://wcnqocyqtksxhthnquta.supabase.co/storage/v1/object/public/logos/favicon%20global.webp',
        type: 'image/webp',
  sizes: '512x512',
      },
    ],
    apple: [
      {
        url: 'https://wcnqocyqtksxhthnquta.supabase.co/storage/v1/object/public/logos/favicon%20global.webp',
        type: 'image/webp',
        sizes: '180x180',
      },
    ],
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
    <html lang="es" className={`${GeistSans.variable} ${GeistMono.variable}`}>
      <head>
        <meta charSet="utf-8" />
      </head>
      <body className="font-sans antialiased">
        {children}
        <Analytics />
      </body>
    </html>
  )
}
