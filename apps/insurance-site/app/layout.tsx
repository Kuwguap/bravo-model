import type { Metadata, Viewport } from 'next'

import { Analytics } from '@vercel/analytics/next'
import './globals.css'
import { AuthProvider } from '@/lib/auth-context'
import { Oswald, Archivo } from 'next/font/google'

// NJ family type: Oswald (condensed display) + Archivo (body), matching the tag site.
const oswald = Oswald({ subsets: ['latin'], weight: ['500', '600', '700'], variable: '--font-oswald' })
const archivo = Archivo({ subsets: ['latin'], weight: ['400', '500', '600', '700'], variable: '--font-archivo' })

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  viewportFit: 'cover',
  themeColor: '#12161C',
}

export const metadata: Metadata = {
  title: 'NJ Coverage - Your Insurance Dashboard',
  description: 'Manage your insurance policies and vehicle information with NJ Coverage',
  generator: 'v0.app',
  icons: {
    icon: [
      {
        url: '/icon-light-32x32.png',
        media: '(prefers-color-scheme: light)',
      },
      {
        url: '/icon-dark-32x32.png',
        media: '(prefers-color-scheme: dark)',
      },
      {
        url: '/icon.svg',
        type: 'image/svg+xml',
      },
    ],
    apple: '/apple-icon.png',
  },
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" className={`${oswald.variable} ${archivo.variable}`}>
      <body className="font-sans antialiased" style={{ fontFamily: 'var(--font-archivo), system-ui, sans-serif' }}>
        <AuthProvider>
          {children}
          {process.env.NODE_ENV === 'production' && <Analytics />}
        </AuthProvider>
      </body>
    </html>
  )
}
