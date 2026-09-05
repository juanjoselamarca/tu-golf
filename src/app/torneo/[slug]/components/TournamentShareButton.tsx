'use client'

// src/app/torneo/[slug]/components/TournamentShareButton.tsx
//
// Botón de compartir para la vista pública del torneo. Usa el hook canónico
// `useShare` (cascada: navigator.share → wa.me → clipboard). En mobile muestra
// solo el icono (touch target >= 44px); en desktop muestra "Compartir".

import { useCallback, useState } from 'react'
import { useShare } from '@/components/share/useShare'
import { SITE_URL } from '@/lib/site-url'

interface Props {
  slug: string
  tournamentName: string
  status: string | null
}

const STATUS_LABELS: Record<string, string> = {
  open: 'Inscripciones abiertas',
  in_progress: 'En vivo',
  closed: 'Finalizado',
  published: 'Resultados publicados',
  draft: 'Borrador',
}

function ShareIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
      <polyline points="16 6 12 2 8 6" />
      <line x1="12" y1="2" x2="12" y2="15" />
    </svg>
  )
}

export function TournamentShareButton({ slug, tournamentName, status }: Props) {
  const { share, isSharing } = useShare()
  const [toast, setToast] = useState(false)

  const handleShare = useCallback(async () => {
    const url = `${SITE_URL}/torneo/${slug}`
    const statusText = status ? STATUS_LABELS[status] ?? '' : ''
    const text = statusText
      ? `${tournamentName} - ${statusText} en Golfers+`
      : `${tournamentName} en Golfers+`

    const result = await share({ title: tournamentName, text, url })
    if (result.ok && (result.method === 'clipboard' || result.method === 'download')) {
      setToast(true)
      setTimeout(() => setToast(false), 2000)
    }
  }, [share, slug, tournamentName, status])

  return (
    <button
      type="button"
      onClick={handleShare}
      disabled={isSharing}
      aria-label="Compartir torneo"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '6px',
        background: toast ? 'rgba(34,197,94,0.12)' : 'rgba(196,153,42,0.08)',
        border: `1px solid ${toast ? 'rgba(34,197,94,0.3)' : 'rgba(196,153,42,0.2)'}`,
        color: toast ? '#22c55e' : 'var(--brand-on-bg)',
        padding: '10px',
        borderRadius: '10px',
        fontSize: '13px',
        fontWeight: 600,
        cursor: isSharing ? 'wait' : 'pointer',
        transition: 'all 200ms',
        minWidth: '44px',
        minHeight: '44px',
        justifyContent: 'center',
        flexShrink: 0,
      }}
    >
      <ShareIcon />
      {/* Desktop: show text; Mobile: icon only (CSS media query via className) */}
      <span className="hidden sm:inline">
        {toast ? 'Copiado' : 'Compartir'}
      </span>
    </button>
  )
}
