import type { Metadata, Viewport } from 'next'
import type { ReactNode } from 'react'
import { SessionProvider } from '@/lib/session'
import { ToastProvider } from '@/lib/toast'
import { Toaster } from '@/components/ui/toaster'
import { PwaRegister } from '@/components/pwa'
import './globals.css'

export const metadata: Metadata = {
  title: {
    default: 'Ziyarah — Travel Management',
    template: '%s · Ziyarah',
  },
  description: 'Expense, budget and itinerary management for college Ziyarath trips.',
  manifest: '/manifest.json',
  icons: {
    icon: [{ url: '/icon-192.png', sizes: '192x192', type: 'image/png' }],
    apple: [{ url: '/apple-touch-icon.png', sizes: '180x180', type: 'image/png' }],
  },
  appleWebApp: {
    capable: true,
    title: 'Ziyarah',
    statusBarStyle: 'default',
  },
}

export const viewport: Viewport = {
  themeColor: '#0f766e',
  width: 'device-width',
  initialScale: 1,
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-dvh antialiased">
        <SessionProvider>
          <ToastProvider>
            {children}
            <Toaster />
            <PwaRegister />
          </ToastProvider>
        </SessionProvider>
      </body>
    </html>
  )
}
