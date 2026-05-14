'use client'

// src/app/organizador/nuevo/DraftPreviewModal.tsx
//
// Modal full-screen que muestra el leaderboard simulado del torneo.
// Al abrir hace POST /api/torneos/draft/{draftId}/preview.

import { useEffect, useState } from 'react'
import type { AnySimulationResult } from '@/lib/draft/simulators'

export interface DraftPreviewModalProps {
  draftId: string
  open: boolean
  onClose: () => void
}

type FetchState =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'ok'; simulation: AnySimulationResult; isSimulation: boolean }
  | { kind: 'unsupported'; message: string }
  | { kind: 'error'; message: string }

export function DraftPreviewModal({ draftId, open, onClose }: DraftPreviewModalProps) {
  const [state, setState] = useState<FetchState>({ kind: 'idle' })

  useEffect(() => {
    if (!open) return
    let cancelled = false
    setState({ kind: 'loading' })
    fetch(`/api/torneos/draft/${draftId}/preview`, { method: 'POST' })
      .then(async (res) => {
        if (cancelled) return
        if (res.ok) {
          const data = (await res.json()) as {
            ok: true
            simulation: AnySimulationResult
            is_simulation: boolean
          }
          setState({
            kind: 'ok',
            simulation: data.simulation,
            isSimulation: !!data.is_simulation,
          })
        } else if (res.status === 501) {
          let msg = 'Simulador no soportado para este formato aún'
          try {
            const j = (await res.json()) as { error?: string }
            if (j.error) msg = j.error
          } catch {
            /* body no JSON */
          }
          setState({ kind: 'unsupported', message: msg })
        } else {
          let msg = `Error ${res.status}`
          try {
            const j = (await res.json()) as { error?: string }
            if (j.error) msg = j.error
          } catch {
            /* body no JSON */
          }
          setState({ kind: 'error', message: msg })
        }
      })
      .catch((err: unknown) => {
        if (cancelled) return
        setState({
          kind: 'error',
          message: err instanceof Error ? err.message : 'Error de red',
        })
      })
    return () => {
      cancelled = true
    }
  }, [open, draftId])

  // ESC para cerrar
  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open, onClose])

  if (!open) return null

  return (
    <div style={backdropStyle} onClick={onClose} role="dialog" aria-modal="true">
      <div style={modalStyle} onClick={(e) => e.stopPropagation()}>
        <header style={headerStyle}>
          <h2 style={titleStyle}>Vista previa del torneo</h2>
          <button type="button" style={closeBtnStyle} onClick={onClose} aria-label="Cerrar">
            ×
          </button>
        </header>

        <div style={bodyStyle}>
          {state.kind === 'loading' && <LoadingState />}
          {state.kind === 'unsupported' && <NoticeState title="Sin simulador" message={state.message} />}
          {state.kind === 'error' && <NoticeState title="Error" message={state.message} tone="error" />}
          {state.kind === 'ok' && <SimulationView result={state.simulation} />}
        </div>
      </div>
    </div>
  )
}

function LoadingState() {
  return (
    <div style={loadingStyle}>
      <p style={loadingTextStyle}>Generando vista previa...</p>
    </div>
  )
}

function NoticeState({
  title,
  message,
  tone = 'info',
}: {
  title: string
  message: string
  tone?: 'info' | 'error'
}) {
  return (
    <div
      style={{
        ...noticeStyle,
        background: tone === 'error' ? 'rgba(239, 68, 68, 0.08)' : 'rgba(196, 153, 42, 0.08)',
        color: tone === 'error' ? '#b91c1c' : '#854d0e',
        borderColor: tone === 'error' ? 'rgba(239, 68, 68, 0.25)' : 'rgba(196, 153, 42, 0.3)',
      }}
    >
      <strong style={{ display: 'block', marginBottom: 4 }}>{title}</strong>
      {message}
    </div>
  )
}

function SimulationView({ result }: { result: AnySimulationResult }) {
  if (result.kind === 'individual') {
    return <IndividualLeaderboard result={result} />
  }
  if (result.kind === 'stableford') {
    return <StablefordLeaderboard result={result} />
  }
  if (result.kind === 'team') {
    return <TeamLeaderboard result={result} />
  }
  if (result.kind === 'match_play_bracket') {
    return <BracketView result={result} />
  }
  if (result.kind === 'match_play_1v1') {
    return <MatchPlay1v1View result={result} />
  }
  return null
}

function sumScores(scores: number[]): number {
  return scores.reduce((a, b) => a + b, 0)
}

function IndividualLeaderboard({
  result,
}: {
  result: Extract<AnySimulationResult, { kind: 'individual' }>
}) {
  const rows = result.players
    .map((p) => ({ name: p.name, total: sumScores(p.scores), hcp: p.handicap_index }))
    .sort((a, b) => a.total - b.total)
  return (
    <>
      <p style={subtitleStyle}>
        Formato: {prettyFormat(result.format)} · {result.hole_count} hoyos · datos simulados
      </p>
      <table style={tableStyle}>
        <thead>
          <tr>
            <th style={thStyle}>Pos</th>
            <th style={thStyle}>Jugador</th>
            <th style={thStyleRight}>HCP</th>
            <th style={thStyleRight}>Total</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={r.name} style={i % 2 === 0 ? undefined : trAltStyle}>
              <td style={tdStyle}>{i + 1}</td>
              <td style={tdStyle}>{r.name}</td>
              <td style={tdStyleRight}>{r.hcp.toFixed(1)}</td>
              <td style={tdStyleRight}>{r.total}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  )
}

function StablefordLeaderboard({
  result,
}: {
  result: Extract<AnySimulationResult, { kind: 'stableford' }>
}) {
  const rows = result.players
    .map((p) => ({ name: p.name, points: p.total_points, hcp: p.handicap_index }))
    .sort((a, b) => b.points - a.points)
  return (
    <>
      <p style={subtitleStyle}>
        Formato: Stableford · {result.hole_count} hoyos · datos simulados
      </p>
      <table style={tableStyle}>
        <thead>
          <tr>
            <th style={thStyle}>Pos</th>
            <th style={thStyle}>Jugador</th>
            <th style={thStyleRight}>HCP</th>
            <th style={thStyleRight}>Puntos</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={r.name} style={i % 2 === 0 ? undefined : trAltStyle}>
              <td style={tdStyle}>{i + 1}</td>
              <td style={tdStyle}>{r.name}</td>
              <td style={tdStyleRight}>{r.hcp.toFixed(1)}</td>
              <td style={tdStyleRight}>{r.points}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  )
}

function TeamLeaderboard({
  result,
}: {
  result: Extract<AnySimulationResult, { kind: 'team' }>
}) {
  const rows = result.teams
    .map((t) => ({
      name: t.team_name,
      players: t.players.map((p) => p.name).join(', '),
      total: sumScores(t.scores),
    }))
    .sort((a, b) => a.total - b.total)
  return (
    <>
      <p style={subtitleStyle}>
        Formato: {prettyFormat(result.format)} · {result.hole_count} hoyos · datos simulados
      </p>
      <table style={tableStyle}>
        <thead>
          <tr>
            <th style={thStyle}>Pos</th>
            <th style={thStyle}>Equipo</th>
            <th style={thStyle}>Jugadores</th>
            <th style={thStyleRight}>Total</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={r.name} style={i % 2 === 0 ? undefined : trAltStyle}>
              <td style={tdStyle}>{i + 1}</td>
              <td style={tdStyle}>{r.name}</td>
              <td style={{ ...tdStyle, fontSize: 12, color: 'var(--text-secondary, #6b7280)' }}>
                {r.players}
              </td>
              <td style={tdStyleRight}>{r.total}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  )
}

function BracketView({
  result,
}: {
  result: Extract<AnySimulationResult, { kind: 'match_play_bracket' }>
}) {
  // Agrupamos por round_label
  const groups = new Map<string, typeof result.matches>()
  for (const m of result.matches) {
    const arr = groups.get(m.round_label) ?? []
    arr.push(m)
    groups.set(m.round_label, arr)
  }
  return (
    <>
      <p style={subtitleStyle}>
        Bracket simulado · {result.bracket_mode === 'round_robin' ? 'Round robin' : 'Eliminación directa'} ·{' '}
        {result.hole_count} hoyos
      </p>
      <div style={bracketStyle}>
        {Array.from(groups.entries()).map(([label, matches]) => (
          <section key={label} style={bracketGroupStyle}>
            <h3 style={bracketGroupTitleStyle}>{label}</h3>
            <ul style={matchesListStyle}>
              {matches.map((m) => (
                <li key={m.match_id} style={matchItemStyle}>
                  <span
                    style={{
                      fontWeight: m.winner === 'a' ? 700 : 400,
                      color:
                        m.winner === 'a'
                          ? 'var(--text-primary, #111827)'
                          : 'var(--text-secondary, #6b7280)',
                    }}
                  >
                    {m.player_a.name}
                  </span>
                  <span style={vsStyle}>vs</span>
                  <span
                    style={{
                      fontWeight: m.winner === 'b' ? 700 : 400,
                      color:
                        m.winner === 'b'
                          ? 'var(--text-primary, #111827)'
                          : 'var(--text-secondary, #6b7280)',
                    }}
                  >
                    {m.player_b.name}
                  </span>
                  <span style={resultStyle}>{m.result}</span>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </>
  )
}

function MatchPlay1v1View({
  result,
}: {
  result: Extract<AnySimulationResult, { kind: 'match_play_1v1' }>
}) {
  return (
    <>
      <p style={subtitleStyle}>
        Match Play 1v1 · {result.hole_count} hoyos · datos simulados
      </p>
      <ul style={matchesListStyle}>
        {result.matches.map((m) => (
          <li key={m.match_id} style={matchItemStyle}>
            <span
              style={{
                fontWeight: m.winner === 'a' ? 700 : 400,
                color:
                  m.winner === 'a'
                    ? 'var(--text-primary, #111827)'
                    : 'var(--text-secondary, #6b7280)',
              }}
            >
              {m.player_a.name}
            </span>
            <span style={vsStyle}>vs</span>
            <span
              style={{
                fontWeight: m.winner === 'b' ? 700 : 400,
                color:
                  m.winner === 'b'
                    ? 'var(--text-primary, #111827)'
                    : 'var(--text-secondary, #6b7280)',
              }}
            >
              {m.player_b.name}
            </span>
            <span style={resultStyle}>{m.final_result}</span>
          </li>
        ))}
      </ul>
    </>
  )
}

function prettyFormat(format: string): string {
  switch (format) {
    case 'stroke_play':
      return 'Stroke Play'
    case 'stableford':
      return 'Stableford'
    case 'best_ball':
      return 'Best Ball'
    case 'scramble':
      return 'Scramble'
    case 'foursome':
      return 'Foursome'
    case 'match_play':
      return 'Match Play'
    default:
      return format
  }
}

const backdropStyle: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(10, 20, 25, 0.7)',
  zIndex: 1000,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: 16,
  fontFamily: '"DM Sans", sans-serif',
}

const modalStyle: React.CSSProperties = {
  background: '#ffffff',
  borderRadius: 14,
  width: '100%',
  maxWidth: 900,
  maxHeight: '90vh',
  overflow: 'hidden',
  display: 'flex',
  flexDirection: 'column',
  boxShadow: '0 10px 40px rgba(0,0,0,0.25)',
}

const headerStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: '14px 20px',
  borderBottom: '1px solid var(--border, #e5e7eb)',
}

const titleStyle: React.CSSProperties = {
  margin: 0,
  fontSize: 18,
  fontWeight: 700,
  color: 'var(--text-primary, #111827)',
}

const closeBtnStyle: React.CSSProperties = {
  appearance: 'none',
  background: 'transparent',
  border: 'none',
  fontSize: 28,
  lineHeight: 1,
  cursor: 'pointer',
  color: 'var(--text-secondary, #6b7280)',
  padding: '0 4px',
}

const bodyStyle: React.CSSProperties = {
  padding: 20,
  overflowY: 'auto',
  flex: '1 1 auto',
}

const subtitleStyle: React.CSSProperties = {
  margin: '0 0 12px 0',
  fontSize: 13,
  color: 'var(--text-secondary, #6b7280)',
}

const tableStyle: React.CSSProperties = {
  width: '100%',
  borderCollapse: 'collapse',
  fontSize: 14,
}

const thStyle: React.CSSProperties = {
  textAlign: 'left',
  padding: '8px 10px',
  fontWeight: 600,
  fontSize: 12,
  textTransform: 'uppercase',
  letterSpacing: 0.4,
  color: 'var(--text-secondary, #6b7280)',
  borderBottom: '1px solid var(--border, #e5e7eb)',
}

const thStyleRight: React.CSSProperties = { ...thStyle, textAlign: 'right' }

const tdStyle: React.CSSProperties = {
  padding: '10px',
  color: 'var(--text-primary, #111827)',
}

const tdStyleRight: React.CSSProperties = { ...tdStyle, textAlign: 'right' }

const trAltStyle: React.CSSProperties = {
  background: 'rgba(0,0,0,0.02)',
}

const bracketStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 16,
}

const bracketGroupStyle: React.CSSProperties = {
  border: '1px solid var(--border, #e5e7eb)',
  borderRadius: 10,
  padding: 12,
  background: 'var(--card-bg, #f9fafb)',
}

const bracketGroupTitleStyle: React.CSSProperties = {
  margin: '0 0 8px 0',
  fontSize: 14,
  fontWeight: 700,
  color: 'var(--text-primary, #111827)',
  textTransform: 'uppercase',
  letterSpacing: 0.5,
}

const matchesListStyle: React.CSSProperties = {
  listStyle: 'none',
  margin: 0,
  padding: 0,
  display: 'flex',
  flexDirection: 'column',
  gap: 6,
}

const matchItemStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '1fr auto 1fr auto',
  alignItems: 'center',
  gap: 8,
  padding: '8px 10px',
  borderRadius: 8,
  background: '#ffffff',
  border: '1px solid var(--border, #e5e7eb)',
  fontSize: 13,
}

const vsStyle: React.CSSProperties = {
  fontSize: 11,
  textTransform: 'uppercase',
  color: 'var(--text-secondary, #6b7280)',
  fontWeight: 600,
}

const resultStyle: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 700,
  color: 'var(--brand-gold, #c4992a)',
  padding: '2px 8px',
  background: 'rgba(196, 153, 42, 0.1)',
  borderRadius: 999,
}

const loadingStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '40px 20px',
}

const loadingTextStyle: React.CSSProperties = {
  fontSize: 14,
  color: 'var(--text-secondary, #6b7280)',
}

const noticeStyle: React.CSSProperties = {
  padding: 16,
  borderRadius: 10,
  border: '1px solid',
  fontSize: 14,
}
