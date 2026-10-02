'use client'

import { CONCEDE, type MatchResult } from '@/golf/formats/match-play'
import type { Jugador } from '@/types/ronda'
import type { ScorerTheme } from '@/components/ronda/scorer-theme'

interface MatchPlayHoleCardProps {
  matchResult: MatchResult
  jugadores: Jugador[]
  currentHole: number
  /** Score del jugador activo en el hoyo actual (para saber si ya lo concedió). */
  activeScoreOnHole: number | undefined
  onConcede: () => void
  theme: ScorerTheme
}

/**
 * Match play: tarjeta head-to-head del hoyo actual, badge DORMIE y botón de
 * conceder el hoyo. Sólo con exactamente 2 jugadores.
 */
export function MatchPlayHoleCard({ matchResult, jugadores, currentHole, activeScoreOnHole, onConcede, theme }: MatchPlayHoleCardProps) {
  const jug = jugadores
  const holeDetail = jug.length === 2 ? matchResult.holes.find(h => h.numero === currentHole) : undefined
  const nombreA = jug[0]?.nombre ?? ''
  const nombreB = jug[1]?.nombre ?? ''
  const resultColors: Record<string, string> = {
    won_a: 'var(--status-live-fg)', won_b: 'var(--double)', halved: 'var(--par)',
    conceded_a: 'var(--double)', conceded_b: 'var(--status-live-fg)', not_played: 'var(--text-3)',
  }
  const resultLabels: Record<string, string> = {
    won_a: `${nombreA} gana`, won_b: `${nombreB} gana`, halved: 'Empate',
    conceded_a: `${nombreA} concede`, conceded_b: `${nombreB} concede`, not_played: 'Pendiente',
  }
  const concedido = activeScoreOnHole === CONCEDE

  return (
    <>
      {holeDetail && (
        <div style={{
          marginTop: '12px', padding: '12px 16px', width: '100%', maxWidth: '320px',
          background: 'rgba(255,255,255,0.06)', border: `1px solid ${theme.border}`,
          borderRadius: '12px',
        }}>
          {/* Nombre vs Nombre */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <span style={{ fontSize: '12px', fontWeight: 600, color: theme.text }}>{nombreA}</span>
            <span style={{ fontSize: '10px', color: theme.textFaint }}>VS</span>
            <span style={{ fontSize: '12px', fontWeight: 600, color: theme.text }}>{nombreB}</span>
          </div>
          {/* Scores lado a lado */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', gap: '8px', alignItems: 'center' }}>
            {/* Jugador A */}
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '24px', fontWeight: 700, fontFamily: '"DM Mono", monospace', color: theme.text }}>
                {holeDetail.grossA ?? '—'}
              </div>
              {holeDetail.strokesA > 0 && (
                <div style={{ fontSize: '10px', color: 'var(--brand-on-bg)', marginTop: '2px' }}>
                  -{holeDetail.strokesA} stroke{holeDetail.strokesA > 1 ? 's' : ''}
                </div>
              )}
              {holeDetail.netoA != null && (
                <div style={{ fontSize: '11px', color: theme.textMuted, marginTop: '1px' }}>
                  neto {holeDetail.netoA}
                </div>
              )}
            </div>
            {/* Resultado del hoyo */}
            <div style={{ textAlign: 'center' }}>
              {holeDetail.result !== 'not_played' ? (
                <div style={{
                  width: '32px', height: '32px', borderRadius: '50%',
                  background: `${resultColors[holeDetail.result]}15`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: '10px', fontWeight: 700,
                  color: resultColors[holeDetail.result],
                }}>
                  {holeDetail.result === 'halved' ? '=' : holeDetail.result === 'won_a' || holeDetail.result === 'conceded_b' ? nombreA[0] : nombreB[0]}
                </div>
              ) : (
                <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: theme.badgeBg, border: `1px dashed ${theme.border}` }} />
              )}
            </div>
            {/* Jugador B */}
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '24px', fontWeight: 700, fontFamily: '"DM Mono", monospace', color: theme.text }}>
                {holeDetail.grossB ?? '—'}
              </div>
              {holeDetail.strokesB > 0 && (
                <div style={{ fontSize: '10px', color: 'var(--brand-on-bg)', marginTop: '2px' }}>
                  -{holeDetail.strokesB} stroke{holeDetail.strokesB > 1 ? 's' : ''}
                </div>
              )}
              {holeDetail.netoB != null && (
                <div style={{ fontSize: '11px', color: theme.textMuted, marginTop: '1px' }}>
                  neto {holeDetail.netoB}
                </div>
              )}
            </div>
          </div>
          {/* Label del resultado */}
          {holeDetail.result !== 'not_played' && (
            <div style={{
              textAlign: 'center', marginTop: '8px', fontSize: '11px', fontWeight: 600,
              color: resultColors[holeDetail.result],
            }}>
              {resultLabels[holeDetail.result]}
            </div>
          )}
          {/* Estado running del match */}
          <div style={{
            textAlign: 'center', marginTop: '6px', paddingTop: '6px',
            borderTop: `1px solid ${theme.border}`,
            fontSize: '12px', fontWeight: 700, fontFamily: '"DM Mono", monospace',
            color: holeDetail.matchState === 0 ? theme.textMuted : 'var(--brand-on-bg)',
          }}>
            {holeDetail.matchState === 0 ? 'ALL SQUARE'
              : holeDetail.matchState > 0 ? `${nombreA} ${holeDetail.matchState} UP`
              : `${nombreB} ${Math.abs(holeDetail.matchState)} UP`}
          </div>
        </div>
      )}

      {/* ── Match Play: dormie badge ── */}
      {matchResult.dormie && !matchResult.isFinished && (
        <div style={{
          display: 'flex', justifyContent: 'center', marginTop: '8px',
        }}>
          <span style={{
            fontSize: '11px', fontWeight: 700, letterSpacing: '0.1em',
            color: 'var(--brand-on-bg)', background: 'rgba(196,153,42,0.1)',
            border: '1px solid rgba(196,153,42,0.3)',
            padding: '4px 14px', borderRadius: '20px',
            textTransform: 'uppercase',
          }}>
            DORMIE
          </span>
        </div>
      )}

      {/* ── Match Play: conceder hoyo ── */}
      {!matchResult.isFinished && (
        <div style={{ display: 'flex', justifyContent: 'center', marginTop: '8px' }}>
          <button
            onClick={onConcede}
            disabled={concedido}
            style={{
              fontSize: '12px', fontWeight: 600, color: 'var(--double)',
              background: 'rgba(220,38,38,0.06)', border: '1px solid rgba(220,38,38,0.2)',
              borderRadius: '10px', padding: '6px 16px', cursor: 'pointer',
              opacity: concedido ? 0.4 : 1,
            }}
          >
            {concedido ? 'Hoyo concedido' : 'Conceder hoyo'}
          </button>
        </div>
      )}
    </>
  )
}
