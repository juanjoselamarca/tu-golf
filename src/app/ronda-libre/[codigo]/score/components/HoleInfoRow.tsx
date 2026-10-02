'use client'

import type { ScorerTheme } from '@/components/ronda/scorer-theme'

interface HoleInfoRowProps {
  par: number
  strokeIndex: number
  /** Yardaje del tee del jugador, o `null` si no está verificado. */
  yardaje: number | null
  /** Columna GOLPES (neto/stableford, salvo stroke play neto). */
  showStrokes: boolean
  strokesOnHole: number
  onShare: () => void
  theme: ScorerTheme
}

/** Fila PAR / SI / YDS (+ GOLPES) con el botón de compartir. */
export function HoleInfoRow({ par, strokeIndex, yardaje, showStrokes, strokesOnHole, onShare, theme }: HoleInfoRowProps) {
  const cols = [
    { label: 'PAR', value: String(par) },
    { label: 'SI', value: String(strokeIndex) },
    { label: 'YDS', value: yardaje ? String(yardaje) : '—' },
    ...(showStrokes ? [{ label: 'GOLPES', value: strokesOnHole > 0 ? `+${strokesOnHole}` : '0' }] : []),
  ]
  return (
    <div style={{ display: 'flex', borderBottom: `1px solid ${theme.border}`, background: 'var(--bg-surface)', flexShrink: 0 }}>
      {cols.map((col) => (
        <div key={col.label} style={{
          flex: 1, textAlign: 'center', padding: '8px 2px',
          borderRight: `1px solid ${theme.border}`,
        }}>
          <div style={{ fontSize: '9px', fontWeight: 600, color: col.label === 'GOLPES' ? 'var(--brand-on-bg)' : theme.textFaint, letterSpacing: '0.07em', textTransform: 'uppercase' as const, marginBottom: '2px' }}>{col.label}</div>
          <div style={{ fontSize: '16px', fontWeight: 600, color: col.label === 'GOLPES' && strokesOnHole > 0 ? 'var(--brand-on-bg)' : theme.text }}>{col.value}</div>
        </div>
      ))}
      <button onClick={onShare} aria-label="Compartir" style={{
        padding: '8px 14px', background: 'none', border: 'none', cursor: 'pointer',
        display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
      }}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={theme.textFaint} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><polyline points="16 6 12 2 8 6"/><line x1="12" y1="2" x2="12" y2="15"/></svg>
      </button>
    </div>
  )
}
