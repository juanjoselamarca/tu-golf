'use client'

// src/app/organizador/nuevo/sections/EquiposSection.tsx
//
// Sección "Equipos" — visible solo para formatos por equipos:
// best_ball, scramble, foursome. Edita config.team_config (lógica en
// `hooks/useTeamConfig`).
// El handicap del equipo es solo de bola compartida (scramble / foursome): en
// best ball cada jugador juega con su handicap de juego (`hcp_pct`, sección
// "Cómo juegan"). Foursome es siempre en parejas.

import type { TournamentConfig, TeamConfig } from '@/lib/draft/types'
import { isTeamFormat } from '@/golf/formats'
import { useTeamConfig, type TamanoEquipo } from '../hooks/useTeamConfig'
import { HandicapEquipoScramble } from '../components/HandicapEquipoScramble'
import { HandicapEquipoFoursome } from '../components/HandicapEquipoFoursome'
import { cardStyle, titleStyle, fieldStyle, labelStyle, inputStyle, helperStyle, addBtnStyle } from '../styles'

export interface EquiposSectionProps {
  config: TournamentConfig
  applyChange: (partial: Partial<TournamentConfig>) => void
}

export function EquiposSection({ config, applyChange }: EquiposSectionProps) {
  const equipo = useTeamConfig(config, applyChange)
  if (!isTeamFormat(config.format)) {
    return null
  }
  const { tc } = equipo
  const esFoursome = config.format === 'foursome'

  return (
    <section style={cardStyle}>
      <h2 style={titleStyle}>Equipos</h2>

      {esFoursome ? (
        <div style={fieldStyle}>
          <span style={labelStyle}>Tamaño de equipo</span>
          <p style={helperStyle}>Parejas: 2 jugadores por equipo.</p>
          {tc.size !== 2 && (
            <button type="button" style={{ ...addBtnStyle, minHeight: 44, borderStyle: 'solid', color: 'var(--brand-on-bg)' }} onClick={() => equipo.setTamano(2)}>
              Cambiar a parejas
            </button>
          )}
        </div>
      ) : (
        <div style={fieldStyle}>
          <label style={labelStyle} htmlFor="t-team-size">Tamaño de equipo</label>
          <select
            id="t-team-size"
            style={{ ...inputStyle, minHeight: 44 }}
            value={tc.size}
            onChange={(e) => equipo.setTamano(Number(e.target.value) as TamanoEquipo)}
          >
            <option value={2}>2 jugadores</option>
            <option value={3}>3 jugadores</option>
            <option value={4}>4 jugadores</option>
          </select>
        </div>
      )}

      {config.format === 'scramble' && (
        <HandicapEquipoScramble
          size={tc.size}
          modo={equipo.modo}
          porcentajes={equipo.porcentajes}
          onModo={equipo.setModo}
          onPorcentaje={equipo.setPorcentaje}
        />
      )}
      {esFoursome && (
        <HandicapEquipoFoursome
          modo={equipo.modo}
          porcentajeSuma={equipo.porcentajeSuma}
          onModo={equipo.setModo}
          onPorcentajeSuma={equipo.setPorcentajeSuma}
        />
      )}
      {config.format === 'best_ball' && config.modo === 'neto' && (
        <p style={{ margin: 0, fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.4 }}>
          En best ball cada jugador juega con su propio handicap. El porcentaje se elige en Cómo juegan, en Handicap de juego.
        </p>
      )}

      <div style={fieldStyle}>
        <label style={labelStyle} htmlFor="t-team-formation">Armado de equipos</label>
        <select
          id="t-team-formation"
          style={{ ...inputStyle, minHeight: 44 }}
          value={tc.formation_mode}
          onChange={(e) => equipo.setFormationMode(e.target.value as TeamConfig['formation_mode'])}
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
            style={{ ...inputStyle, minHeight: 44 }}
            value={tc.min_drives_per_player ?? 0}
            // Entero ≥ 0, como pide el schema: el input no puede producir 1.5.
            onChange={(e) => equipo.setMinDrives(Math.max(0, Math.round(Number(e.target.value) || 0)))}
          />
        </div>
      )}
    </section>
  )
}
