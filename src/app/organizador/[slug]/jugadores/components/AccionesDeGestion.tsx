'use client'

// src/app/organizador/[slug]/jugadores/components/AccionesDeGestion.tsx
//
// Acciones poco frecuentes del torneo antes de iniciarlo, al final de la página
// (no en la barra fija): "Eliminar torneo" en borrador y "Volver a borrador" con
// inscripciones abiertas. Una acción destructiva no va en una barra fija que se
// toca con el pulgar entre otras cosas, y la barra tapaba media pantalla con
// ellas (inbox 16-nov). En 'open' no hay "Eliminar": primero se vuelve a
// borrador (un paso extra para lo destructivo). Ambas piden confirmación
// (`ConfirmModal` vía `useTournamentLifecycle`).

interface Props {
  tournamentStatus: string
  opening: boolean
  onCancel: () => void
  onRevertToDraft: () => void
}

export function AccionesDeGestion({ tournamentStatus, opening, onCancel, onRevertToDraft }: Props) {
  if (tournamentStatus !== 'draft' && tournamentStatus !== 'open') return null
  const esBorrador = tournamentStatus === 'draft'

  return (
    <div style={{ display: 'flex', justifyContent: 'center', marginTop: '32px' }}>
      {esBorrador ? (
        <button
          type="button"
          onClick={onCancel}
          style={{
            background: 'transparent',
            color: 'var(--error-fg)',
            fontWeight: 600,
            fontSize: '14px',
            padding: '12px 20px',
            minHeight: '44px',
            borderRadius: '8px',
            border: '1px solid var(--error-border)',
            cursor: 'pointer',
          }}
        >
          Eliminar torneo
        </button>
      ) : (
        <button
          type="button"
          onClick={onRevertToDraft}
          disabled={opening}
          style={{
            background: 'transparent',
            color: 'var(--text-2)',
            fontWeight: 600,
            fontSize: '14px',
            padding: '12px 20px',
            minHeight: '44px',
            borderRadius: '8px',
            border: '1px solid var(--border-md)',
            cursor: opening ? 'not-allowed' : 'pointer',
          }}
        >
          {opening ? 'Volviendo...' : 'Volver a borrador'}
        </button>
      )}
    </div>
  )
}
