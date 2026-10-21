import type { Metadata, Viewport } from 'next'
import type { ReactNode } from 'react'
import { SessionProvider } from '@/lib/session'
import { ToastProvider } from '@/lib/toast'
import { Toaster } from '@/components/ui/toaster'
import './globals.css'

export const metadata: Metadata = {
  title: {
    default: 'Ziyarah — Travel Management',
    template: '%s · Ziyarah',
  },
  description: 'Expense, budget and itinerary management for college Ziyath trips.',
  manifest: '/manifest.json',
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
          </ToastProvider>
        </SessionProvider>
      </body>
    </html>
  )
}
