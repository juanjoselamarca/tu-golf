'use client'

import type { ScorerTheme } from '@/components/ronda/scorer-theme'

interface GrupoHoleInfoRowProps {
  par: number
  strokeIndex: number
  /** Yardaje del tee de referencia (el del admin si juega; si no, el de la ronda). */
  yardaje: number | null
  showNetStableford: boolean
  /** Máximo de golpes recibidos entre los jugadores en este hoyo. */
  maxStrokes: number
  theme: ScorerTheme
}

/** Fila PAR / SI / YDS (+ GOLPES en neto/stableford) del scorer de grupo. */
export function GrupoHoleInfoRow({ par, strokeIndex, yardaje, showNetStableford, maxStrokes, theme }: GrupoHoleInfoRowProps) {
  const cols = [
    { label: 'PAR', value: String(par) },
    { label: 'SI', value: String(strokeIndex) },
    // Sin yardaje auditado la columna no se dibuja. Un "—" fijo se come un
    // tercio de la fila sin decir nada, y hoy NINGUNA cancha tiene yardajes
    // verificados: el guión era lo único que veía el 100 % de los jugadores.
    ...(yardaje ? [{ label: 'YDS', value: String(yardaje) }] : []),
  ]
  return (
    // Una columna nunca pasa de un tercio de la fila, y el grupo va centrado:
    // con dos columnas (stroke play bruto sin yardaje) repartirlas al 50 % dejaba
    // "PAR 4" solo en 195 px. Con tres queda igual que siempre y con cuatro el
    // flex las encoge a un cuarto.
    <div style={{ display: 'flex', justifyContent: 'center', borderBottom: `1px solid ${theme.border}`, background: 'var(--bg-surface)', flexShrink: 0 }}>
      {cols.map((col, i, arr) => (
        <div key={col.label} style={{
          flex: 1, maxWidth: '33.333%', textAlign: 'center', padding: '6px 2px',
          borderRight: i < arr.length - 1 || showNetStableford ? `1px solid ${theme.border}` : 'none',
        }}>
          <div style={{ fontSize: '8px', fontWeight: 600, color: theme.textFaint, letterSpacing: '0.07em', textTransform: 'uppercase' as const, marginBottom: '1px' }}>{col.label}</div>
          <div style={{ fontSize: '15px', fontWeight: 600, color: theme.text }}>{col.value}</div>
        </div>
      ))}
      {showNetStableford && (
        <div style={{ flex: 1, maxWidth: '33.333%', textAlign: 'center', padding: '6px 2px' }}>
          <div style={{ fontSize: '8px', fontWeight: 600, color: theme.textFaint, letterSpacing: '0.07em', textTransform: 'uppercase' as const, marginBottom: '1px' }}>GOLPES</div>
          <div style={{ fontSize: '15px', fontWeight: 600, color: 'var(--brand-on-bg)' }}>{maxStrokes > 0 ? `+${maxStrokes}` : '0'}</div>
        </div>
      )}
    </div>
  )
}
