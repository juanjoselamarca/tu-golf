// Tabla detallada hoyo-a-hoyo del match play. Verbatim del monolito.
import type { MatchResult } from '@/golf/formats/match-play'

export function MatchDetailTable({ mr, nombreA, nombreB }: { mr: MatchResult; nombreA: string; nombreB: string }) {
  return (
    <div style={{ overflowX: 'auto', marginTop: '12px', paddingTop: '8px' }}>
      <div style={{ fontSize: '10px', color: 'var(--text-3)', textTransform: 'uppercase', marginBottom: '6px', fontWeight: 600 }}>
        Detalle
      </div>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
        <thead>
          <tr style={{ background: '#111827', color: '#ffffff' }}>
            <th style={{ padding: '8px 6px', textAlign: 'left', fontWeight: 600, fontSize: '10px', width: '44px' }}>HOYO</th>
            <th style={{ padding: '8px 6px', textAlign: 'center', fontWeight: 600, fontSize: '10px' }}>{nombreA.split(' ')[0]}</th>
            <th style={{ padding: '8px 4px', textAlign: 'center', fontWeight: 600, fontSize: '10px', width: '52px' }}>ESTADO</th>
            <th style={{ padding: '8px 6px', textAlign: 'center', fontWeight: 600, fontSize: '10px' }}>{nombreB.split(' ')[0]}</th>
          </tr>
        </thead>
        <tbody>
          {mr.holes.filter(h => !h.afterMatchEnd && h.result !== 'not_played').map(h => {
            const winA = h.result === 'won_a' || h.result === 'conceded_b'
            const winB = h.result === 'won_b' || h.result === 'conceded_a'
            const stateColor = h.matchState > 0 ? '#16a34a' : h.matchState < 0 ? '#dc2626' : '#6b7280'
            const stateLabel = h.matchState === 0 ? 'AS' : `${Math.abs(h.matchState)}UP`

            return (
              <tr key={h.numero} style={{
                borderBottom: '1px solid #f3f4f6',
              }}>
                <td style={{ padding: '7px 6px', fontWeight: 600, color: 'var(--text)', fontSize: '11px' }}>
                  {h.numero}
                  <span style={{ fontSize: '9px', color: 'var(--text-3)', marginLeft: '3px' }}>P{h.par}</span>
                </td>
                <td style={{
                  padding: '7px 6px', textAlign: 'center', fontWeight: 700, fontSize: '13px',
                  color: winA ? '#16a34a' : '#374151',
                  background: winA ? 'rgba(22,163,74,0.06)' : 'transparent',
                  fontFamily: '"DM Mono", monospace',
                }}>
                  {h.grossA ?? '—'}
                  {h.strokesA > 0 && <span style={{ color: '#c4992a', marginLeft: '2px', fontSize: '9px' }}>{'●'.repeat(h.strokesA)}</span>}
                  {h.netoA != null && h.netoA !== h.grossA && (
                    <span style={{ fontSize: '9px', color: 'var(--text-2)', marginLeft: '2px' }}>({h.netoA})</span>
                  )}
                </td>
                <td style={{ padding: '4px 2px', textAlign: 'center' }}>
                  <span style={{
                    display: 'inline-block', padding: '2px 8px', borderRadius: '10px',
                    fontSize: '9px', fontWeight: 800, color: '#ffffff',
                    background: stateColor, letterSpacing: '0.02em',
                    minWidth: '32px',
                  }}>
                    {stateLabel}
                  </span>
                </td>
                <td style={{
                  padding: '7px 6px', textAlign: 'center', fontWeight: 700, fontSize: '13px',
                  color: winB ? '#16a34a' : '#374151',
                  background: winB ? 'rgba(22,163,74,0.06)' : 'transparent',
                  fontFamily: '"DM Mono", monospace',
                }}>
                  {h.grossB ?? '—'}
                  {h.strokesB > 0 && <span style={{ color: '#c4992a', marginLeft: '2px', fontSize: '9px' }}>{'●'.repeat(h.strokesB)}</span>}
                  {h.netoB != null && h.netoB !== h.grossB && (
                    <span style={{ fontSize: '9px', color: 'var(--text-2)', marginLeft: '2px' }}>({h.netoB})</span>
                  )}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
