'use client'

import { AlertTriangle } from 'lucide-react'
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
  /** Se intentó avanzar sin marcar el drive del hoyo: «Drive de» se destaca y lo pide. */
  falta?: boolean
  onElegir: (posicion: number) => void
  deshabilitado?: boolean
  theme: ScorerTheme
}

/**
 * Drives del scramble en la tarjeta del equipo: «Drive de» con un botón por jugador (tocar el marcado lo quita).
 * Cada botón lleva cuántos drives suma ese jugador; al llegar al mínimo, un ✓ verde. El riesgo de no cumplir va
 * como aviso con ícono, no como texto rojo (Juanjo, 26-nov: el contador iba suelto abajo y en rojo).
 * Sin el drive del hoyo no se avanza (`falta`): el bloque se marca en rojo suave y dice qué falta.
 */
export function DrivesDelEquipo({ jugadores, driveDelHoyo, conteo, minimo, aviso, falta, onElegir, deshabilitado, theme }: DrivesDelEquipoProps) {
  const resumen = `${minimo != null ? `Mín. ${minimo}: ` : ''}${conteo.map(c => `${c.nombre} ${c.drives}${c.cumple ? ' ✓' : ''}`).join(' · ')}`
  return (
    <div
      data-falta-drive={falta ? 'true' : undefined}
      style={falta
        ? { marginTop: '12px', padding: '10px', borderRadius: '12px', border: '1px solid var(--error-border)', background: 'var(--error-bg)' }
        : { marginTop: '12px', paddingTop: '10px', borderTop: `1px solid ${theme.border}` }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '8px', marginBottom: '6px' }}>
        <span style={{ fontSize: '12px', fontWeight: 600, color: falta ? 'var(--error-fg)' : theme.textMuted }}>Drive de:</span>
        {minimo != null && <span aria-hidden="true" style={{ fontSize: '12px', color: theme.textMuted }}>Mín. {minimo} c/u</span>}
      </div>
      <div role="group" aria-label="Drive de" style={{ display: 'grid', gridTemplateColumns: `repeat(${jugadores.length}, minmax(0, 1fr))`, gap: '6px' }}>
        {jugadores.map((nombre, i) => {
          const elegido = driveDelHoyo === i
          const c = conteo.find(x => x.posicion === i)
          return (
            <button
              key={`drive-${i}`}
              type="button"
              aria-label={nombre}
              aria-pressed={elegido}
              disabled={deshabilitado}
              onClick={() => onElegir(i)}
              style={{
                minHeight: '56px', padding: '6px 6px 5px', borderRadius: '12px',
                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'space-between', gap: '2px',
                fontSize: '13px', fontWeight: elegido ? 700 : 600, lineHeight: 1.15,
                background: elegido ? theme.gold : 'var(--bg)',
                color: elegido ? 'var(--brand-dark)' : theme.text,
                border: elegido ? `2px solid ${theme.gold}` : `1px solid ${falta ? 'var(--error-border)' : theme.buttonBorder}`,
                cursor: deshabilitado ? 'default' : 'pointer', opacity: deshabilitado ? 0.5 : 1,
                whiteSpace: 'normal',
                touchAction: 'manipulation', userSelect: 'none',
              }}
            >
              {/* Nombres largos: hasta 2 líneas («Juan Pablo» y «Juan Pedro» no quedan iguales por un corte). */}
              <span style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', overflowWrap: 'anywhere' }}>{nombre}</span>
              {c && (
                <span
                  aria-hidden="true"
                  data-cumple={c.cumple ? 'true' : undefined}
                  style={{
                    fontSize: '12px', fontWeight: 600, fontVariantNumeric: 'tabular-nums',
                    color: elegido ? 'var(--brand-dark)' : c.cumple ? 'var(--status-live-fg)' : theme.textMuted,
                  }}
                >
                  {c.drives}{c.cumple ? ' ✓' : ''}
                </span>
              )}
            </button>
          )
        })}
      </div>
      {/* El conteo de los botones, en texto para el lector de pantalla (los números van aria-hidden). */}
      <span data-testid="conteo-drives" className="sr-only">{resumen}</span>
      {falta && (
        <div role="alert" style={{ marginTop: '8px', fontSize: '13px', fontWeight: 600, color: 'var(--error-fg)' }}>
          Marca de quién fue el drive para seguir
        </div>
      )}
      {aviso && (
        <div role="status" style={{ marginTop: '8px', display: 'flex', alignItems: 'flex-start', gap: '6px', fontSize: '12px', lineHeight: 1.35, color: theme.textMuted }}>
          <AlertTriangle aria-hidden="true" size={14} strokeWidth={2.25} style={{ flexShrink: 0, marginTop: '1px', color: 'var(--brand-on-bg)' }} />
          <span>{aviso}</span>
        </div>
      )}
    </div>
  )
}
