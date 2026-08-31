// src/app/torneo/[slug]/components/TournamentEmptyState.tsx
//
// Estado vacio: no hay scores registrados aun. Mensaje neutro y esperanzador.

export interface TournamentEmptyStateProps {
  tournamentFound: boolean
}

export function TournamentEmptyState({ tournamentFound }: TournamentEmptyStateProps) {
  return (
    <div
      className="dark:text-gray-400"
      style={{
        textAlign: 'center',
        padding: '48px 20px',
        color: 'var(--text-3, #6B7280)',
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'center',
          marginBottom: '16px',
        }}
      >
        {/* Icono de bandera de golf -- sutil, no triste */}
        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--brand-gold, #c4992a)', opacity: 0.5 }}>
          <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" />
          <line x1="4" y1="22" x2="4" y2="15" />
        </svg>
      </div>
      <div
        className="dark:text-gray-300"
        style={{
          fontSize: '16px',
          color: 'var(--text, #1a1d24)',
          marginBottom: '6px',
          fontWeight: 600,
        }}
      >
        {tournamentFound ? 'Aun no hay scores registrados' : 'Torneo no encontrado'}
      </div>
      <div style={{ fontSize: '14px' }}>
        {tournamentFound
          ? 'Los resultados apareceran cuando los jugadores comiencen a jugar.'
          : 'Verifica el link o vuelve al inicio.'}
      </div>
    </div>
  )
}
