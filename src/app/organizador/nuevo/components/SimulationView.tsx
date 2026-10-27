// src/app/organizador/nuevo/components/SimulationView.tsx
//
// Leaderboard simulado de la vista previa del borrador (DraftPreviewModal):
// individual, Stableford, equipos, bracket y match play 1v1. Extraído del modal
// al pasar las 600 líneas (regla "el que toca, ordena").

import type { AnySimulationResult } from '@/lib/draft/simulators'

export function SimulationView({ result }: { result: AnySimulationResult }) {
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
              <td style={{ ...tdStyle, fontSize: 12, color: 'var(--text-secondary)' }}>
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
                          ? 'var(--text-primary)'
                          : 'var(--text-secondary)',
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
                          ? 'var(--text-primary)'
                          : 'var(--text-secondary)',
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
                    ? 'var(--text-primary)'
                    : 'var(--text-secondary)',
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
                    ? 'var(--text-primary)'
                    : 'var(--text-secondary)',
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

export const subtitleStyle: React.CSSProperties = {
  margin: '0 0 12px 0',
  fontSize: 13,
  color: 'var(--text-secondary)',
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
  color: 'var(--text-secondary)',
  borderBottom: '1px solid var(--border)',
}

const thStyleRight: React.CSSProperties = { ...thStyle, textAlign: 'right' }

const tdStyle: React.CSSProperties = {
  padding: '10px',
  color: 'var(--text-primary)',
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
  border: '1px solid var(--border)',
  borderRadius: 10,
  padding: 12,
  background: 'var(--card-bg)',
}

const bracketGroupTitleStyle: React.CSSProperties = {
  margin: '0 0 8px 0',
  fontSize: 14,
  fontWeight: 700,
  color: 'var(--text-primary)',
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
  background: 'var(--bg-surface)',
  border: '1px solid var(--border)',
  fontSize: 13,
}

const vsStyle: React.CSSProperties = {
  fontSize: 11,
  textTransform: 'uppercase',
  color: 'var(--text-secondary)',
  fontWeight: 600,
}

const resultStyle: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 700,
  color: 'var(--brand-gold)',
  padding: '2px 8px',
  background: 'rgba(196, 153, 42, 0.1)',
  borderRadius: 999,
}
