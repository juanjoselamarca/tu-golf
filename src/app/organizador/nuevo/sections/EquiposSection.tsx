'use client'

// src/app/organizador/nuevo/sections/EquiposSection.tsx
//
// Sección "Equipos" — visible solo para formatos por equipos:
// best_ball, scramble, foursome.
// Edita config.team_config.

import type { TournamentConfig, TeamConfig } from '@/lib/draft/types'
import { isTeamFormat } from '@/golf/formats'

export interface EquiposSectionProps {
  config: TournamentConfig
  applyChange: (partial: Partial<TournamentConfig>) => void
}

const DEFAULT_TEAM_CONFIG: TeamConfig = {
  size: 2,
  handicap_pct: 'usga_35_15',
  formation_mode: 'manual',
}

const HCP_OPTIONS = [
  {
    value: 'usga_35_15',
    title: 'USGA 35/15',
    desc: 'Recomendado scramble 2 jugadores. Mejor handicap al 35%, resto al 15%.',
  },
  {
    value: 'usga_25_15',
    title: 'USGA 25/15',
    desc: 'Recomendado scramble 3-4 jugadores. Mejor handicap al 25%, resto al 15%.',
  },
  {
    value: 'simple_avg',
    title: 'Promedio simple',
    desc: 'Promedio directo de los handicaps del equipo, sin ponderación.',
  },
  {
    value: 'custom',
    title: 'Custom',
    desc: 'Define tus propios porcentajes manualmente.',
  },
] as const

export function EquiposSection({ config, applyChange }: EquiposSectionProps) {
  if (!isTeamFormat(config.format)) {
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

      <fieldset style={{ ...fieldStyle, border: 'none', margin: 0, padding: 0 }}>
        <legend style={labelStyle}>% de handicap</legend>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 4 }}>
          {HCP_OPTIONS.map(opt => {
            const selected = tc.handicap_pct === opt.value
            return (
              <label
                key={opt.value}
                style={{
                  display: 'flex', alignItems: 'flex-start', gap: 10,
                  padding: '10px 12px', borderRadius: 10, cursor: 'pointer',
                  border: selected ? '1.5px solid #c4992a' : '1px solid var(--border, #e5e7eb)',
                  background: selected ? 'rgba(196,153,42,0.06)' : 'var(--input-bg, #ffffff)',
                  transition: 'border-color 0.15s, background 0.15s',
                }}
              >
                <input
                  type="radio"
                  name="handicap_pct"
                  value={opt.value}
                  checked={selected}
                  onChange={() => update({ handicap_pct: opt.value as TeamConfig['handicap_pct'] })}
                  style={{ marginTop: 3, accentColor: '#c4992a', flexShrink: 0 }}
                />
                <div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary, #111827)' }}>
                    {opt.title}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-secondary, #6b7280)', marginTop: 2, lineHeight: 1.4 }}>
                    {opt.desc}
                  </div>
                </div>
              </label>
            )
          })}
        </div>
      </fieldset>

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
