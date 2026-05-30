// src/app/torneo/[slug]/components/TournamentEmptyState.tsx
//
// Estado vacío: o no hay jugadores inscritos, o no se encontró el torneo
// (slug inválido). Mensaje neutro, sin acción primaria — el organizador
// ya tiene su propio dashboard para inscribir.

import { Users } from '@/components/icons'

export interface TournamentEmptyStateProps {
  tournamentFound: boolean
}

export function TournamentEmptyState({ tournamentFound }: TournamentEmptyStateProps) {
  return (
    <div style={{ textAlign: 'center', padding: '60px 20px', color: '#4a5568' }}>
      <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '16px' }}>
        <Users size={48} strokeWidth={1.5} />
      </div>
      <div style={{ fontSize: '18px', color: '#1a1a2e', marginBottom: '8px' }}>
        {tournamentFound ? 'Sin jugadores inscritos aún' : 'Torneo no encontrado'}
      </div>
      <div style={{ fontSize: '14px' }}>
        {tournamentFound
          ? 'El organizador está preparando el torneo.'
          : 'Verifica el link o vuelve al inicio.'}
      </div>
    </div>
  )
}
