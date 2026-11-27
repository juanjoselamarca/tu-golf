'use client'

import type { KeyboardEvent } from 'react'

export type PestanaDeLaTimba = 'tarjeta' | 'juego'

const ETIQUETA: Record<PestanaDeLaTimba, string> = { tarjeta: 'Tarjeta', juego: 'Juego' }
/** Las mismas pestañas en el scorer de un formato por equipos (Juanjo, 26-nov: «como en la Timba»). */
export const ETIQUETAS_DE_EQUIPOS: Record<PestanaDeLaTimba, string> = { tarjeta: 'Anotar', juego: 'Tabla en vivo' }
export const PANEL_DE_PESTANA = (p: PestanaDeLaTimba) => `panel-timba-${p}`
const ID_DE_PESTANA = (p: PestanaDeLaTimba) => `pestana-timba-${p}`

/**
 * Pestañas Tarjeta | Juego de una Timba libre (maqueta ScorerC). Blancos de 44 px, segmentado sobre la superficie
 * suave; la activa en la superficie principal y en negrita (no depende solo del color). El scorer de equipos las usa
 * con `ETIQUETAS_DE_EQUIPOS` (Anotar | Tabla en vivo).
 */
export function PestanasDeLaTimba({ activa, onCambiar, etiquetas = ETIQUETA }: {
  activa: PestanaDeLaTimba
  onCambiar: (p: PestanaDeLaTimba) => void
  etiquetas?: Record<PestanaDeLaTimba, string>
}) {
  const pestanas: PestanaDeLaTimba[] = ['tarjeta', 'juego']
  const alTeclear = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return
    e.preventDefault()
    const otra = activa === 'tarjeta' ? 'juego' : 'tarjeta'
    onCambiar(otra)
    document.getElementById(ID_DE_PESTANA(otra))?.focus()
  }
  return (
    <div
      role="tablist"
      aria-label="Vista"
      onKeyDown={alTeclear}
      style={{
        display: 'flex', gap: '4px', padding: '4px', borderRadius: '12px',
        background: 'var(--surface-soft)', border: '1px solid var(--border)',
      }}
    >
      {pestanas.map(p => {
        const seleccionada = p === activa
        return (
          <button
            key={p}
            id={ID_DE_PESTANA(p)}
            type="button"
            role="tab"
            aria-selected={seleccionada}
            aria-controls={PANEL_DE_PESTANA(p)}
            tabIndex={seleccionada ? 0 : -1}
            onClick={() => onCambiar(p)}
            style={{
              flex: 1, minHeight: '44px', border: 0, borderRadius: '9px', cursor: 'pointer', touchAction: 'manipulation',
              background: seleccionada ? 'var(--bg-surface)' : 'transparent',
              boxShadow: seleccionada ? 'var(--shadow-sm)' : 'none',
              color: seleccionada ? 'var(--text)' : 'var(--text-2)',
              fontFamily: 'inherit', fontSize: '15px', fontWeight: seleccionada ? 700 : 600,
            }}
          >
            {etiquetas[p]}
          </button>
        )
      })}
    </div>
  )
}
