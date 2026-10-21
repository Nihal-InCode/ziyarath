'use client'

import { useEffect, useState } from 'react'
import { Download, X } from 'lucide-react'
import { Button } from '@/components/ui/primitives'

/**
 * Registers /sw.js and shows a one-time "Install app" hint when the browser
 * reports the app as installable (beforeinstallprompt on Chrome/Edge/Android).
 * iOS Safari has no prompt event — the hint there tells users to Share → Add
 * to Home Screen via the apple check below.
 */
export function PwaRegister() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null)
  const [showHint, setShowHint] = useState(false)
  const [installed, setInstalled] = useState(false)

  useEffect(() => {
    if ('serviceWorker' in navigator) {
      const register = () => {
        navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => undefined)
      }
      if (document.readyState === 'complete') register()
      else window.addEventListener('load', register, { once: true })
    }

    const onPrompt = (e: Event) => {
      e.preventDefault()
      setDeferred(e as BeforeInstallPromptEvent)
      if (!localStorage.getItem('ziyarah.install.dismissed')) setShowHint(true)
    }
    const onInstalled = () => {
      setInstalled(true)
      setShowHint(false)
      setDeferred(null)
      localStorage.removeItem('ziyarah.install.dismissed')
    }
    window.addEventListener('beforeinstallprompt', onPrompt)
    window.addEventListener('appinstalled', onInstalled)
    // iOS: already standalone = installed.
    if (window.matchMedia('(display-mode: standalone)').matches) setInstalled(true)
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt)
      window.removeEventListener('appinstalled', onInstalled)
    }
  }, [])

  const install = async () => {
    if (!deferred) return
    setShowHint(false)
    try {
      await deferred.prompt()
      await deferred.userChoice
    } finally {
      setDeferred(null)
    }
  }

  const dismiss = () => {
    setShowHint(false)
    localStorage.setItem('ziyarah.install.dismissed', '1')
  }

  if (installed || !showHint) return null

  return (
    <div className="fixed inset-x-3 bottom-3 z-50 mx-auto flex max-w-md items-center gap-3 rounded-2xl border border-zinc-200 bg-white p-3 shadow-lg">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/icon-192.png" alt="" className="size-9 shrink-0 rounded-xl object-cover shadow-xs ring-1 ring-black/5" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-zinc-900">Install Ziyarah</p>
        <p className="text-xs text-zinc-500">Add to your home screen for quick access.</p>
      </div>
      {deferred ? (
        <Button size="sm" onClick={install}>
          <Download className="size-4" /> Install
        </Button>
      ) : (
        <span className="shrink-0 text-xs text-zinc-400">Share → Add to Home Screen</span>
      )}
      <button
        type="button"
        onClick={dismiss}
        aria-label="Dismiss install hint"
        className="rounded-full p-1 text-zinc-400 hover:bg-zinc-100"
      >
        <X className="size-4" />
      </button>
    </div>
  )
}

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}
