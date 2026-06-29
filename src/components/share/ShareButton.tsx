'use client'

import { useState, type ReactNode } from 'react'
import { Button } from '@/components/ui/Button'
import { Share2 } from '@/components/icons'
import type { SharePayload } from '@/golf/share/types'
import { ShareSheet } from './ShareSheet'
import { ShareToast } from './ShareToast'

type ButtonVariant = 'commit' | 'nav' | 'ghost' | 'destructive'
type ButtonSize = 'sm' | 'md' | 'lg'

interface ShareButtonProps {
  /** Qué se comparte. */
  payload: SharePayload
  /** Texto del trigger. Default "Compartir". */
  label?: string
  /** Variante del trigger (jerarquía Button). Default "nav". */
  variant?: ButtonVariant
  size?: ButtonSize
  fullWidth?: boolean
  className?: string
  /** Contenido custom del trigger (reemplaza label + icono). */
  children?: ReactNode
}

/**
 * Trigger único de compartir: abre el `ShareSheet` (variante A) y orquesta el
 * toast "Copiado", que vive aquí para sobrevivir al cierre del sheet.
 *
 * Reemplaza a futuro los ~6 botones de compartir divergentes por una sola
 * superficie. Spec: `docs/superpowers/specs/2026-06-17-compartir-unificado-design.md`.
 */
export function ShareButton({
  payload,
  label = 'Compartir',
  variant = 'nav',
  size = 'md',
  fullWidth = false,
  className,
  children,
}: ShareButtonProps) {
  const [open, setOpen] = useState(false)
  const [copied, setCopied] = useState(false)

  return (
    <>
      <Button
        variant={variant}
        size={size}
        fullWidth={fullWidth}
        className={className}
        leftIcon={children ? undefined : <Share2 className="h-5 w-5" />}
        onClick={() => setOpen(true)}
      >
        {children ?? label}
      </Button>

      <ShareSheet
        open={open}
        onClose={() => setOpen(false)}
        payload={payload}
        onCopied={() => {
          setOpen(false)
          setCopied(true)
        }}
      />

      <ShareToast show={copied} onDismiss={() => setCopied(false)} />
    </>
  )
}
