// Tarjeta Club/Fecha/Jugadores/Formato. Verbatim del monolito.
import type { RondaLibre } from '@/types/ronda'

export function CourseInfoCard({ ronda, fechaDisplay }: { ronda: RondaLibre; fechaDisplay: string }) {
  return (
    <div
      style={{
        background: 'var(--bg-surface)',
        border: '1px solid #e5e7eb',
        borderRadius: '14px',
        padding: '16px',
        marginBottom: '12px',
      }}
    >
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '12px' }}>
        <div>
          <div style={{ fontSize: '11px', color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Club</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
            <div style={{ fontSize: '15px', color: 'var(--text)', fontWeight: 700 }}>{ronda.course_name}</div>
            <span style={{
              display: 'inline-block',
              padding: '2px 8px',
              background: ronda.holes <= 9 ? 'rgba(196,153,42,0.22)' : 'rgba(196,153,42,0.1)',
              color: '#c4992a',
              border: ronda.holes <= 9 ? '1px solid rgba(196,153,42,0.55)' : '1px solid rgba(196,153,42,0.28)',
              borderRadius: '999px',
              fontSize: '9px',
              fontWeight: 700,
              letterSpacing: '0.06em',
              fontFamily: 'DM Mono, monospace',
              textTransform: 'uppercase',
              whiteSpace: 'nowrap',
            }}>{ronda.holes}H</span>
          </div>
        </div>
        <div>
          <div style={{ fontSize: '11px', color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Fecha</div>
          <div style={{ fontSize: '15px', color: 'var(--text)', fontWeight: 700 }}>{fechaDisplay}</div>
        </div>
        <div>
          <div style={{ fontSize: '11px', color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Jugadores</div>
          <div style={{ fontSize: '15px', color: 'var(--text)', fontWeight: 700 }}>{ronda.ronda_libre_jugadores.length}</div>
        </div>
        <div>
          <div style={{ fontSize: '11px', color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Formato</div>
          <div style={{ fontSize: '15px', color: 'var(--text)', fontWeight: 700 }}>
            {(() => {
              if (ronda.formato_juego === 'stableford') return 'Stableford'
              const modoSuffix = ronda.modo_juego === 'neto' ? 'Neto' : 'Gross'
              if (ronda.formato_juego === 'match_play') return `Match Play ${modoSuffix}`
              if (ronda.formato_juego === 'best_ball') return `Best Ball ${modoSuffix}`
              if (ronda.formato_juego === 'scramble') return `Scramble ${modoSuffix}`
              if (ronda.formato_juego === 'foursome') return `Foursome ${modoSuffix}`
              return `Stroke Play ${modoSuffix} · ${ronda.holes}h`
            })()}
          </div>
        </div>
      </div>
    </div>
  )
}
