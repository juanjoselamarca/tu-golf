// Tarjeta del jugador seleccionado: totales en vivo, grilla de scores por hoyo,
// stats opcionales (colapsable) y finalización de la ronda.

import { useState } from 'react'
import { isStablefordFormat } from '@/golf/formats'
import type { CourseHole } from '@/golf/leaderboard/types'
import type { ScoringTournament } from '@/lib/data/tournaments/scoring'
import { isClosedRoundStatus } from '../hooks/useScoringData'
import type { UseScoreEntryReturn } from '../hooks/useScoreEntry'
import { HoleStatsTable } from './HoleStatsTable'

// Paleta local del scorer del organizador (navy broadcast). Ojo: NO es la
// escala Garmin de la app (getScoreIndicator) — unificarla es cambio visual,
// decisión de diseño del hilo principal.
function scoreBackground(gross: number, par: number) {
  const d = gross - par
  if (d <= -2) return 'rgba(37,99,235,0.30)'
  if (d === -1) return 'rgba(22,163,74,0.30)'
  if (d === 0) return 'rgba(100,116,139,0.10)'
  if (d === 1) return 'rgba(220,38,38,0.20)'
  return 'rgba(220,38,38,0.40)'
}

function scoreBorder(gross: number, par: number) {
  const d = gross - par
  if (d <= -2) return '2px solid #2563eb'
  if (d === -1) return '2px solid #16a34a'
  if (d === 0) return '1px solid #e2e8f0'
  if (d === 1) return '2px solid rgba(220,38,38,0.6)'
  return '2px solid #dc2626'
}

interface ScorecardPanelProps {
  tournament: ScoringTournament
  courseHoles: CourseHole[]
  holeCount: number
  entry: UseScoreEntryReturn
}

export function ScorecardPanel({ tournament, courseHoles, holeCount, entry }: ScorecardPanelProps) {
  const [showStats, setShowStats] = useState(false)
  const {
    selectedPlayer, selectedRound, holes, currentScores, errorHoles, saving,
    allFilled, parJugado, grossTotal, outGross, inGross, netTotal,
    stablefordPtsAt, saveScore, finalizeRound, selectedId,
  } = entry

  if (!selectedPlayer) return null

  const roundClosed = isClosedRoundStatus(selectedRound?.status)

  return (
    <div style={{ background: 'rgba(14,28,47,0.92)', border: '1px solid rgba(196,153,42,0.15)', borderRadius: '14px', overflow: 'hidden' }}>
      <div style={{ padding: '16px 20px', borderBottom: '1px solid rgba(196,153,42,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
        <div>
          <span style={{ fontFamily: '"Playfair Display", serif', fontSize: '18px', color: 'var(--text)' }}>{selectedPlayer.profiles?.name}</span>
          <span style={{ color: 'var(--text-2)', fontSize: '13px', marginLeft: '10px' }}>HCP {selectedPlayer.handicap_at_registration ?? '—'}</span>
        </div>
        <div style={{ display: 'flex', gap: '16px', alignItems: 'flex-end' }}>
          {holeCount === 18 && grossTotal > 0 && (
            <div style={{ fontSize: '11px', color: 'var(--text-2)', fontFamily: '"DM Mono", monospace', alignSelf: 'center' }}>
              {outGross}+{inGross}
            </div>
          )}
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '11px', color: 'var(--text-2)', marginBottom: '2px' }}>GROSS</div>
            <div style={{ fontSize: '18px', fontWeight: 700, color: 'var(--text)' }}>{grossTotal || '—'}</div>
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '11px', color: 'var(--text-2)', marginBottom: '2px' }}>NET</div>
            <div style={{ fontSize: '18px', fontWeight: 700, color: netTotal < 0 ? '#4ade80' : netTotal > 0 ? '#f87171' : 'var(--text)' }}>
              {grossTotal ? (netTotal <= 0 ? netTotal : `+${netTotal}`) : '—'}
            </div>
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '11px', color: 'var(--text-2)', marginBottom: '2px' }}>vs PAR</div>
            <div style={{ fontSize: '18px', fontWeight: 700, color: 'var(--text-2)' }}>
              {grossTotal ? (() => {
                const vp = grossTotal - parJugado
                return vp <= 0 ? String(vp) : `+${vp}`
              })() : '—'}
            </div>
          </div>
        </div>
      </div>

      {/* Grilla de scores */}
      <div style={{ padding: '20px', display: 'grid', gridTemplateColumns: 'repeat(9, 1fr)', gap: '8px' }}>
        {holes.map((holeNum) => {
          const hole = courseHoles.find((h) => h.numero === holeNum)
          const par = hole?.par ?? 4
          const gross = currentScores[holeNum]
          const haScore = gross != null
          const hasErr = errorHoles.has(holeNum)

          return (
            <div
              key={holeNum}
              style={{
                background: hasErr ? 'rgba(220,38,38,0.15)' : haScore ? scoreBackground(gross, par) : '#f8f9fa',
                border: hasErr ? '2px solid #dc2626' : haScore ? scoreBorder(gross, par) : '1px solid rgba(122,143,168,0.15)',
                borderRadius: '8px',
                padding: '8px 4px',
                textAlign: 'center',
                animation: hasErr ? 'pulse 1s ease-in-out 3' : 'none',
              }}
            >
              <div style={{ fontSize: '10px', color: 'var(--text-2)', marginBottom: '2px' }}>H{holeNum}</div>
              <div style={{ fontSize: '10px', color: 'var(--text-2)', marginBottom: '4px' }}>P{par}</div>
              <input
                type="number"
                min={1}
                max={19}
                inputMode="numeric"
                defaultValue={gross ?? ''}
                key={`${selectedId}-${holeNum}-${gross}`}
                onBlur={(e) => saveScore(holeNum, e.target.value)}
                style={{
                  width: '100%',
                  background: 'transparent',
                  border: 'none',
                  outline: 'none',
                  color: 'var(--text)',
                  textAlign: 'center',
                  fontSize: '18px',
                  fontWeight: 700,
                  padding: '2px 0',
                  cursor: 'text',
                  appearance: 'textfield',
                }}
                placeholder="—"
              />
              {haScore && isStablefordFormat(tournament.format) && (() => {
                const pts = stablefordPtsAt(holeNum, gross)
                return (
                  <div style={{ fontSize: '10px', color: pts >= 2 ? '#16a34a' : pts === 1 ? '#c4992a' : '#94a3b8', fontWeight: 600, marginTop: '2px' }}>
                    {pts} pt{pts !== 1 ? 's' : ''}
                  </div>
                )
              })()}
            </div>
          )
        })}
      </div>

      {/* Estadísticas adicionales (colapsable) */}
      <div style={{ borderTop: '1px solid rgba(122,143,168,0.1)' }}>
        <button
          type="button"
          onClick={() => setShowStats(!showStats)}
          style={{ width: '100%', background: 'transparent', border: 'none', cursor: 'pointer', padding: '12px 20px', display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-2)', fontSize: '13px' }}
        >
          <span style={{ transition: 'transform 200ms', transform: showStats ? 'rotate(90deg)' : 'rotate(0)', display: 'inline-block' }}>▶</span>
          Estadísticas adicionales — Putts · Fairway · GIR (opcional)
        </button>
        {showStats && <HoleStatsTable courseHoles={courseHoles} entry={entry} />}
      </div>

      {/* Finalizar */}
      {allFilled && !roundClosed && (
        <div style={{ padding: '16px 20px', borderTop: '1px solid rgba(196,153,42,0.1)', display: 'flex', justifyContent: 'flex-end' }}>
          <button
            onClick={finalizeRound}
            disabled={saving}
            style={{
              background: '#c4992a',
              color: 'var(--text)',
              fontWeight: 700,
              fontSize: '15px',
              padding: '12px 28px',
              borderRadius: '8px',
              border: 'none',
              cursor: saving ? 'not-allowed' : 'pointer',
              opacity: saving ? 0.8 : 1,
            }}
          >
            {saving ? 'Finalizando...' : 'Finalizar ronda ✓'}
          </button>
        </div>
      )}
      {roundClosed && (
        <div style={{ padding: '14px 20px', borderTop: '1px solid rgba(22,163,74,0.2)', background: 'rgba(22,163,74,0.05)', textAlign: 'center', color: '#4ade80', fontSize: '14px' }}>
          ✓ Ronda finalizada
        </div>
      )}
    </div>
  )
}
