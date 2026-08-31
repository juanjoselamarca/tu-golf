'use client'

// src/app/torneo/[slug]/components/DuplicateTournamentButton.tsx
//
// CTA post-cierre para el organizador: duplicar el torneo como draft nuevo.
// Solo visible si el torneo está cerrado Y el viewer es el organizer_id.

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { captureError } from '@/lib/error-tracking'

interface Props {
  tournamentId: string
}

export function DuplicateTournamentButton({ tournamentId }: Props) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleDuplicate() {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/torneos/draft/duplicate-from/${tournamentId}`, {
        method: 'POST',
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? 'No se pudo duplicar el torneo')
        return
      }
      router.push(`/organizador/nuevo?draft=${data.draft.id}`)
    } catch (err) {
      captureError(err, { context: 'DuplicateTournamentButton', meta: { tournamentId } })
      setError('Error de conexion. Intenta de nuevo.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px' }}>
      <button
        onClick={handleDuplicate}
        disabled={loading}
        className="dark:border-amber-700/50 dark:text-amber-500 dark:hover:bg-amber-500/10"
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '6px',
          padding: '10px 20px',
          borderRadius: '10px',
          border: '1px solid rgba(196,153,42,0.4)',
          background: 'transparent',
          color: 'var(--brand-gold, #c4992a)',
          fontFamily: "var(--font-dm-sans, 'DM Sans', system-ui, sans-serif)",
          fontSize: '14px',
          fontWeight: 600,
          cursor: loading ? 'not-allowed' : 'pointer',
          opacity: loading ? 0.6 : 1,
          transition: 'background 0.15s',
          minHeight: '44px',
        }}
      >
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
          <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
        </svg>
        {loading ? 'Creando...' : 'Crear otro igual'}
      </button>
      {error && (
        <span style={{ fontSize: '12px', color: '#dc2626' }}>{error}</span>
      )}
    </div>
  )
}
