// Cuadro ganador + podium (rondas finalizadas, no match play). Verbatim del monolito.
import { Trophy, Handshake } from '@/components/icons'
import { formatOverUnder } from '@/constants/golf'
import { getScoreColorLight } from '@/golf/core/colors'
import type { RondaLibre } from '@/types/ronda'
import type { LeaderboardEntry } from '@/lib/ronda/leaderboard'
import type { TeamShareRow } from '@/lib/ronda/team-ranking'

export interface WinnerCelebrationProps {
  ronda: RondaLibre
  leaderboard: LeaderboardEntry[]
  fechaDisplay: string
  onShare: () => void
  /** Ranking de equipos (best_ball/scramble/foursome). Si viene, gana un EQUIPO, no un jugador (fix 128). */
  teams?: TeamShareRow[]
}

/** Etiqueta de modalidad/formato (mismo texto que la tarjeta de info). */
function formatoLabel(ronda: RondaLibre): string {
  if (ronda.formato_juego === 'stableford') return 'Stableford'
  const modoSuffix = ronda.modo_juego === 'neto' ? 'Neto' : 'Gross'
  if (ronda.formato_juego === 'match_play') return `Match Play ${modoSuffix}`
  if (ronda.formato_juego === 'best_ball') return `Best Ball ${modoSuffix}`
  if (ronda.formato_juego === 'scramble') return `Scramble ${modoSuffix}`
  if (ronda.formato_juego === 'foursome') return `Foursome ${modoSuffix}`
  return `Stroke Play ${modoSuffix} · ${ronda.holes}h`
}

/** Pill de modalidad arriba del cuadro ganador (fix 120: lectura inmediata del formato). */
function FormatoPill({ ronda }: { ronda: RondaLibre }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'center', padding: '14px 20px 0' }}>
      <span style={{
        padding: '4px 12px',
        background: 'rgba(196,153,42,0.1)',
        color: '#c4992a',
        border: '1px solid rgba(196,153,42,0.28)',
        borderRadius: '999px',
        fontSize: '10px', fontWeight: 700, letterSpacing: '0.08em',
        fontFamily: 'DM Mono, monospace', textTransform: 'uppercase',
      }}>{formatoLabel(ronda)}</span>
    </div>
  )
}

export function WinnerCelebration({ ronda, leaderboard, fechaDisplay, onShare, teams }: WinnerCelebrationProps) {
  // Fix 128: en modalidades por equipos el cuadro ganador muestra el EQUIPO ganador
  // (ranking de equipos), no el jugador top del leaderboard individual.
  if (teams && teams.length > 0) {
    return <TeamWinner ronda={ronda} teams={teams} fechaDisplay={fechaDisplay} onShare={onShare} />
  }

  const isStab = ronda.formato_juego === 'stableford'
  const isTie = leaderboard.length > 1 && (isStab
    ? leaderboard[0].stablefordPts === leaderboard[1].stablefordPts
    : leaderboard[0].vsPar === leaderboard[1].vsPar)
  const winnerScore = leaderboard[0].vsPar
  const scoreColor = isStab ? '#c4992a' : getScoreColorLight(winnerScore)
  const playedPlayers = leaderboard.filter(j => j.holesPlayed > 0)

  return (
    <div style={{ marginBottom: '16px' }}>
      <div style={{
        background: 'var(--bg-surface)', borderRadius: '16px',
        border: '2px solid #c4992a',
        overflow: 'hidden',
        boxShadow: '0 4px 24px rgba(196,153,42,0.15)',
      }}>
        <div style={{ height: '4px', background: 'linear-gradient(90deg, #c4992a, #d4a843, #c4992a)' }} />
        <FormatoPill ronda={ronda} />
        <div style={{ padding: '16px 20px 16px', textAlign: 'center' }}>
          <div style={{ fontSize: '48px', marginBottom: '4px' }}>{isTie ? <Handshake size={48} /> : <Trophy size={48} />}</div>
          <div style={{ fontSize: '11px', fontWeight: 700, color: '#c4992a', textTransform: 'uppercase', letterSpacing: '2px', marginBottom: '6px' }}>
            {isTie ? 'Empate' : 'Ganador'}
          </div>
          <div style={{ fontFamily: '"Playfair Display", serif', fontSize: '26px', fontWeight: 700, color: 'var(--text)', marginBottom: '4px' }}>
            {isTie
              ? leaderboard.filter(j => isStab ? j.stablefordPts === leaderboard[0].stablefordPts : j.vsPar === winnerScore).map(j => j.nombre.split(' ')[0]).join(' y ')
              : leaderboard[0].nombre}
          </div>
          <div style={{ fontSize: '36px', fontWeight: 900, color: scoreColor, lineHeight: 1 }}>
            {isStab ? `${leaderboard[0].stablefordPts} pts` : formatOverUnder(winnerScore)}
          </div>
          <div style={{ fontSize: '13px', color: 'var(--text-3)', marginTop: '6px' }}>{ronda.course_name} · {fechaDisplay}</div>
        </div>

        {/* Final leaderboard with positions */}
        {playedPlayers.length > 1 && (
          <div style={{ padding: '0 20px 16px' }}>
            <div style={{ borderTop: '1px solid #e5e7eb', paddingTop: '12px' }}>
              {playedPlayers.map((j, idx) => {
                const posLabel = idx === 0 ? '1°' : idx === 1 ? '2°' : idx === 2 ? '3°' : `${idx + 1}°`
                const posColor = idx === 0 ? '#c4992a' : idx === 1 ? '#94a8c0' : idx === 2 ? '#b87333' : '#9ca3af'
                const isWinner = idx === 0
                const jScoreColor = isStab ? '#c4992a' : getScoreColorLight(j.vsPar)
                return (
                  <div key={j.id} style={{
                    display: 'flex', alignItems: 'center', gap: '12px',
                    padding: '8px 0',
                    borderBottom: idx < playedPlayers.length - 1 ? '1px solid #f3f4f6' : 'none',
                  }}>
                    <span style={{
                      fontSize: '15px', fontWeight: 800, color: posColor,
                      minWidth: '28px', textAlign: 'center',
                    }}>{posLabel}</span>
                    <span style={{
                      flex: 1, fontSize: '14px', color: 'var(--text)',
                      fontWeight: isWinner ? 700 : 500,
                    }}>{j.nombre}</span>
                    <span style={{
                      fontSize: '15px', fontWeight: 700, color: jScoreColor,
                    }}>{isStab ? `${j.stablefordPts} pts` : formatOverUnder(j.vsPar)}</span>
                    <span style={{ fontSize: '12px', color: 'var(--text-3)', minWidth: '40px', textAlign: 'right' }}>
                      {j.holesPlayed}/{ronda.holes}
                    </span>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Share button — "Compartir resultados" CTA */}
        <div style={{ padding: '0 20px 20px' }}>
          <button
            onClick={onShare}
            style={{
              width: '100%', padding: '16px',
              background: 'linear-gradient(135deg, #c4992a 0%, #d4a843 50%, #b8972f 100%)',
              color: 'var(--brand-dark)', fontWeight: 700, fontSize: '16px',
              border: 'none', borderRadius: '12px', cursor: 'pointer',
              boxShadow: '0 4px 16px rgba(196,153,42,0.35)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
            }}
          >
            Compartir resultados
          </button>
        </div>
      </div>
    </div>
  )
}

/** Cuadro ganador para modalidades por equipos (fix 128). Misma estética que el individual. */
function TeamWinner({ ronda, teams, fechaDisplay, onShare }: { ronda: RondaLibre; teams: TeamShareRow[]; fechaDisplay: string; onShare: () => void }) {
  const winnerDiff = teams[0].diff
  const isTie = teams.length > 1 && teams[1].diff === winnerDiff
  const scoreColor = getScoreColorLight(winnerDiff)
  const winners = teams.filter(t => t.diff === winnerDiff)

  return (
    <div style={{ marginBottom: '16px' }}>
      <div style={{
        background: 'var(--bg-surface)', borderRadius: '16px',
        border: '2px solid #c4992a',
        overflow: 'hidden',
        boxShadow: '0 4px 24px rgba(196,153,42,0.15)',
      }}>
        <div style={{ height: '4px', background: 'linear-gradient(90deg, #c4992a, #d4a843, #c4992a)' }} />
        <FormatoPill ronda={ronda} />
        <div style={{ padding: '16px 20px 16px', textAlign: 'center' }}>
          <div style={{ fontSize: '48px', marginBottom: '4px' }}>{isTie ? <Handshake size={48} /> : <Trophy size={48} />}</div>
          <div style={{ fontSize: '11px', fontWeight: 700, color: '#c4992a', textTransform: 'uppercase', letterSpacing: '2px', marginBottom: '6px' }}>
            {isTie ? 'Empate' : 'Equipo ganador'}
          </div>
          <div style={{ fontFamily: '"Playfair Display", serif', fontSize: '26px', fontWeight: 700, color: 'var(--text)', marginBottom: '4px' }}>
            {winners.map(t => t.nombre).join(' y ')}
          </div>
          {teams[0].jugadores.length > 0 && !isTie && (
            <div style={{ fontSize: '12px', color: 'var(--text-3)', marginBottom: '4px' }}>
              {teams[0].jugadores.join(' · ')}
            </div>
          )}
          <div style={{ fontSize: '36px', fontWeight: 900, color: scoreColor, lineHeight: 1 }}>
            {formatOverUnder(winnerDiff)}
          </div>
          <div style={{ fontSize: '13px', color: 'var(--text-3)', marginTop: '6px' }}>{ronda.course_name} · {fechaDisplay}</div>
        </div>

        {/* Ranking de equipos */}
        {teams.length > 1 && (
          <div style={{ padding: '0 20px 16px' }}>
            <div style={{ borderTop: '1px solid #e5e7eb', paddingTop: '12px' }}>
              {teams.map((t, idx) => {
                const posLabel = idx === 0 ? '1°' : idx === 1 ? '2°' : idx === 2 ? '3°' : `${idx + 1}°`
                const posColor = idx === 0 ? '#c4992a' : idx === 1 ? '#94a8c0' : idx === 2 ? '#b87333' : '#9ca3af'
                return (
                  <div key={t.nombre} style={{
                    display: 'flex', alignItems: 'center', gap: '12px',
                    padding: '8px 0',
                    borderBottom: idx < teams.length - 1 ? '1px solid #f3f4f6' : 'none',
                  }}>
                    <span style={{ fontSize: '15px', fontWeight: 800, color: posColor, minWidth: '28px', textAlign: 'center' }}>{posLabel}</span>
                    <span style={{ flex: 1, fontSize: '14px', color: 'var(--text)', fontWeight: idx === 0 ? 700 : 500, overflow: 'hidden' }}>
                      {t.nombre}
                      {t.jugadores.length > 0 && (
                        <span style={{ display: 'block', fontSize: '11px', color: 'var(--text-3)', fontWeight: 400 }}>{t.jugadores.join(' · ')}</span>
                      )}
                    </span>
                    <span style={{ fontSize: '15px', fontWeight: 700, color: getScoreColorLight(t.diff) }}>{formatOverUnder(t.diff)}</span>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Share button */}
        <div style={{ padding: '0 20px 20px' }}>
          <button
            onClick={onShare}
            style={{
              width: '100%', padding: '16px',
              background: 'linear-gradient(135deg, #c4992a 0%, #d4a843 50%, #b8972f 100%)',
              color: 'var(--brand-dark)', fontWeight: 700, fontSize: '16px',
              border: 'none', borderRadius: '12px', cursor: 'pointer',
              boxShadow: '0 4px 16px rgba(196,153,42,0.35)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
            }}
          >
            Compartir resultados
          </button>
        </div>
      </div>
    </div>
  )
}
