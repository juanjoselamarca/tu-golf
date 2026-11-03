// Timeline de momentos recientes (con contexto match play). Verbatim del monolito,
// salvo que el MatchResult se calcula una sola vez (antes se recomputaba por evento).
// Sin hora por evento: los golpes no guardan cuándo se anotaron, y el "ahora / hace N min"
// que se mostraba era el índice de la fila (una ronda de ayer decía "ahora"). La única hora
// real es `timeSinceUpdate` (último guardado), en el encabezado mientras la ronda está viva.
import { Avatar } from '@/components/ui/Avatar'
import { scoreCellStyle, scoreFgVar } from '@/lib/score-tokens'
import { buildMatchResult } from '@/lib/ronda/match'
import type { RondaLibre, TimelineEvent } from '@/types/ronda'

export interface RecentTimelineProps {
  ronda: RondaLibre
  timelineEvents: TimelineEvent[]
  parMap: Record<number, number>
  siMap: Record<number, number>
  courseHcpMap: Record<string, number>
  isFinished: boolean
  timeSinceUpdate: string
}

export function RecentTimeline({ ronda, timelineEvents, parMap, siMap, courseHcpMap, isFinished, timeSinceUpdate }: RecentTimelineProps) {
  const isMatchPlay = ronda.formato_juego === 'match_play' && ronda.ronda_libre_jugadores.length === 2
  const mrTL = isMatchPlay ? buildMatchResult(ronda, parMap, siMap, courseHcpMap) : null
  const jugMP = ronda.ronda_libre_jugadores

  return (
    <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: '12px', padding: '14px 16px', marginBottom: '12px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px', marginBottom: '10px' }}>
        <span style={{ fontSize: '11px', color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.1em', fontWeight: 700 }}>Momentos recientes</span>
        {!isFinished && timeSinceUpdate && (
          <span style={{ fontSize: '11px', color: 'var(--text-3)' }}>{timeSinceUpdate}</span>
        )}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        {timelineEvents.map((event) => {
          const label = event.diff <= -2 ? 'Eagle' : event.diff === -1 ? 'Birdie' : event.diff === 0 ? 'Par' : event.diff === 1 ? 'Bogey' : `+${event.diff}`
          // Tokens theme-aware: la tarjeta va sobre --bg-surface (navy en oscuro), donde la paleta
          // de modo claro quedaba bajo AA. El resultado lo lleva el chip; la fila no se tiñe
          // (el birdie se teñía verde, contra la convención Garmin: birdie = celeste).
          const color = scoreFgVar(event.diff)
          const chipBg = event.diff === 0 ? 'transparent' : scoreCellStyle(event.score, event.score - event.diff).background

          // Match play context: find the match hole detail for this event
          let matchContext: string | null = null
          if (mrTL) {
            const holeDetail = mrTL.holes.find(h => h.numero === event.hole)
            if (holeDetail && holeDetail.result !== 'not_played') {
              const winnerName = (holeDetail.result === 'won_a' || holeDetail.result === 'conceded_b') ? jugMP[0].nombre
                : (holeDetail.result === 'won_b' || holeDetail.result === 'conceded_a') ? jugMP[1].nombre : null
              const stateText = holeDetail.matchState === 0 ? 'All Square'
                : holeDetail.matchState > 0 ? `${jugMP[0].nombre.split(' ')[0]} ${holeDetail.matchState} UP`
                : `${jugMP[1].nombre.split(' ')[0]} ${Math.abs(holeDetail.matchState)} UP`
              matchContext = winnerName
                ? `${winnerName.split(' ')[0]} gana hoyo → ${stateText}`
                : `Empate → ${stateText}`
            }
          }

          return (
            <div key={`${event.jugador}-${event.hole}`} style={{
              display: 'flex', alignItems: 'center', gap: '12px',
              padding: '8px 10px', borderRadius: '8px',
            }}>
              <Avatar name={event.jugador} size="md" />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: '14px', color: 'var(--text)', fontWeight: 700 }}>{event.jugador}</div>
                <div style={{ fontSize: '12px', color: 'var(--text-3)' }}>
                  Hoyo {event.hole} · {event.score} golpes
                </div>
                {/* Match play context line */}
                {matchContext && (
                  <div style={{ fontSize: '11px', color: 'var(--brand-on-bg)', fontWeight: 600, marginTop: '2px' }}>
                    {matchContext}
                  </div>
                )}
              </div>
              <span style={{
                color, fontSize: '13px', fontWeight: 700,
                padding: '2px 8px', borderRadius: '6px',
                background: chipBg,
                flexShrink: 0,
              }}>
                {label}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
