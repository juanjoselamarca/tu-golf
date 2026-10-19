'use client'

import { generarOrdenHoyos } from '@/lib/ronda/helpers'
import type { Jugador } from '@/types/ronda'

interface PlayerSelectorScreenProps {
  jugadores: Jugador[]
  /** HCP a mostrar (course handicap COMPLETO, 18h); sin entrada = sin índice, no se muestra. */
  playerDisplayHcp?: Record<string, number>
  scores: Record<string, Record<number, number>>
  hoyoInicio: number
  holes: number
  onSelect: (jugadorId: string, firstEmptyHole: number) => void
}

export function PlayerSelectorScreen({ jugadores, playerDisplayHcp, scores, hoyoInicio, holes, onSelect }: PlayerSelectorScreenProps) {
  return (
    <div style={{ minHeight: '100dvh', background: 'var(--bg-surface)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '24px' }}>
      <h1 style={{ fontFamily: '"Playfair Display", serif', fontSize: '22px', fontWeight: 700, color: 'var(--text)', marginBottom: '8px' }}>
        Quien eres?
      </h1>
      <p style={{ fontSize: '14px', color: 'var(--text-2)', marginBottom: '24px' }}>
        Selecciona tu nombre para marcar tu score
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', width: '100%', maxWidth: '360px' }}>
        {jugadores.map(j => (
          <button key={j.id} onClick={() => {
            // Jump to first empty hole for this player
            const ex = scores[j.id] ?? {}
            const orden = generarOrdenHoyos(hoyoInicio, holes)
            const firstEmpty = orden.find(h => ex[h] == null)
            const firstHole = firstEmpty != null ? firstEmpty : orden[0]
            onSelect(j.id, firstHole)
          }} style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '16px 20px', background: 'var(--bg-surface)', border: '1px solid var(--border)',
            borderRadius: '12px', cursor: 'pointer', width: '100%', textAlign: 'left',
          }}>
            <div>
              <div style={{ fontSize: '16px', fontWeight: 600, color: 'var(--text)' }}>{j.nombre}</div>
              {/* Sin entrada en el HCP a mostrar (jugador sin índice, #511): no se inventa un 0. */}
              {playerDisplayHcp?.[j.id] != null && (
                <div style={{ fontSize: '13px', color: 'var(--text-3)' }}>HCP {playerDisplayHcp[j.id]}</div>
              )}
            </div>
            <span style={{ color: 'var(--brand-on-bg)', fontSize: '20px' }}>{'→'}</span>
          </button>
        ))}
      </div>
    </div>
  )
}
