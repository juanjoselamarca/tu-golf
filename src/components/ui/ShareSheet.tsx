'use client'

import { useEffect } from 'react'
import { X, Copy, Share2, LinkIcon } from '@/components/icons'

interface ShareSheetProps {
  open: boolean
  onClose: () => void
  title?: string
  shareUrl: string
  shareText?: string
  copyLabel?: string
}

/**
 * ShareSheet Golfers+ — sheet unificada de compartir (audit 2026-04-22 P15).
 *
 * Antes: dos botones WhatsApp grandes verdes rompiendo paleta.
 * Ahora: un `<Button>Compartir</Button>` → abre este sheet con opciones.
 *
 * Orden de opciones:
 * 1. WhatsApp (principal en LatAm, pero subordinado al sheet)
 * 2. Copiar link
 * 3. Mail
 * 4. Compartir nativo del sistema (si disponible)
 */
export function ShareSheet({
  open,
  onClose,
  title = 'Compartir',
  shareUrl,
  shareText,
  copyLabel = 'Copiar link',
}: ShareSheetProps) {
  useEffect(() => {
    if (!open) return
    function onEsc(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onEsc)
    return () => window.removeEventListener('keydown', onEsc)
  }, [open, onClose])

  if (!open) return null

  const waText = shareText ? `${shareText} ${shareUrl}` : shareUrl
  const waUrl = `https://wa.me/?text=${encodeURIComponent(waText)}`

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(shareUrl)
      onClose()
    } catch {
      // fallback silencioso
    }
  }

  async function handleNative() {
    if (!navigator.share) return
    try {
      await navigator.share({ title, text: shareText, url: shareUrl })
      onClose()
    } catch {
      // cancelado por usuario
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      className="fixed inset-0 z-[200] flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl shadow-2xl p-5 pb-8 sm:pb-5 animate-[slideUp_240ms_ease-out]"
        style={{ background: 'var(--bg-surface)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold" style={{ color: 'var(--text)' }}>{title}</h3>
          <button
            onClick={onClose}
            aria-label="Cerrar"
            className="hover-surface w-10 h-10 flex items-center justify-center rounded-full transition-colors"
          >
            <X className="w-5 h-5" style={{ color: 'var(--text-2)' }} />
          </button>
        </div>

        <div className="space-y-2">
          <a
            href={waUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="hover-surface flex items-center gap-3 h-14 px-4 rounded-xl transition-colors"
            style={{ background: 'rgba(16, 185, 129, 0.08)' }}
          >
            <span className="w-10 h-10 rounded-full bg-emerald-500 flex items-center justify-center text-white text-xl font-bold">W</span>
            <span className="font-medium" style={{ color: 'var(--text)' }}>WhatsApp</span>
          </a>

          <button
            onClick={handleCopy}
            className="hover-surface w-full flex items-center gap-3 h-14 px-4 rounded-xl transition-colors text-left"
            style={{ background: 'var(--border)' }}
          >
            <span className="w-10 h-10 rounded-full flex items-center justify-center" style={{ background: 'var(--border-md)' }}>
              <Copy className="w-5 h-5" style={{ color: 'var(--text-2)' }} />
            </span>
            <span className="font-medium" style={{ color: 'var(--text)' }}>{copyLabel}</span>
          </button>

          {typeof navigator !== 'undefined' && 'share' in navigator && (
            <button
              onClick={handleNative}
              className="hover-surface w-full flex items-center gap-3 h-14 px-4 rounded-xl transition-colors text-left"
              style={{ background: 'var(--border)' }}
            >
              <span className="w-10 h-10 rounded-full flex items-center justify-center" style={{ background: 'var(--border-md)' }}>
                <Share2 className="w-5 h-5" style={{ color: 'var(--text-2)' }} />
              </span>
              <span className="font-medium" style={{ color: 'var(--text)' }}>Más opciones</span>
            </button>
          )}
        </div>

        <p className="mt-4 text-xs text-center break-all" style={{ color: 'var(--text-3)' }}>
          <LinkIcon className="w-3 h-3 inline-block mr-1 -mt-0.5" />
          {shareUrl}
        </p>
      </div>
    </div>
  )
}
