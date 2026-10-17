import { PersonStanding, Flag, Calendar } from '@/components/icons'
import type { JoinInfoTournament } from '@/lib/data/tournaments/joinFlow'

function formatDate(dateStr: string) {
  // date_start viene como 'YYYY-MM-DD' — agregar mediodía para evitar
  // que el timezone local corra la fecha un día atrás.
  return new Date(dateStr + 'T12:00:00').toLocaleDateString('es-CL', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}

function formatLabel(format: string) {
  const labels: Record<string, string> = {
    stroke_play: 'Stroke Play',
    match_play: 'Match Play',
    stableford: 'Stableford',
    scramble: 'Scramble',
    best_ball: 'Best Ball',
  }
  return labels[format] || format
}

/** Ficha del torneo al que el jugador se está inscribiendo: nombre, cancha, fecha y formato. */
export function TarjetaTorneoInscripcion({ tournament }: { tournament: JoinInfoTournament }) {
  return (
    <div
      style={{
        background: 'var(--surface-soft)',
        border: '1px solid var(--surface-border)',
        borderRadius: '14px',
        padding: '24px',
        marginBottom: '20px',
      }}
    >
      <div style={{ fontSize: '11px', color: 'var(--text-2)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '12px' }}>
        Torneo
      </div>
      <div style={{ fontFamily: '"Playfair Display", serif', fontSize: '20px', color: 'var(--text)', fontWeight: 700, marginBottom: '16px' }}>
        {tournament.name}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        {(tournament.courses?.nombre || tournament.course_name) && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Flag size={14} strokeWidth={1.5} style={{ display: 'inline', verticalAlign: 'middle' }} />
            <span style={{ fontSize: '14px', color: 'var(--text-2)' }}>
              {tournament.courses?.nombre || tournament.course_name}
              {tournament.courses?.ciudad && `, ${tournament.courses.ciudad}`}
            </span>
          </div>
        )}
        {tournament.date_start && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Calendar size={14} style={{ display: 'inline', verticalAlign: 'middle' }} />
            <span style={{ fontSize: '14px', color: 'var(--text-2)' }}>{formatDate(tournament.date_start)}</span>
          </div>
        )}
        {tournament.format && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <PersonStanding size={14} strokeWidth={1.5} style={{ display: 'inline', verticalAlign: 'middle' }} />
            <span style={{ fontSize: '14px', color: 'var(--text-2)' }}>{formatLabel(tournament.format)}</span>
          </div>
        )}
      </div>
    </div>
  )
}
