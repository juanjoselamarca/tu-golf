// Cuadro ganador (rondas finalizadas, no match play).
// Dirección A "Editorial": UN héroe (ganador + score), sin tabla embebida.
// La clasificación vive UNA sola vez en la tabla de abajo (Team/IndividualLeaderboard).
import type { ReactNode } from 'react'
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

/**
 * Héroe editorial compartido: pill formato + ícono + etiqueta + nombre serif +
 * (integrantes) + score grande + cancha·fecha + UN botón de compartir.
 * Sin tabla de posiciones embebida (vive una sola vez abajo).
 */
function HeroCard({
  ronda, etiqueta, nombre, integrantes, scoreNode, scoreColor, isTie, onShare, fechaDisplay,
}: {
  ronda: RondaLibre
  etiqueta: string
  nombre: string
  integrantes?: string
  scoreNode: ReactNode
  scoreColor: string
  isTie: boolean
  onShare: () => void
  fechaDisplay: string
}) {
  return (
    <div style={{ marginBottom: '16px' }}>
      <div style={{
        background: 'var(--bg-surface)', borderRadius: '16px',
        border: '2px solid #c4992a', overflow: 'hidden',
        boxShadow: '0 4px 24px rgba(196,153,42,0.15)',
      }}>
        <div style={{ height: '4px', background: 'linear-gradient(90deg, #c4992a, #d4a843, #c4992a)' }} />
        <div style={{ display: 'flex', justifyContent: 'center', padding: '14px 20px 0' }}>
          <span style={{
            padding: '4px 12px', background: 'rgba(196,153,42,0.1)', color: '#c4992a',
            border: '1px solid rgba(196,153,42,0.28)', borderRadius: '999px',
            fontSize: '10px', fontWeight: 700, letterSpacing: '0.08em',
            fontFamily: 'DM Mono, monospace', textTransform: 'uppercase',
          }}>{formatoLabel(ronda)}</span>
        </div>
        <div style={{ padding: '18px 20px 20px', textAlign: 'center' }}>
          <div style={{ display: 'flex', justifyContent: 'center', color: '#c4992a', marginBottom: '8px' }}>
            {isTie ? <Handshake size={34} /> : <Trophy size={34} />}
          </div>
          <div style={{ fontSize: '11px', fontWeight: 700, color: '#c4992a', textTransform: 'uppercase', letterSpacing: '2px', marginBottom: '6px' }}>
            {etiqueta}
          </div>
          <div style={{ fontFamily: '"Playfair Display", serif', fontSize: '30px', fontWeight: 700, color: 'var(--text)', lineHeight: 1.05, marginBottom: '2px' }}>
            {nombre}
          </div>
          {integrantes && (
            <div style={{ fontSize: '12px', color: 'var(--text-3)', marginBottom: '4px' }}>{integrantes}</div>
          )}
          <div style={{ fontFamily: 'DM Mono, monospace', fontSize: '40px', fontWeight: 500, color: scoreColor, lineHeight: 1.1, letterSpacing: '-0.02em' }}>
            {scoreNode}
          </div>
          <div style={{ fontSize: '12.5px', color: 'var(--text-3)', marginTop: '6px' }}>{ronda.course_name} · {fechaDisplay}</div>
        </div>
        <div style={{ padding: '0 20px 20px' }}>
          <button
            onClick={onShare}
            style={{
              width: '100%', padding: '15px',
              background: '#c4992a', color: 'var(--brand-dark)', fontWeight: 700, fontSize: '15px',
              border: 'none', borderRadius: '12px', cursor: 'pointer',
            }}
          >
            Compartir resultado
          </button>
        </div>
      </div>
    </div>
  )
}

export function WinnerCelebration({ ronda, leaderboard, fechaDisplay, onShare, teams }: WinnerCelebrationProps) {
  // Fix 128: en modalidades por equipos el cuadro ganador muestra el EQUIPO ganador.
  if (teams && teams.length > 0) {
    const winnerDiff = teams[0].diff
    const isTie = teams.length > 1 && teams[1].diff === winnerDiff
    const winners = teams.filter(t => t.diff === winnerDiff)
    return (
      <HeroCard
        ronda={ronda}
        etiqueta={isTie ? 'Empate' : 'Equipo ganador'}
        nombre={winners.map(t => t.nombre).join(' y ')}
        integrantes={!isTie && teams[0].jugadores.length > 0 ? teams[0].jugadores.join(' · ') : undefined}
        scoreNode={formatOverUnder(winnerDiff)}
        scoreColor={getScoreColorLight(winnerDiff)}
        isTie={isTie}
        onShare={onShare}
        fechaDisplay={fechaDisplay}
      />
    )
  }

  const isStab = ronda.formato_juego === 'stableford'
  const isTie = leaderboard.length > 1 && (isStab
    ? leaderboard[0].stablefordPts === leaderboard[1].stablefordPts
    : leaderboard[0].vsPar === leaderboard[1].vsPar)
  const winnerScore = leaderboard[0].vsPar
  const scoreColor = isStab ? '#c4992a' : getScoreColorLight(winnerScore)
  const nombre = isTie
    ? leaderboard.filter(j => isStab ? j.stablefordPts === leaderboard[0].stablefordPts : j.vsPar === winnerScore).map(j => j.nombre.split(' ')[0]).join(' y ')
    : leaderboard[0].nombre

  return (
    <HeroCard
      ronda={ronda}
      etiqueta={isTie ? 'Empate' : 'Ganador'}
      nombre={nombre}
      scoreNode={isStab ? `${leaderboard[0].stablefordPts} pts` : formatOverUnder(winnerScore)}
      scoreColor={scoreColor}
      isTie={isTie}
      onShare={onShare}
      fechaDisplay={fechaDisplay}
    />
  )
}
