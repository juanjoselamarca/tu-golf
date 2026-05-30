'use client'

// src/app/organizador/nuevo/sections/TeesSection.tsx
//
// Sección "Tees": radio per_player / per_category.
// Sincroniza el modo en TODAS las rondas a la vez.

import type { TournamentConfig, RoundConfig } from '@/lib/draft/types'

export interface TeesSectionProps {
  config: TournamentConfig
  applyChange: (partial: Partial<TournamentConfig>) => void
}

type TeeMode = RoundConfig['tee_assignment_mode']

export function TeesSection({ config, applyChange }: TeesSectionProps) {
  const rounds = config.rounds ?? []
  // Derivamos el modo: si todas las rondas coinciden, ése es el modo.
  // Si hay mezcla, por defecto mostramos per_player.
  const modes = new Set(rounds.map((r) => r.tee_assignment_mode))
  const currentMode: TeeMode =
    modes.size === 1 ? (rounds[0]?.tee_assignment_mode ?? 'per_player') : 'per_player'
  const mixed = modes.size > 1

  const setMode = (mode: TeeMode) => {
    const nextRounds = rounds.map((r) => ({ ...r, tee_assignment_mode: mode }))
    applyChange({ rounds: nextRounds })
  }

  return (
    <section style={cardStyle}>
      <h2 style={titleStyle}>Tees</h2>
      <p style={helperStyle}>
        Asignación de tee de salida. Aplica a todas las rondas del torneo.
      </p>

      {mixed && (
        <p style={warnStyle}>
          Hay rondas con modos distintos. Al elegir un modo acá, todas se sincronizan.
        </p>
      )}

      <div style={radioGroupStyle}>
        <label style={radioRowStyle(currentMode === 'per_player')}>
          <input
            type="radio"
            name="tee-mode"
            value="per_player"
            checked={currentMode === 'per_player'}
            onChange={() => setMode('per_player')}
          />
          <div style={radioTextStyle}>
            <span style={radioTitleStyle}>Por jugador</span>
            <span style={radioDescStyle}>
              Cada jugador elige su tee según handicap/género. Más preciso para slope/CR.
            </span>
          </div>
        </label>

        <label style={radioRowStyle(currentMode === 'per_category')}>
          <input
            type="radio"
            name="tee-mode"
            value="per_category"
            checked={currentMode === 'per_category'}
            onChange={() => setMode('per_category')}
          />
          <div style={radioTextStyle}>
            <span style={radioTitleStyle}>Por categoría</span>
            <span style={radioDescStyle}>
              Todos los jugadores de la misma categoría salen del mismo tee.
            </span>
          </div>
        </label>

        <label style={radioRowStyle(currentMode === 'manual')}>
          <input
            type="radio"
            name="tee-mode"
            value="manual"
            checked={currentMode === 'manual'}
            onChange={() => setMode('manual')}
          />
          <div style={radioTextStyle}>
            <span style={radioTitleStyle}>El admin asigna jugador por jugador</span>
            <span style={radioDescStyle}>
              Para casos especiales (senior que juega tee de varón, junior de tees
              adelantadas, etc.). Configurás el tee de cada jugador desde el panel
              de jugadores.
            </span>
          </div>
        </label>
      </div>
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
  gap: 12,
}

const titleStyle: React.CSSProperties = {
  margin: 0,
  fontSize: 18,
  fontWeight: 600,
  color: 'var(--text-primary, #111827)',
}

const helperStyle: React.CSSProperties = {
  margin: 0,
  fontSize: 13,
  color: 'var(--text-secondary, #4b5563)',
}

const warnStyle: React.CSSProperties = {
  margin: 0,
  padding: '8px 10px',
  borderRadius: 8,
  background: 'rgba(196, 153, 42, 0.14)',
  border: '1px solid rgba(196, 153, 42, 0.4)',
  fontSize: 12,
  color: 'var(--text-primary, #111827)',
}

const radioGroupStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 8,
}

function radioRowStyle(active: boolean): React.CSSProperties {
  return {
    display: 'flex',
    alignItems: 'flex-start',
    gap: 10,
    padding: 12,
    borderRadius: 10,
    border: active
      ? '1px solid var(--brand-gold, #c4992a)'
      : '1px solid var(--border, #e5e7eb)',
    background: active ? 'rgba(196, 153, 42, 0.08)' : 'var(--input-bg, #ffffff)',
    cursor: 'pointer',
  }
}

const radioTextStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 2,
}

const radioTitleStyle: React.CSSProperties = {
  fontSize: 14,
  fontWeight: 600,
  color: 'var(--text-primary, #111827)',
}

const radioDescStyle: React.CSSProperties = {
  fontSize: 12,
  color: 'var(--text-secondary, #4b5563)',
}
