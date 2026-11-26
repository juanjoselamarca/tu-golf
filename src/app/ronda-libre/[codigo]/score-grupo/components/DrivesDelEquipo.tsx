'use client'

import { Fragment } from 'react'
import type { ConteoDeDrivesDeJugador } from '@/golf/formats/drives-scramble'
import type { ScorerTheme } from '@/components/ronda/scorer-theme'

interface DrivesDelEquipoProps {
  /** Los jugadores del equipo, en orden (`drive_jugadores`). */
  jugadores: readonly string[]
  /** Índice del jugador con el drive del hoyo en pantalla, o `null`. */
  driveDelHoyo: number | null
  /** `conteoDeDrives` (fuente única del conteo). */
  conteo: readonly ConteoDeDrivesDeJugador[]
  minimo: number | null
  /** `textoAvisoDeDrives`, o `null` sin riesgo. */
  aviso: string | null
  onElegir: (posicion: number) => void
  deshabilitado?: boolean
  theme: ScorerTheme
}

/**
 * Drives del scramble en la tarjeta del equipo: «Drive de:» con un botón por jugador (tocar el marcado lo quita) y,
 * siempre a la vista, cuántos drives lleva cada uno; el que va bajo el mínimo destacado, el que cumplió con ✓.
 */
export function DrivesDelEquipo({ jugadores, driveDelHoyo, conteo, minimo, aviso, onElegir, deshabilitado, theme }: DrivesDelEquipoProps) {
  return (
    <div style={{ marginTop: '12px', paddingTop: '10px', borderTop: `1px solid ${theme.border}` }}>
      <div style={{ fontSize: '12px', fontWeight: 600, color: theme.textMuted, marginBottom: '6px' }}>Drive de:</div>
      <div role="group" aria-label="Drive de" style={{ display: 'grid', gridTemplateColumns: `repeat(${jugadores.length}, minmax(0, 1fr))`, gap: '6px' }}>
        {jugadores.map((nombre, i) => {
          const elegido = driveDelHoyo === i
          return (
            <button
              key={`drive-${i}`}
              type="button"
              aria-pressed={elegido}
              disabled={deshabilitado}
              onClick={() => onElegir(i)}
              style={{
                minHeight: '48px', padding: '4px 6px', borderRadius: '12px',
                fontSize: '14px', fontWeight: elegido ? 700 : 600, lineHeight: 1.15,
                background: elegido ? theme.gold : 'var(--bg)',
                color: elegido ? 'var(--brand-dark)' : theme.text,
                border: elegido ? `2px solid ${theme.gold}` : `1px solid ${theme.buttonBorder}`,
                cursor: deshabilitado ? 'default' : 'pointer', opacity: deshabilitado ? 0.5 : 1,
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                touchAction: 'manipulation', userSelect: 'none',
              }}
            >
              {nombre}
            </button>
          )
        })}
      </div>
      <div
        data-testid="conteo-drives"
        style={{ marginTop: '8px', fontSize: '13px', lineHeight: 1.4, color: theme.textMuted, display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', columnGap: '6px' }}
      >
        {minimo != null && <span style={{ fontSize: '11px', color: theme.textFaint }}>Mín. {minimo}:</span>}
        {/* Los espacios entre ítems no se ven (flex con columnGap) pero el lector de pantalla y el texto los tienen. */}
        {conteo.map((c, i) => (
          <Fragment key={`conteo-${c.posicion}`}>
          {' '}
          <span style={{ whiteSpace: 'nowrap' }}>
            <span
              data-bajo-minimo={c.faltan > 0 ? 'true' : undefined}
              style={c.faltan > 0 ? { color: 'var(--brand-on-bg)', fontWeight: 700 } : { color: theme.text }}
            >
              {c.nombre} {c.drives}{c.cumple ? ' ✓' : ''}
            </span>
            {i < conteo.length - 1 && <span aria-hidden="true" style={{ color: theme.textFaint }}> ·</span>}
          </span>
          </Fragment>
        ))}
      </div>
      {aviso && (
        <div role="status" style={{ marginTop: '6px', fontSize: '12px', fontWeight: 600, color: 'var(--error-fg)' }}>{aviso}</div>
      )}
    </div>
  )
}
