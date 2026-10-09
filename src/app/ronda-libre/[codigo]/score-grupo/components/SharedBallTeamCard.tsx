'use client'

import { scoreChipStyle, scoreFgVar } from '@/lib/score-tokens'
import { puntosStablefordHoyo } from '@/golf/core/scoring'
import { teePlayerEnHoyo } from '@/golf/formats'
import { formatVsPar } from '@/golf/share/vs-par'
import type { EquipoDelScorer } from '@/lib/data/ronda-libre-scorer'
import type { FormatoJuego, HoleData } from '@/types/ronda'
import type { ScorerTheme } from '@/components/ronda/scorer-theme'
import { chipLabelCorto } from './chip-label'
import { puedeSumarGolpe, puedeRestarGolpe } from '@/golf/ronda-libre/golpes-por-hoyo'

interface SharedBallTeamCardProps {
  equipo: EquipoDelScorer
  formatoJuego: FormatoJuego
  currentHole: number
  par: number
  ordenHoyos: readonly number[]
  parMap: Record<number, number>
  holeDataMap: Record<number, HoleData>
  siAllocByHole: Record<number, number>
  totalHoles: number
  foursomeInvertido: boolean
  onToggleInvertido: () => void
  onChange: (delta: number) => void
  theme: ScorerTheme
}

/** Scramble / Foursome: UN score por equipo por hoyo (vive en ronda_equipos). */
export function SharedBallTeamCard({
  equipo, formatoJuego, currentHole, par, ordenHoyos, parMap, holeDataMap, siAllocByHole, totalHoles,
  foursomeInvertido, onToggleInvertido, onChange, theme,
}: SharedBallTeamCardProps) {
  const teamScore = equipo.scores[String(currentHole)]
  const displayTeamScore = teamScore ?? par
  const teamDiff = teamScore != null ? teamScore - par : 0
  const chipStyle = teamScore != null ? scoreChipStyle(teamScore, par) : null
  // Team total
  let teamGross = 0, teamParTotal = 0
  for (const h of ordenHoyos) {
    const s = equipo.scores[String(h)]
    if (s != null) { teamGross += s; teamParTotal += parMap[h] ?? 4 }
  }
  const teamVsPar = teamGross - teamParTotal
  const teamPlayed = Object.keys(equipo.scores).filter(k => equipo.scores[k] != null).length
  let stablefordPts = 0
  if (formatoJuego === 'stableford') {
    for (const h of ordenHoyos) {
      const s = equipo.scores[String(h)]
      if (s != null) {
        const hd = holeDataMap[h]
        stablefordPts += puntosStablefordHoyo(s, hd?.par ?? 4, equipo.handicap_equipo ?? 0, siAllocByHole[h] ?? hd?.stroke_index ?? h, totalHoles)
      }
    }
  }

  return (
    <div style={{
      background: theme.card, borderRadius: '14px',
      border: `1px solid ${theme.border}`, padding: '12px 14px',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
        <div>
          <div style={{ fontSize: '13px', fontWeight: 700, color: theme.text, letterSpacing: '0.02em', textTransform: 'uppercase' as const }}>{equipo.nombre}</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flexWrap: 'wrap', marginTop: '4px' }}>
            {equipo.jugadorNombres.map((nombre, i) => (
              <span
                key={`${equipo.id}-jugador-${i}`}
                style={{
                  fontSize: '11px',
                  fontWeight: 500,
                  color: theme.textMuted,
                  background: 'rgba(196,153,42,0.08)',
                  border: '1px solid rgba(196,153,42,0.2)',
                  borderRadius: '10px',
                  padding: '2px 8px',
                  lineHeight: 1.3,
                }}
              >
                {nombre}
              </span>
            ))}
            {equipo.handicap_equipo != null && (
              <span style={{ fontSize: '11px', color: theme.textFaint, fontFamily: '"DM Mono", monospace' }}>
                HCP {equipo.handicap_equipo}
              </span>
            )}
          </div>
          {formatoJuego === 'foursome' && equipo.jugadorNombres.length === 2 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '2px' }}>
              <span style={{ fontSize: '10px', color: 'var(--brand-on-bg)' }}>
                Tira: {teePlayerEnHoyo(currentHole, equipo.jugadorNombres[0], equipo.jugadorNombres[1], foursomeInvertido)}
              </span>
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  onToggleInvertido()
                }}
                style={{
                  fontSize: '9px', fontWeight: 600, color: 'var(--text-3)',
                  background: foursomeInvertido ? 'rgba(196,153,42,0.12)' : 'rgba(0,0,0,0.04)',
                  border: `1px solid ${foursomeInvertido ? 'rgba(196,153,42,0.3)' : 'var(--border)'}`,
                  borderRadius: '8px', padding: '2px 8px', cursor: 'pointer',
                  lineHeight: 1.4,
                }}
              >
                {foursomeInvertido ? 'Orden invertido' : 'Invertir orden'}
              </button>
            </div>
          )}
        </div>
        {teamPlayed > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ fontSize: '10px', color: theme.textFaint, fontFamily: '"DM Mono", monospace' }}>{teamGross}</span>
            {formatoJuego === 'stableford' ? (
              <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--brand-on-bg)' }}>
                {`${stablefordPts} pts`}
              </span>
            ) : (
              <span style={{ fontSize: '13px', fontWeight: 700, color: scoreFgVar(teamVsPar) }}>{formatVsPar(teamVsPar)}</span>
            )}
          </div>
        )}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '16px' }}>
        <button
          onClick={() => onChange(-1)}
          disabled={!puedeRestarGolpe(teamScore)}
          style={{
            width: '52px', height: '52px', borderRadius: '14px', fontSize: '24px', fontWeight: 300,
            background: 'var(--bg)', color: theme.text, border: `1px solid ${theme.buttonBorder}`,
            cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
            touchAction: 'manipulation', userSelect: 'none',
            opacity: puedeRestarGolpe(teamScore) ? 1 : 0.3,
          }}
        >{'−'}</button>
        <div style={{ textAlign: 'center', minWidth: '80px' }}>
          <div style={{ fontFamily: 'var(--font-dm-mono), "DM Mono", ui-monospace, monospace', fontSize: '42px', fontWeight: 700, lineHeight: 1, color: teamScore != null ? theme.scoreText : theme.scoreDimmed, fontVariantNumeric: 'tabular-nums' }}>
            {displayTeamScore}
          </div>
          {teamScore != null && chipStyle && (
            <div style={{
              padding: '2px 10px', borderRadius: '12px', fontSize: '10px', fontWeight: 500,
              ...chipStyle,
              display: 'inline-block', marginTop: '4px',
            }}>
              {chipLabelCorto(teamDiff)}
            </div>
          )}
        </div>
        <button
          onClick={() => onChange(1)}
          disabled={!puedeSumarGolpe(teamScore)}
          style={{
            width: '52px', height: '52px', borderRadius: '14px', fontSize: '24px', fontWeight: 600,
            background: theme.gold, color: 'var(--brand-dark)', border: 'none',
            cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
            touchAction: 'manipulation', userSelect: 'none',
            opacity: puedeSumarGolpe(teamScore) ? 1 : 0.3,
          }}
        >+</button>
      </div>
    </div>
  )
}
