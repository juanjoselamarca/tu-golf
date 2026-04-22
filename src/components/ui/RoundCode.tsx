'use client'

import { useState } from 'react'
import { Copy, Check } from '@/components/icons'
import { formatRoundCodeForDisplay } from '@/lib/round-code'

interface RoundCodeProps {
  code: string
  size?: 'md' | 'lg' | 'xl'
  copyable?: boolean
  className?: string
}

const SIZES = {
  md: 'text-3xl tracking-[0.15em]',
  lg: 'text-5xl tracking-[0.15em]',
  xl: 'text-6xl tracking-[0.18em]',
} as const

/**
 * Display de código de ronda con mono clara (DM Mono) + separador visual.
 * Audit 2026-04-22 P3 + H13.
 *
 * - Usa DM Mono (no serif display) para evitar I/1 ambigüedad.
 * - Separa en grupos de 3 chars para facilitar dictado en cancha.
 * - Opcional tap-to-copy con feedback visual.
 */
export function RoundCode({
  code,
  size = 'lg',
  copyable = true,
  className = '',
}: RoundCodeProps) {
  const [copied, setCopied] = useState(false)

  async function handleCopy() {
    if (!copyable || typeof navigator === 'undefined' || !navigator.clipboard) return
    try {
      await navigator.clipboard.writeText(code)
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    } catch {
      // fallback silencioso
    }
  }

  const display = formatRoundCodeForDisplay(code)
  const sizeClass = SIZES[size]

  const content = (
    <span
      className={`font-bold text-brand ${sizeClass} ${className}`}
      style={{ fontFamily: 'var(--font-dm-mono), ui-monospace, monospace' }}
    >
      {display}
    </span>
  )

  if (!copyable) return content

  return (
    <button
      type="button"
      onClick={handleCopy}
      className="inline-flex items-center gap-3 group transition-opacity hover:opacity-80 active:opacity-60"
      aria-label={copied ? 'Código copiado' : `Copiar código ${code}`}
    >
      {content}
      <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-white/5 text-muted group-hover:text-brand transition-colors">
        {copied ? <Check className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4" />}
      </span>
    </button>
  )
}
