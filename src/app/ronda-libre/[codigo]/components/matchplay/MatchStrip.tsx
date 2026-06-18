// Strip compacto hoyo-a-hoyo del match play (estilo Ryder Cup). Verbatim del monolito.
import type { MatchResult, MatchHoleDetail } from '@/golf/formats/match-play'

export function MatchStrip({ mr, nombreA, nombreB }: { mr: MatchResult; nombreA: string; nombreB: string }) {
  const playedHoles = mr.holes.filter(h => !h.afterMatchEnd && h.result !== 'not_played')
  const firstName = nombreA.split(' ')[0]
  const secondName = nombreB.split(' ')[0]

  const renderCell = (h: MatchHoleDetail) => {
    const winA = h.result === 'won_a' || h.result === 'conceded_b'
    const winB = h.result === 'won_b' || h.result === 'conceded_a'
    const bg = winA ? '#16a34a' : winB ? '#dc2626' : '#94a8c0'
    const color = '#ffffff'
    const label = winA ? firstName[0]?.toUpperCase() ?? 'A' : winB ? secondName[0]?.toUpperCase() ?? 'B' : '='
    return (
      <div
        key={h.numero}
        title={`Hoyo ${h.numero} · Par ${h.par} · ${winA ? `${firstName} gana` : winB ? `${secondName} gana` : 'Empate'}`}
        style={{
          flex: '0 0 auto',
          minWidth: '30px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '3px',
        }}
      >
        <div style={{ fontSize: '9px', color: 'var(--text-3)', fontWeight: 600, lineHeight: 1 }}>{h.numero}</div>
        <div style={{
          width: '28px',
          height: '28px',
          borderRadius: '8px',
          background: bg,
          color,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: '11px',
          fontWeight: 800,
          letterSpacing: '0.02em',
          boxShadow: '0 1px 2px rgba(0,0,0,0.06)',
        }}>
          {label}
        </div>
      </div>
    )
  }

  return (
    <div style={{ marginTop: '16px', borderTop: '1px solid #e5e7eb', paddingTop: '12px' }}>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px',
      }}>
        <div style={{ fontSize: '11px', color: 'var(--text-3)', textTransform: 'uppercase', fontWeight: 600 }}>
          Hoyo a hoyo
        </div>
        <div style={{ display: 'flex', gap: '10px', fontSize: '9px', color: 'var(--text-2)', fontWeight: 600 }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
            <span style={{ width: '10px', height: '10px', borderRadius: '3px', background: '#16a34a' }} />
            {firstName}
          </span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
            <span style={{ width: '10px', height: '10px', borderRadius: '3px', background: '#94a8c0' }} />
            Empate
          </span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
            <span style={{ width: '10px', height: '10px', borderRadius: '3px', background: '#dc2626' }} />
            {secondName}
          </span>
        </div>
      </div>
      <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch', paddingBottom: '4px' }}>
        <div style={{ display: 'flex', gap: '6px', minWidth: 'min-content' }}>
          {playedHoles.slice(0, 9).map(renderCell)}
          {playedHoles.length > 9 && (
            <div style={{ width: '1px', background: '#e5e7eb', margin: '8px 2px' }} />
          )}
          {playedHoles.slice(9).map(renderCell)}
        </div>
      </div>
    </div>
  )
}
