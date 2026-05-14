'use client'

// src/app/organizador/nuevo/sections/EquiposSection.tsx
//
// Sección "Equipos" — visible solo para formatos por equipos:
// best_ball, scramble, foursome.
// Edita config.team_config.

import type { TournamentConfig, TeamConfig } from '@/lib/draft/types'

export interface EquiposSectionProps {
  config: TournamentConfig
  applyChange: (partial: Partial<TournamentConfig>) => void
}

const VISIBLE_FORMATS = ['best_ball', 'scramble', 'foursome'] as const

const DEFAULT_TEAM_CONFIG: TeamConfig = {
  size: 2,
  handicap_pct: 'usga_35_15',
  formation_mode: 'manual',
}

export function EquiposSection({ config, applyChange }: EquiposSectionProps) {
  if (!VISIBLE_FORMATS.includes(config.format as typeof VISIBLE_FORMATS[number])) {
    return null
  }

  const tc: TeamConfig = config.team_config ?? DEFAULT_TEAM_CONFIG

  const update = (patch: Partial<TeamConfig>) => {
    applyChange({ team_config: { ...tc, ...patch } })
  }

  return (
    <section style={cardStyle}>
      <h2 style={titleStyle}>Equipos</h2>

      <div style={fieldStyle}>
        <label style={labelStyle} htmlFor="t-team-size">Tamaño de equipo</label>
        <select
          id="t-team-size"
          style={inputStyle}
          value={tc.size}
          onChange={(e) =>
            update({ size: Number(e.target.value) as 2 | 3 | 4 })
          }
        >
          <option value={2}>2 jugadores</option>
          <option value={3}>3 jugadores</option>
          <option value={4}>4 jugadores</option>
        </select>
      </div>

      <div style={fieldStyle}>
        <label style={labelStyle} htmlFor="t-team-hcp">% de handicap</label>
        <select
          id="t-team-hcp"
          style={inputStyle}
          value={tc.handicap_pct}
          onChange={(e) =>
            update({ handicap_pct: e.target.value as TeamConfig['handicap_pct'] })
          }
        >
          <option value="usga_35_15">USGA 35/15</option>
          <option value="usga_25_15">USGA 25/15</option>
          <option value="simple_avg">Promedio simple</option>
          <option value="custom">Custom</option>
        </select>
      </div>

      <div style={fieldStyle}>
        <label style={labelStyle} htmlFor="t-team-formation">Armado de equipos</label>
        <select
          id="t-team-formation"
          style={inputStyle}
          value={tc.formation_mode}
          onChange={(e) =>
            update({
              formation_mode: e.target.value as TeamConfig['formation_mode'],
            })
          }
        >
          <option value="manual">Manual (organizador arma)</option>
          <option value="random">Aleatorio</option>
          <option value="by_handicap">Por handicap</option>
          <option value="players_choose">Los jugadores eligen</option>
        </select>
      </div>

      {config.format === 'scramble' && (
        <div style={fieldStyle}>
          <label style={labelStyle} htmlFor="t-team-min-drives">
            Mínimo drives por jugador (scramble)
          </label>
          <input
            id="t-team-min-drives"
            type="number"
            min={0}
            step={1}
            style={inputStyle}
            value={tc.min_drives_per_player ?? 0}
            onChange={(e) =>
              update({
                min_drives_per_player: Math.max(0, Number(e.target.value) || 0),
              })
            }
          />
        </div>
      )}
    </section>
  )
}

const cardStyle: React.CSSProperties = {
  borderRadius: 14,
  border: '1px solid var(--border, #e5e7eb)',
  background: 'var(--card-bg, #f9fafb)',
  padding: 20,
  fontFamily: '"DM Sans", sans-serif',
  display: 'flex',
  flexDirection: 'column',
  gap: 14,
}

const titleStyle: React.CSSProperties = {
  margin: 0,
  fontSize: 18,
  fontWeight: 600,
  color: 'var(--text-primary, #111827)',
}

const fieldStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 6,
}

const labelStyle: React.CSSProperties = {
  fontSize: 13,
  fontWeight: 500,
  color: 'var(--text-secondary, #4b5563)',
}

const inputStyle: React.CSSProperties = {
  padding: '10px 12px',
  borderRadius: 10,
  border: '1px solid var(--border, #e5e7eb)',
  background: 'var(--input-bg, #ffffff)',
  color: 'var(--text-primary, #111827)',
  fontFamily: '"DM Sans", sans-serif',
  fontSize: 14,
  outline: 'none',
}
