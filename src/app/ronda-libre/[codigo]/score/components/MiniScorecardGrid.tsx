'use client'

import type React from 'react'
import type { HoleData } from '@/types/ronda'

/**
 * Mini scorecard horizontal con indicadores PGA (eagle, birdie, bogey, etc.)
 * + bloque OUT/IN/TOT al final. Pura presentación — toda la lógica de scoring
 * vive en el caller (page.tsx) via props.
 *
 * Renderiza front 9 + back 9 (si totalHoles > 9) + columna gross/net total.
 * El cell render se duplica para front/back para preservar el orden de DOM
 * exacto (no extraer a sub-componente hasta tests visuales).
 */

interface ThemeTokens {
  border: string
  textFaint: string
  textMuted: string
  badgeBg: string
  badgeBorder: string
}

interface MiniScorecardGridProps {
  totalHoles: number
  scores: Record<string, Record<number, number>>
  activeJugadorId: string | null
  parMap: Record<number, number>
  holeDataMap: Record<number, HoleData>
  currentHole: number
  setCurrentHole: React.Dispatch<React.SetStateAction<number>>
  modoJuego: 'gross' | 'neto'
  hasStrokeAdvantage: (si: number) => boolean
  totalGross: number
  totalNet: number
  showNet: boolean
  progressRowRef: React.RefObject<HTMLDivElement>
  theme: ThemeTokens
}

export function MiniScorecardGrid({
  totalHoles,
  scores,
  activeJugadorId,
  parMap,
  holeDataMap,
  currentHole,
  setCurrentHole,
  modoJuego,
  hasStrokeAdvantage,
  totalGross,
  totalNet,
  showNet,
  progressRowRef,
  theme,
}: MiniScorecardGridProps) {
  const renderHoleCell = (h: number) => {
    const s = activeJugadorId ? scores[activeJugadorId]?.[h] : undefined
    const p = parMap[h] ?? 4
    const isActive = h === currentHole
    const diff = s != null ? s - p : null
    const indicatorColor = s === 1 ? '#c4992a' : diff != null && diff <= -3 ? '#60A5FA' : diff != null && diff < 0 ? '#c4992a' : diff != null && diff > 0 ? '#EF4444' : 'transparent'
    const holeStrokeCount = modoJuego !== 'gross' && hasStrokeAdvantage(holeDataMap[h]?.stroke_index ?? h) ? 1 : 0
    return (
      <div key={h} onClick={() => setCurrentHole(h)} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', minWidth: '22px', cursor: 'pointer', position: 'relative' }}>
        <div style={{ fontSize: '8px', color: isActive ? '#C4992A' : theme.textFaint, fontWeight: isActive ? 600 : 400, marginBottom: '2px' }}>{h}</div>
        {s != null ? (
          <div style={{
            width: '22px', height: '22px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '11px', fontWeight: 600, lineHeight: 1,
            color: s === 1 ? '#c4992a' : diff != null && diff >= 3 ? '#fff' : theme.textMuted,
            background: s === 1 ? '#c4992a' : diff != null && diff <= -3 ? '#60A5FA' : diff != null && diff >= 3 ? '#DC2626' : 'transparent',
            border: indicatorColor !== 'transparent' && !((s === 1) || (diff != null && diff <= -3) || (diff != null && diff >= 3)) ? `1.5px solid ${indicatorColor}` : 'none',
            borderRadius: diff != null && diff < 0 ? '50%' : '2px',
            boxShadow: isActive ? '0 0 0 1.5px #C4992A' : 'none',
          }}>
            {s === 1 ? <span style={{ color: '#ffffff', fontWeight: 800 }}>1</span> : s}
          </div>
        ) : (
          <div style={{ width: '22px', height: '22px', borderRadius: '3px', background: isActive ? 'rgba(196,153,42,0.15)' : theme.badgeBg, border: isActive ? '1.5px solid #C4992A' : `1px solid ${theme.badgeBorder}` }} />
        )}
        {holeStrokeCount > 0 && (
          <div style={{ position: 'absolute', bottom: '-2px', right: '-1px', display: 'flex', gap: '1px' }}>
            {Array.from({ length: holeStrokeCount }, (_, i) => (
              <div key={i} style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#c4992a', border: '0.5px solid rgba(255,255,255,0.8)' }} />
            ))}
          </div>
        )}
      </div>
    )
  }

  return (
    <div style={{
      borderBottom: `1px solid ${theme.border}`,
      flexShrink: 0, overflow: 'hidden',
    }}>
      <div ref={progressRowRef} style={{
        display: 'flex', overflowX: 'auto', padding: '5px 6px', gap: '2px',
        WebkitOverflowScrolling: 'touch',
      }}>
        {/* Front 9 */}
        {Array.from({ length: Math.min(9, totalHoles) }, (_, i) => i + 1).map(renderHoleCell)}

        {/* OUT */}
        {/* Separator entre front y back */}
        {totalHoles > 9 && <div style={{ width: '1px', background: theme.border, margin: '2px 1px', flexShrink: 0 }} />}

        {/* Back 9 */}
        {totalHoles > 9 && Array.from({ length: Math.min(9, totalHoles - 9) }, (_, i) => i + 10).map(renderHoleCell)}

        {/* Score total: gross + neto */}
        <div style={{ width: '1px', background: theme.border, margin: '2px 1px', flexShrink: 0 }} />
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', minWidth: '36px', padding: '0 4px', flexShrink: 0 }}>
          <div style={{ fontSize: '8px', fontWeight: 600, color: theme.textFaint, letterSpacing: '0.06em', marginBottom: '2px' }}>GROSS</div>
          <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text)' }}>{totalGross > 0 ? totalGross : '—'}</div>
          {showNet && totalGross > 0 && (
            <>
              <div style={{ fontSize: '7px', fontWeight: 600, color: theme.textFaint, letterSpacing: '0.06em', marginTop: '3px' }}>NET</div>
              <div style={{ fontSize: '11px', fontWeight: 600, color: '#5a6370' }}>{totalNet > 0 ? totalNet : '—'}</div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
