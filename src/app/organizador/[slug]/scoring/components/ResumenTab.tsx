// Tab "Resumen" del scorer del organizador.
//
// NOTA: este componente conserva (a propósito, para no mezclar scopes en el
// commit de refactor) la lógica HISTÓRICA de la página: tarjetas y tabla leídas
// de `rounds[0]` y sus columnas denormalizadas. Esa lógica MIENTE en prod
// ('completed' no existe como status; total_net queda en 0) y se reemplaza por
// el motor del board público en el commit siguiente.

import type { ScoringPlayer } from '@/lib/data/tournaments/scoring'
import type { UseHcpEditorReturn } from '../hooks/useHcpEditor'

interface ResumenTabProps {
  roster: ScoringPlayer[]
  hcpEditor: UseHcpEditorReturn
}

export function ResumenTab({ roster, hcpEditor }: ResumenTabProps) {
  const completed = roster.filter((p) => p.rounds?.[0]?.status === 'completed').length
  const withScores = roster.filter((p) => p.rounds?.[0]?.total_gross > 0).length
  const bestGross = roster.reduce((best, p) => {
    const g = p.rounds?.[0]?.total_gross
    return g && g > 0 && (!best || g < best.score) ? { name: p.profiles?.name ?? '', score: g } : best
  }, null as { name: string; score: number } | null)
  const bestNet = roster.reduce((best, p) => {
    const n = p.rounds?.[0]?.total_net
    return n != null && n !== 0 && (!best || n < best.score) ? { name: p.profiles?.name ?? '', score: n } : best
  }, null as { name: string; score: number } | null)

  const cards = [
    { label: 'Jugadores', value: `${withScores}/${roster.length}`, sub: `${completed} completos` },
    { label: 'Mejor Gross', value: bestGross ? String(bestGross.score) : '--', sub: bestGross?.name?.split(' ')[0] || '' },
    { label: 'Mejor Neto', value: bestNet ? String(bestNet.score) : '--', sub: bestNet?.name?.split(' ')[0] || '' },
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {/* Stats cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '12px' }}>
        {cards.map((c) => (
          <div key={c.label} style={{ background: 'rgba(14,28,47,0.92)', border: '1px solid rgba(196,153,42,0.15)', borderRadius: '12px', padding: '16px', textAlign: 'center' }}>
            <div style={{ fontSize: '11px', color: 'var(--text-2)', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{c.label}</div>
            <div style={{ fontSize: '24px', fontWeight: 700, color: 'var(--text)', fontFamily: '"Playfair Display", serif' }}>{c.value}</div>
            {c.sub && <div style={{ fontSize: '12px', color: 'var(--text-2)', marginTop: '4px' }}>{c.sub}</div>}
          </div>
        ))}
      </div>

      {/* Tabla de jugadores con handicap editable */}
      <div style={{ background: 'rgba(14,28,47,0.92)', border: '1px solid rgba(196,153,42,0.15)', borderRadius: '12px', overflow: 'hidden' }}>
        <div style={{ padding: '14px 20px', borderBottom: '1px solid rgba(196,153,42,0.1)' }}>
          <span style={{ fontFamily: '"Playfair Display", serif', fontSize: '16px', color: 'var(--text)' }}>Jugadores</span>
          <span style={{ fontSize: '12px', color: 'var(--text-2)', marginLeft: '8px' }}>Toca el handicap para editar</span>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid rgba(122,143,168,0.15)' }}>
                {['Jugador', 'HCP', 'Gross', 'Neto', 'Pts', 'Estado'].map((h) => (
                  <th key={h} style={{ color: 'var(--text-2)', fontWeight: 600, fontSize: '11px', letterSpacing: '0.05em', padding: '10px 12px', textAlign: h === 'Jugador' ? 'left' : 'center' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {roster.map((p) => {
                const round = p.rounds?.[0]
                const isDone = round?.status === 'completed'
                const isEditingThis = hcpEditor.editingId === p.id
                return (
                  <tr key={p.id} style={{ borderBottom: '1px solid rgba(122,143,168,0.06)' }}>
                    <td style={{ padding: '10px 12px', color: 'var(--text)', fontWeight: 500 }}>{p.profiles?.name || '--'}</td>
                    <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                      {isEditingThis ? (
                        <input
                          type="number"
                          step="0.1"
                          min={0}
                          max={54}
                          autoFocus
                          value={hcpEditor.editValue}
                          onChange={(e) => hcpEditor.setEditValue(e.target.value)}
                          onBlur={() => hcpEditor.save(p.id)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') hcpEditor.save(p.id)
                            if (e.key === 'Escape') hcpEditor.cancel()
                          }}
                          style={{ width: '56px', background: 'var(--bg)', border: '1px solid #c4992a', borderRadius: '4px', color: 'var(--text)', textAlign: 'center', fontSize: '13px', padding: '4px', outline: 'none' }}
                        />
                      ) : (
                        <button
                          onClick={() => hcpEditor.startEdit(p.id, p.handicap_at_registration)}
                          style={{ background: 'transparent', border: '1px solid transparent', borderRadius: '4px', color: '#c4992a', cursor: 'pointer', padding: '4px 8px', fontSize: '13px', fontWeight: 600 }}
                          title="Editar handicap"
                        >
                          {p.handicap_at_registration ?? '--'}
                        </button>
                      )}
                    </td>
                    <td style={{ padding: '10px 12px', textAlign: 'center', color: 'var(--text)', fontWeight: 600 }}>{round?.total_gross || '--'}</td>
                    <td style={{ padding: '10px 12px', textAlign: 'center', color: 'var(--text)' }}>{round?.total_net || '--'}</td>
                    <td style={{ padding: '10px 12px', textAlign: 'center', color: 'var(--text)' }}>{round?.total_points || '--'}</td>
                    <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                      <span style={{
                        fontSize: '11px',
                        padding: '3px 8px',
                        borderRadius: '12px',
                        background: isDone ? 'rgba(22,163,74,0.15)' : 'rgba(122,143,168,0.1)',
                        color: isDone ? '#4ade80' : '#4a5568',
                        border: `1px solid ${isDone ? 'rgba(22,163,74,0.3)' : 'rgba(122,143,168,0.2)'}`,
                      }}>
                        {isDone ? 'Completo' : 'En juego'}
                      </span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
