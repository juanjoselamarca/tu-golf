// Timeline de momentos recientes (con contexto match play). Verbatim del monolito,
// salvo que el MatchResult se calcula una sola vez (antes se recomputaba por evento).
import { Avatar } from '@/components/ui/Avatar'
import { getScoreColorLight } from '@/golf/core/colors'
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
    <div style={{ background: 'var(--bg-surface)', border: '1px solid #e5e7eb', borderRadius: '12px', padding: '14px 16px', marginBottom: '12px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px', marginBottom: '10px' }}>
        <span style={{ fontSize: '11px', color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.1em', fontWeight: 700 }}>Momentos recientes</span>
        {!isFinished && timeSinceUpdate && (
          <span style={{ fontSize: '11px', color: 'var(--text-3)' }}>{timeSinceUpdate}</span>
        )}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        {timelineEvents.map((event, idx) => {
          const label = event.diff <= -2 ? 'Eagle' : event.diff === -1 ? 'Birdie' : event.diff === 0 ? 'Par' : event.diff === 1 ? 'Bogey' : `+${event.diff}`
          const color = getScoreColorLight(event.diff)
          const bgColor = event.diff <= -2 ? 'rgba(200,165,90,0.08)' : event.diff === -1 ? 'rgba(22,163,74,0.06)' : event.diff >= 2 ? 'rgba(220,38,38,0.04)' : 'transparent'
          const approxMinAgo = idx === 0 ? 0 : idx
          const timeLabel = approxMinAgo === 0 ? 'ahora' : approxMinAgo === 1 ? 'hace 1 min' : `hace ${approxMinAgo} min`

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
              background: bgColor,
            }}>
              <Avatar name={event.jugador} size="md" />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: '14px', color: 'var(--text)', fontWeight: 700 }}>{event.jugador}</div>
                <div style={{ fontSize: '12px', color: 'var(--text-3)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span>Hoyo {event.hole} · {event.score} golpes</span>
                  <span style={{ color: '#d1d5db' }}>·</span>
                  <span style={{ fontStyle: 'italic' }}>{timeLabel}</span>
                </div>
                {/* Match play context line */}
                {matchContext && (
                  <div style={{ fontSize: '11px', color: '#c4992a', fontWeight: 600, marginTop: '2px' }}>
                    {matchContext}
                  </div>
                )}
              </div>
              <span style={{
                color, fontSize: '13px', fontWeight: 700,
                padding: '2px 8px', borderRadius: '6px',
                background: event.diff <= -1 ? `${color}12` : event.diff >= 1 ? `${color}12` : 'transparent',
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
