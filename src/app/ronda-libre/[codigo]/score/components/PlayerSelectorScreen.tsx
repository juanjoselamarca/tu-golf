'use client'

import { generarOrdenHoyos } from '@/lib/ronda/helpers'
import type { Jugador } from '@/types/ronda'

interface PlayerSelectorScreenProps {
  jugadores: Jugador[]
  playerHcp: Record<string, number>
  scores: Record<string, Record<number, number>>
  hoyoInicio: number
  holes: number
  onSelect: (jugadorId: string, firstEmptyHole: number) => void
}

export function PlayerSelectorScreen({ jugadores, playerHcp, scores, hoyoInicio, holes, onSelect }: PlayerSelectorScreenProps) {
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
              {playerHcp[j.id] != null && (
                <div style={{ fontSize: '13px', color: 'var(--text-3)' }}>HCP {playerHcp[j.id]}</div>
              )}
            </div>
            <span style={{ color: '#c4992a', fontSize: '20px' }}>{'→'}</span>
          </button>
        ))}
      </div>
    </div>
  )
}
