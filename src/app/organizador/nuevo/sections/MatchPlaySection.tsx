'use client'

// src/app/organizador/nuevo/sections/MatchPlaySection.tsx
//
// Sección "Match Play" — visible solo si format === 'match_play'.
// Edita config.match_play_config.

import type { TournamentConfig, MatchPlayConfig } from '@/lib/draft/types'

export interface MatchPlaySectionProps {
  config: TournamentConfig
  applyChange: (partial: Partial<TournamentConfig>) => void
}

const DEFAULT_MATCH_PLAY: MatchPlayConfig = {
  bracket_mode: 'single_elimination',
  handicap_diff: 'three_quarters',
  extra_holes_on_tie: true,
}

export function MatchPlaySection({ config, applyChange }: MatchPlaySectionProps) {
  if (config.format !== 'match_play') return null

  const mp: MatchPlayConfig = config.match_play_config ?? DEFAULT_MATCH_PLAY

  const update = (patch: Partial<MatchPlayConfig>) => {
    applyChange({ match_play_config: { ...mp, ...patch } })
  }

  return (
    <section style={cardStyle}>
      <h2 style={titleStyle}>Match Play</h2>

      <div style={fieldStyle}>
        <label style={labelStyle} htmlFor="t-mp-bracket">Modo de bracket</label>
        <select
          id="t-mp-bracket"
          style={inputStyle}
          value={mp.bracket_mode}
          onChange={(e) =>
            update({
              bracket_mode: e.target.value as MatchPlayConfig['bracket_mode'],
            })
          }
        >
          <option value="single_elimination">Eliminación simple</option>
          <option value="round_robin">Round robin (todos contra todos)</option>
          <option value="one_vs_one">1 vs 1 (duelo único)</option>
        </select>
      </div>

      <div style={fieldStyle}>
        <label style={labelStyle} htmlFor="t-mp-hcp-diff">Diferencia de handicap</label>
        <select
          id="t-mp-hcp-diff"
          style={inputStyle}
          value={mp.handicap_diff}
          onChange={(e) =>
            update({
              handicap_diff: e.target.value as MatchPlayConfig['handicap_diff'],
            })
          }
        >
          <option value="full">100% (diferencia completa)</option>
          <option value="three_quarters">75% (tres cuartos — recomendado USGA)</option>
          <option value="none">0% (sin handicap)</option>
        </select>
      </div>

      <div style={fieldStyle}>
        <label style={toggleLabelStyle}>
          <input
            type="checkbox"
            checked={mp.extra_holes_on_tie}
            onChange={(e) => update({ extra_holes_on_tie: e.target.checked })}
          />
          <span>Hoyos de desempate si quedan iguales</span>
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

const toggleLabelStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  fontSize: 14,
  color: 'var(--text-primary, #111827)',
  cursor: 'pointer',
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
