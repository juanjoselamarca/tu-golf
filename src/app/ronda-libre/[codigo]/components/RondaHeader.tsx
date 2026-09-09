// Header oscuro de la vista live — consolida toda la meta-info de la ronda
// (curso, fecha, formato, jugadores, estado) en un solo bloque compacto.
// Eliminó la necesidad del CourseInfoCard separado (fix inbox cd5583d9).

import { formatLabel } from '@/golf/core/rules'

export interface RondaHeaderProps {
  isFinished: boolean
  isEnCurso: boolean
  courseName: string
  fechaDisplay: string
  holes: number
  timeSinceUpdate: string
  formatoJuego: string
  modoJuego: string
  jugadoresCount: number
}

export function RondaHeader({
  isFinished, isEnCurso, courseName, fechaDisplay, holes,
  timeSinceUpdate, formatoJuego, modoJuego, jugadoresCount,
}: RondaHeaderProps) {
  const formatoDisplay = formatLabel(formatoJuego, modoJuego)

  return (
    <div style={{ background: '#111827', borderBottom: '1px solid var(--border)', padding: '16px' }}>
      <div style={{ maxWidth: '640px', margin: '0 auto' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '12px' }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
              <h1 style={{ fontFamily: '"Playfair Display", serif', fontSize: '20px', color: '#ffffff', margin: 0 }}>
                {isFinished ? 'Resultado final' : 'Marcador en vivo'}
              </h1>
              {isEnCurso ? (
                <span className="live-badge-pulse" style={{
                  display: 'inline-flex', alignItems: 'center', gap: '5px',
                  background: 'rgba(34,197,94,0.15)',
                  color: 'var(--status-live-fg)',
                  border: '1px solid rgba(34,197,94,0.4)',
                  padding: '3px 10px', borderRadius: '20px', fontSize: '10px', fontWeight: 700,
                  letterSpacing: '0.05em', flexShrink: 0,
                }}>
                  <span className="live-dot" style={{
                    width: '6px', height: '6px', borderRadius: '50%',
                    background: 'var(--status-live-fg)', display: 'inline-block', flexShrink: 0,
                  }} />
                  EN VIVO
                </span>
              ) : (
                <span style={{
                  display: 'inline-flex', alignItems: 'center',
                  background: 'rgba(196,153,42,0.12)',
                  color: 'var(--brand-on-bg)',
                  border: '1px solid rgba(196,153,42,0.35)',
                  padding: '3px 10px', borderRadius: '20px', fontSize: '10px', fontWeight: 700,
                  letterSpacing: '0.05em', flexShrink: 0,
                }}>
                  FINALIZADA
                </span>
              )}
            </div>

            <div style={{ fontSize: '14px', color: 'var(--text)', fontWeight: 600, marginBottom: '2px' }}>
              {courseName}
            </div>

            <div style={{
              display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap',
              fontSize: '12px', color: 'var(--text-3)', fontFamily: '"DM Mono", monospace',
            }}>
              <span>{fechaDisplay}</span>
              <span style={{ opacity: 0.4 }}>·</span>
              <span>{formatoDisplay}</span>
              <span style={{ opacity: 0.4 }}>·</span>
              <span>{jugadoresCount} jugador{jugadoresCount !== 1 ? 'es' : ''}</span>
              <span style={{ opacity: 0.4 }}>·</span>
              <span style={{
                display: 'inline-block',
                padding: '1px 7px',
                background: holes <= 9 ? 'rgba(196,153,42,0.25)' : 'rgba(196,153,42,0.12)',
                color: 'var(--brand-on-bg)',
                border: holes <= 9 ? '1px solid rgba(196,153,42,0.6)' : '1px solid rgba(196,153,42,0.3)',
                borderRadius: '999px',
                fontSize: '10px',
                fontWeight: 700,
                letterSpacing: '0.06em',
                textTransform: 'uppercase',
              }}>{holes}H</span>
            </div>

            {!isFinished && timeSinceUpdate && (
              <div style={{ fontSize: '11px', color: 'var(--text-2)', marginTop: '4px' }}>
                {timeSinceUpdate}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
