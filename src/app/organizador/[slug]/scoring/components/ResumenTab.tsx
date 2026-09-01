// Tab "Resumen" del scorer del organizador. NO calcula golf: proyecta el board
// del motor (`useResumenBoard`) — mismo motor y mismos números que la vista
// pública del torneo. "Terminado" es `isFinishedCard` y "¿tiene datos?" es
// `hasPlayData`, los mismos porteros del podio.

import { isFinishedCard, hasPlayData } from '@/golf/leaderboard'
import type { ResumenLider } from '@/golf/leaderboard/resumen-cards'
import type { Player } from '@/lib/golf-data'
import type { ScoringPlayer } from '@/lib/data/tournaments/scoring'
import type { UseResumenBoardReturn } from '../hooks/useResumenBoard'
import type { UseHcpEditorReturn } from '../hooks/useHcpEditor'

interface ResumenTabProps {
  board: UseResumenBoardReturn
  roster: ScoringPlayer[]
  hcpEditor: UseHcpEditorReturn
}

/** "Mejor Gross" cuando terminó · "Mejor Gross · en curso" mientras se juega. */
function liderLabel(base: string, l: ResumenLider | null): string {
  return l?.enCurso ? `${base} · en curso` : base
}

/** Golpes. Con el torneo a medias va el thru al lado: sin él el número miente. */
function liderValue(l: ResumenLider | null): string {
  if (!l) return '--'
  return l.enCurso ? `${l.score} (${l.thru})` : String(l.score)
}

function liderSub(l: ResumenLider | null): string {
  return l?.name?.split(' ')[0] || ''
}

const CARD_STYLE: React.CSSProperties = {
  background: 'var(--card-bg)',
  border: '1px solid var(--surface-border)',
  borderRadius: '12px',
  padding: '16px',
  textAlign: 'center',
}

function estadoDe(row: Player): { label: string; done: boolean } {
  if (isFinishedCard(row)) return { label: 'Completo', done: true }
  if (hasPlayData({ holesPlayed: row.holes })) return { label: 'En juego', done: false }
  return { label: 'Sin iniciar', done: false }
}

export function ResumenTab({ board, roster, hcpEditor }: ResumenTabProps) {
  const { cards, rows, loading, error, reload } = board

  if (error) {
    return (
      <div style={{ ...CARD_STYLE, padding: '32px' }}>
        <div style={{ color: 'var(--text)', marginBottom: '12px' }}>No pudimos cargar el resumen.</div>
        <button
          onClick={reload}
          style={{ background: 'rgba(196,153,42,0.12)', color: 'var(--brand-on-bg)', border: '1px solid rgba(196,153,42,0.3)', padding: '8px 20px', borderRadius: '8px', fontSize: '13px', cursor: 'pointer' }}
        >
          Reintentar
        </button>
      </div>
    )
  }

  if (loading && !cards) {
    return <div style={{ ...CARD_STYLE, padding: '32px', color: 'var(--text-2)' }}>Cargando resumen...</div>
  }

  const statCards = cards
    ? [
        // Con el torneo a medias se muestra el líder PARCIAL, rotulado y con su
        // thru: sin el "en curso" un 68 thru 12 se lee como un resultado, y sin
        // el thru no es comparable con un 68 thru 18.
        { label: 'Jugadores', value: `${cards.conScore}/${cards.totalJugadores}`, sub: `${cards.completos} completos` },
        { label: liderLabel('Mejor Gross', cards.mejorGross), value: liderValue(cards.mejorGross), sub: liderSub(cards.mejorGross) },
        { label: liderLabel('Mejor Neto', cards.mejorNeto), value: liderValue(cards.mejorNeto), sub: liderSub(cards.mejorNeto) },
      ]
    : []

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {/* Stats cards — números del MISMO motor que el board público */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '12px' }}>
        {statCards.map((c) => (
          <div key={c.label} style={CARD_STYLE}>
            <div style={{ fontSize: '11px', color: 'var(--text-2)', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{c.label}</div>
            <div style={{ fontSize: '24px', fontWeight: 700, color: 'var(--text)', fontFamily: '"Playfair Display", serif' }}>{c.value}</div>
            {c.sub && <div style={{ fontSize: '12px', color: 'var(--text-2)', marginTop: '4px' }}>{c.sub}</div>}
          </div>
        ))}
      </div>

      {/* Tabla de jugadores (orden del ranking del board) con handicap editable */}
      <div style={{ background: 'var(--card-bg)', border: '1px solid var(--surface-border)', borderRadius: '12px', overflow: 'hidden' }}>
        <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--surface-border)' }}>
          <span style={{ fontFamily: '"Playfair Display", serif', fontSize: '16px', color: 'var(--text)' }}>Jugadores</span>
          <span style={{ fontSize: '12px', color: 'var(--text-2)', marginLeft: '8px' }}>Toca el handicap para editar</span>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--surface-border)' }}>
                {['Jugador', 'HCP', 'Gross', 'Neto', 'Pts', 'Estado'].map((h) => (
                  <th key={h} style={{ color: 'var(--text-2)', fontWeight: 600, fontSize: '11px', letterSpacing: '0.05em', padding: '10px 12px', textAlign: h === 'Jugador' ? 'left' : 'center' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const rosterPlayer = roster.find((p) => p.id === row.id)
                const played = hasPlayData({ holesPlayed: row.holes })
                const estado = estadoDe(row)
                const isEditingThis = hcpEditor.editingId === row.id
                return (
                  <tr key={row.id ?? row.name} style={{ borderBottom: '1px solid var(--surface-soft)' }}>
                    <td style={{ padding: '10px 12px', color: 'var(--text)', fontWeight: 500 }}>{row.name}</td>
                    <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                      {isEditingThis && row.id ? (
                        <input
                          type="number"
                          step="0.1"
                          min={0}
                          max={54}
                          autoFocus
                          value={hcpEditor.editValue}
                          onChange={(e) => hcpEditor.setEditValue(e.target.value)}
                          onBlur={() => hcpEditor.save(row.id!)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') hcpEditor.save(row.id!)
                            if (e.key === 'Escape') hcpEditor.cancel()
                          }}
                          style={{ width: '56px', background: 'var(--bg)', border: '1px solid var(--brand-on-bg)', borderRadius: '4px', color: 'var(--text)', textAlign: 'center', fontSize: '13px', padding: '4px', outline: 'none' }}
                        />
                      ) : (
                        <button
                          onClick={() => row.id && hcpEditor.startEdit(row.id, rosterPlayer?.handicap_at_registration ?? null)}
                          style={{ background: 'transparent', border: '1px solid transparent', borderRadius: '4px', color: 'var(--brand-on-bg)', cursor: 'pointer', padding: '4px 8px', fontSize: '13px', fontWeight: 600 }}
                          title="Editar handicap"
                        >
                          {rosterPlayer?.handicap_at_registration ?? row.hcpDisplay ?? '--'}
                        </button>
                      )}
                    </td>
                    <td style={{ padding: '10px 12px', textAlign: 'center', color: 'var(--text)', fontWeight: 600 }}>
                      {played ? row.grossTotal ?? '--' : '--'}
                    </td>
                    <td style={{ padding: '10px 12px', textAlign: 'center', color: 'var(--text)' }}>
                      {played ? row.netTotal ?? '--' : '--'}
                    </td>
                    <td style={{ padding: '10px 12px', textAlign: 'center', color: 'var(--text)' }}>
                      {played && row.stablefordTotal ? row.stablefordTotal : '--'}
                    </td>
                    <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                      <span style={{
                        fontSize: '11px',
                        padding: '3px 8px',
                        borderRadius: '12px',
                        background: estado.done ? 'var(--status-live-bg)' : 'var(--surface-soft)',
                        color: estado.done ? 'var(--status-live-fg)' : 'var(--text-2)',
                        border: `1px solid ${estado.done ? 'rgba(22,163,74,0.3)' : 'var(--surface-border)'}`,
                      }}>
                        {estado.label}
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
