// Header oscuro de la vista live (título, curso, badge hoyos, last-update, live badge). Verbatim del monolito.

export interface RondaHeaderProps {
  isFinished: boolean
  isEnCurso: boolean
  courseName: string
  fechaDisplay: string
  holes: number
  timeSinceUpdate: string
}

export function RondaHeader({ isFinished, isEnCurso, courseName, fechaDisplay, holes, timeSinceUpdate }: RondaHeaderProps) {
  return (
    <div style={{ background: '#111827', borderBottom: '1px solid var(--border)', padding: '16px' }}>
      <div style={{ maxWidth: '640px', margin: '0 auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
          <div>
            <h1 style={{ fontFamily: '"Playfair Display", serif', fontSize: '20px', color: '#ffffff', margin: '0 0 4px' }}>
              {isFinished ? 'Resultado final' : 'Marcador en vivo'}
            </h1>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
              <div style={{ fontSize: '13px', color: 'var(--text-3)' }}>
                {courseName} · {fechaDisplay}
              </div>
              {/* Badge defensivo "9/18 HOYOS" */}
              <span style={{
                display: 'inline-block',
                padding: '3px 9px',
                background: holes <= 9 ? 'rgba(196,153,42,0.25)' : 'rgba(196,153,42,0.12)',
                color: '#c4992a',
                border: holes <= 9 ? '1px solid rgba(196,153,42,0.6)' : '1px solid rgba(196,153,42,0.3)',
                borderRadius: '999px',
                fontSize: '10px',
                fontWeight: 700,
                letterSpacing: '0.06em',
                fontFamily: 'DM Mono, monospace',
                textTransform: 'uppercase',
                whiteSpace: 'nowrap',
              }}>{holes} HOYOS</span>
            </div>
            {/* 9.2 — Last update timestamp */}
            {!isFinished && timeSinceUpdate && (
              <div style={{ fontSize: '11px', color: 'var(--text-2)', marginTop: '2px' }}>
                {timeSinceUpdate}
              </div>
            )}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px' }}>
            {/* 9.1 — Live indicator badge */}
            {isEnCurso ? (
              <span className="live-badge-pulse" style={{
                display: 'inline-flex', alignItems: 'center', gap: '6px',
                background: 'rgba(34,197,94,0.15)',
                color: '#22c55e',
                border: '1px solid rgba(34,197,94,0.4)',
                padding: '4px 12px', borderRadius: '20px', fontSize: '12px', fontWeight: 700,
                letterSpacing: '0.05em',
              }}>
                <span className="live-dot" style={{
                  width: '8px', height: '8px', borderRadius: '50%',
                  background: '#22c55e', display: 'inline-block', flexShrink: 0,
                }} />
                EN VIVO
              </span>
            ) : (
              <span style={{
                display: 'inline-flex', alignItems: 'center', gap: '5px',
                background: 'rgba(196,153,42,0.12)',
                color: '#c4992a',
                border: '1px solid rgba(196,153,42,0.35)',
                padding: '4px 12px', borderRadius: '20px', fontSize: '12px', fontWeight: 700,
                letterSpacing: '0.05em',
              }}>
                FINALIZADA
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
