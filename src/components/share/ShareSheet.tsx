'use client'

import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Share2, MessageCircle, LinkIcon, MoreVertical, X } from '@/components/icons'
import type { SharePayload } from '@/golf/share/types'
import { useShare } from './useShare'

interface ShareSheetProps {
  open: boolean
  onClose: () => void
  /** Payload único (fuente de verdad de qué se comparte). */
  payload: SharePayload
  /** Notifica una copia exitosa (el caller muestra el toast "Copiado" y cierra). */
  onCopied?: () => void
}

/**
 * ShareSheet "Vitrina" (variante A aprobada en design-shotgun 2026-06-28).
 * Decisión: `docs/design-decisions/2026-06-28-sharesheet-vitrina.md`.
 *
 * Bottom-sheet SIEMPRE-oscuro (paleta vitrina, no tokens de tema que voltean en
 * light): la tarjeta PNG es el héroe con marco hairline dorado, y debajo un
 * stack de botones que mapea la jerarquía DESIGN.md §5 (commit → nav → ghost).
 *
 * Cada botón = una acción explícita sobre los canónicos (un concepto, una fuente):
 *   - "Compartir imagen" → cascada completa `useShare.share` (con imagen).
 *   - "WhatsApp"         → `useShare.whatsapp` (wa.me, formato en golf/share).
 *   - "Copiar link"      → `useShare.copyLink` (lib/clipboard) + toast.
 *   - "Más opciones"     → `useShare.native` (navigator.share), solo si existe.
 *
 * Patrón modal tomado de `TournamentBottomSheet` (backdrop, escape, foco).
 */
export function ShareSheet({ open, onClose, payload, onCopied }: ShareSheetProps) {
  const { share, whatsapp, copyLink, native, isSharing } = useShare()
  const [imageUrl, setImageUrl] = useState<string | null>(null)
  const dialogRef = useRef<HTMLDivElement>(null)

  // Preview PNG → objectURL (revocado al cerrar / cambiar imagen).
  useEffect(() => {
    if (!open || !payload.image) {
      setImageUrl(null)
      return
    }
    const url = URL.createObjectURL(payload.image.blob)
    setImageUrl(url)
    return () => URL.revokeObjectURL(url)
  }, [open, payload.image])

  // Escape para cerrar + foco al abrir, restaurado al cerrar.
  useEffect(() => {
    if (!open) return
    const prev = document.activeElement as HTMLElement | null
    // Enfocamos el contenedor del diálogo (no un control) para que Escape funcione
    // sin pintar un focus-ring sobre la X al abrir.
    dialogRef.current?.focus()
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('keydown', onKey)
      prev?.focus?.()
    }
  }, [open, onClose])

  if (!open) return null

  const canNativeShare = typeof navigator !== 'undefined' && 'share' in navigator

  async function handleCopy() {
    const ok = await copyLink(payload.url)
    if (ok) onCopied?.()
  }

  return (
    <>
      {/* Backdrop */}
      <div
        data-testid="share-sheet-backdrop"
        onClick={onClose}
        className="fixed inset-0 z-[240] bg-black/60 backdrop-blur-sm"
      />

      {/* Sheet (siempre-oscuro, paleta vitrina) */}
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label="Compartir"
        tabIndex={-1}
        className="fixed inset-x-0 bottom-0 z-[250] mx-auto w-full max-w-md
                   rounded-t-[26px] px-5 pb-8 pt-3.5 outline-none
                   animate-[slideUp_260ms_ease-out]"
        style={{
          background: '#070d18',
          borderTop: '1px solid rgba(196,153,42,0.18)',
          boxShadow: '0 -20px 50px rgba(0,0,0,0.5)',
        }}
      >
        {/* Cerrar (X) — accesible; el mockup cierra por backdrop/escape, esto suma a11y */}
        <button
          onClick={onClose}
          aria-label="Cerrar"
          className="absolute right-3 top-3 flex h-9 w-9 items-center justify-center rounded-full
                     transition-colors hover:bg-white/5 focus-visible:outline-none
                     focus-visible:ring-2 focus-visible:ring-gold/50"
          style={{ color: '#9fb0c6' }}
        >
          <X className="h-5 w-5" />
        </button>

        {/* Grab handle */}
        <div
          aria-hidden
          className="mx-auto mb-4 h-1 w-9 rounded-full"
          style={{ background: 'rgba(196,153,42,0.4)' }}
        />

        {/* Título */}
        <h2
          className="mb-4 text-center font-display text-xl"
          style={{ color: '#eef2f8' }}
        >
          Compartir
        </h2>

        {/* Vitrina: la tarjeta PNG como héroe con marco hairline dorado */}
        {imageUrl && (
          <div
            className="mx-auto mb-5 w-full max-w-[260px] overflow-hidden rounded-2xl"
            style={{
              border: '1px solid rgba(196,153,42,0.55)',
              boxShadow: '0 10px 30px rgba(0,0,0,0.45)',
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={imageUrl} alt="Vista previa de la tarjeta para compartir" className="block w-full" />
          </div>
        )}

        {/* Stack de acciones (jerarquía DESIGN.md §5) */}
        <div className="space-y-2.5">
          <Button
            variant="commit"
            fullWidth
            loading={isSharing}
            leftIcon={<Share2 className="h-5 w-5" />}
            onClick={() => void share(payload)}
          >
            Compartir imagen
          </Button>

          <Button
            variant="nav"
            fullWidth
            leftIcon={<MessageCircle className="h-5 w-5" />}
            onClick={() => whatsapp(payload)}
          >
            WhatsApp
          </Button>

          <Button
            variant="nav"
            fullWidth
            leftIcon={<LinkIcon className="h-5 w-5" />}
            onClick={handleCopy}
          >
            Copiar link
          </Button>

          {canNativeShare && (
            <Button
              variant="ghost"
              fullWidth
              leftIcon={<MoreVertical className="h-5 w-5" />}
              onClick={() => void native(payload)}
            >
              Más opciones
            </Button>
          )}
        </div>
      </div>
    </>
  )
}
