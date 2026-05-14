'use client'

// src/app/organizador/nuevo/sections/ComoJueganSection.tsx
//
// Sección "Cómo juegan":
// - formato (chips)
// - modo gross/neto (chips, forzado neto para stableford/match_play)
//
// Hoyos por ronda: única fuente es RondasSection (cada ronda define sus hoyos).

import type { TournamentConfig, TournamentFormat, ScoringMode } from '@/lib/draft/types'

export interface ComoJueganSectionProps {
  config: TournamentConfig
  applyChange: (partial: Partial<TournamentConfig>) => void
}

const FORMAT_OPTIONS: Array<{ value: TournamentFormat; label: string }> = [
  { value: 'stroke_play', label: 'Stroke Play' },
  { value: 'stableford', label: 'Stableford' },
  { value: 'best_ball', label: 'Best Ball' },
  { value: 'scramble', label: 'Scramble' },
  { value: 'match_play', label: 'Match Play' },
  { value: 'foursome', label: 'Foursome' },
]

const NETO_FORCED: TournamentFormat[] = ['stableford', 'match_play']

export function ComoJueganSection({ config, applyChange }: ComoJueganSectionProps) {
  const netoForced = NETO_FORCED.includes(config.format)

  const setFormat = (format: TournamentFormat) => {
    const partial: Partial<TournamentConfig> = { format }
    // Si el nuevo formato fuerza neto, ajustamos el modo también
    if (NETO_FORCED.includes(format) && config.modo !== 'neto') {
      partial.modo = 'neto'
    }
    applyChange(partial)
  }

  const setModo = (modo: ScoringMode) => {
    if (netoForced && modo === 'gross') return
    applyChange({ modo })
  }

  return (
    <section style={cardStyle}>
      <h2 style={titleStyle}>Cómo juegan</h2>

      <div style={groupStyle}>
        <span style={labelStyle}>Formato</span>
        <div style={chipRowStyle}>
          {FORMAT_OPTIONS.map((opt) => (
            <button
              type="button"
              key={opt.value}
              style={chipStyle(config.format === opt.value, false)}
              onClick={() => setFormat(opt.value)}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      <div style={groupStyle}>
        <span style={labelStyle}>
          Modo {netoForced ? '(neto obligatorio para este formato)' : ''}
        </span>
        <div style={chipRowStyle}>
          <button
            type="button"
            style={chipStyle(config.modo === 'gross', netoForced)}
            disabled={netoForced}
            onClick={() => setModo('gross')}
          >
            Gross
          </button>
          <button
            type="button"
            style={chipStyle(config.modo === 'neto', false)}
            onClick={() => setModo('neto')}
          >
            Neto
          </button>
        </div>
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
  gap: 16,
}

const titleStyle: React.CSSProperties = {
  margin: 0,
  fontSize: 18,
  fontWeight: 600,
  color: 'var(--text-primary, #111827)',
}

const groupStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 8,
}

const labelStyle: React.CSSProperties = {
  fontSize: 13,
  fontWeight: 500,
  color: 'var(--text-secondary, #4b5563)',
}

const chipRowStyle: React.CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: 8,
}

function chipStyle(active: boolean, disabled: boolean): React.CSSProperties {
  return {
    padding: '8px 14px',
    borderRadius: 999,
    border: active
      ? '1px solid var(--brand-gold, #c4992a)'
      : '1px solid var(--border, #e5e7eb)',
    background: active
      ? 'var(--brand-gold, #c4992a)'
      : 'var(--input-bg, #ffffff)',
    color: active ? '#fff' : 'var(--text-primary, #111827)',
    fontFamily: '"DM Sans", sans-serif',
    fontSize: 13,
    fontWeight: 500,
    cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.45 : 1,
    transition: 'background 120ms ease, border-color 120ms ease',
  }
}
