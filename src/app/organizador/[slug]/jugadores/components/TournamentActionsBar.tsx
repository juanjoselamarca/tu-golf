'use client'

import { useRouter } from 'next/navigation'

interface Props {
  tournamentStatus: string
  slug: string
  playersCount: number
  starting: boolean
  closing: boolean
  allRoundsClosed: boolean
  onStart: () => void
  onCancel: () => void
  onClose: () => void
}

/** Barra de acciones fija inferior: cambia según estado del torneo
 *  (draft → eliminar/iniciar; in_progress → salida/scoring/cerrar;
 *  closed → leaderboard). Extraído verbatim de JugadoresPanel. */
export function TournamentActionsBar({
  tournamentStatus, slug, playersCount, starting, closing, allRoundsClosed,
  onStart, onCancel, onClose,
}: Props) {
  const router = useRouter()

  return (
    <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, background: 'var(--bg)', borderTop: '1px solid var(--border-md)', padding: '16px 24px', paddingBottom: 'calc(16px + env(safe-area-inset-bottom, 0px))', display: 'flex', flexWrap: 'wrap', justifyContent: 'center', alignItems: 'center', gap: '12px', zIndex: 50 }}>
      {tournamentStatus === 'draft' && (
        <>
          <button
            onClick={onCancel}
            style={{
              background: 'rgba(220,38,38,0.1)',
              color: '#fca5a5',
              fontWeight: 600,
              fontSize: '14px',
              padding: '14px 24px',
              borderRadius: '8px',
              border: '1px solid rgba(220,38,38,0.25)',
              cursor: 'pointer',
              transition: 'all 200ms',
              whiteSpace: 'nowrap',
              flexShrink: 0,
            }}
          >
            Eliminar torneo
          </button>
          <button
            onClick={onStart}
            disabled={playersCount < 1 || starting}
            style={{
              background: playersCount >= 1 ? '#c4992a' : 'rgba(122,143,168,0.2)',
              color: playersCount >= 1 ? '#1a1a2e' : 'var(--text-2)',
              fontWeight: 700,
              fontSize: '16px',
              padding: '14px 40px',
              borderRadius: '8px',
              border: 'none',
              cursor: playersCount < 1 || starting ? 'not-allowed' : 'pointer',
              transition: 'all 200ms',
              minWidth: '200px',
              whiteSpace: 'nowrap',
              flexShrink: 0,
            }}
          >
            {starting ? 'Iniciando...' : `Iniciar torneo (${playersCount} jugador${playersCount !== 1 ? 'es' : ''})`}
          </button>
        </>
      )}

      {tournamentStatus === 'in_progress' && (
        <>
          <button
            onClick={() => router.push(`/organizador/${slug}/salida`)}
            style={{
              background: 'rgba(196,153,42,0.12)',
              color: 'var(--brand-on-bg)',
              fontWeight: 600,
              fontSize: '14px',
              padding: '14px 20px',
              borderRadius: '8px',
              border: '1px solid var(--border-md)',
              cursor: 'pointer',
              transition: 'all 200ms',
              whiteSpace: 'nowrap',
              flexShrink: 0,
            }}
          >
            Hoja de salida
          </button>
          <button
            onClick={() => router.push(`/organizador/${slug}/scoring`)}
            style={{
              background: '#1a4fd6',
              color: 'white',
              fontWeight: 700,
              fontSize: '16px',
              padding: '14px 30px',
              borderRadius: '8px',
              border: 'none',
              cursor: 'pointer',
              transition: 'all 200ms',
              whiteSpace: 'nowrap',
              flexShrink: 0,
            }}
          >
            Ver scoring
          </button>
          {allRoundsClosed && (
            <button
              onClick={onClose}
              disabled={closing}
              style={{
                background: 'rgba(220,38,38,0.15)',
                color: '#fca5a5',
                fontWeight: 700,
                fontSize: '16px',
                padding: '14px 30px',
                borderRadius: '8px',
                border: '1px solid rgba(220,38,38,0.3)',
                cursor: closing ? 'not-allowed' : 'pointer',
                transition: 'all 200ms',
                whiteSpace: 'nowrap',
                flexShrink: 0,
              }}
            >
              {closing ? 'Cerrando...' : 'Cerrar torneo'}
            </button>
          )}
        </>
      )}

      {tournamentStatus === 'closed' && (
        <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', alignItems: 'center', gap: '16px' }}>
          <span style={{ color: 'var(--text-2)', fontSize: '14px', fontWeight: 600, textAlign: 'center' }}>
            Torneo cerrado — Resultados definitivos
          </span>
          <button
            onClick={() => window.open(`/torneo/${slug}`, '_blank')}
            style={{
              background: '#c4992a',
              color: '#1a1a2e',
              fontWeight: 700,
              fontSize: '14px',
              padding: '12px 24px',
              borderRadius: '8px',
              border: 'none',
              cursor: 'pointer',
              whiteSpace: 'nowrap',
              flexShrink: 0,
            }}
          >
            Ver leaderboard
          </button>
        </div>
      )}
    </div>
  )
}
