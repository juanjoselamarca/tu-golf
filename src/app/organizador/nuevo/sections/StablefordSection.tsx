'use client'

// src/app/organizador/nuevo/sections/StablefordSection.tsx
//
// Sección "Stableford" — visible solo si format === 'stableford'.
// Edita la tabla de puntos en config.stableford_config.points_table.

import type { TournamentConfig, StablefordConfig } from '@/lib/draft/types'

export interface StablefordSectionProps {
  config: TournamentConfig
  applyChange: (partial: Partial<TournamentConfig>) => void
}

const DEFAULT_TABLE: StablefordConfig['points_table'] = {
  albatross_or_better: 5,
  eagle: 4,
  birdie: 3,
  par: 2,
  bogey: 1,
  double_or_worse: 0,
}

type Row = { key: keyof StablefordConfig['points_table']; label: string }

const ROWS: Row[] = [
  { key: 'albatross_or_better', label: 'Albatros o mejor' },
  { key: 'eagle', label: 'Eagle' },
  { key: 'birdie', label: 'Birdie' },
  { key: 'par', label: 'Par' },
  { key: 'bogey', label: 'Bogey' },
  { key: 'double_or_worse', label: 'Doble bogey o peor' },
]

export function StablefordSection({ config, applyChange }: StablefordSectionProps) {
  if (config.format !== 'stableford') return null

  const sb: StablefordConfig = config.stableford_config ?? {
    points_table: DEFAULT_TABLE,
  }

  const update = (key: keyof StablefordConfig['points_table'], value: number) => {
    applyChange({
      stableford_config: {
        ...sb,
        points_table: { ...sb.points_table, [key]: value },
      },
    })
  }

  return (
    <section style={cardStyle}>
      <h2 style={titleStyle}>Tabla de puntos Stableford</h2>
      <p style={helperStyle}>
        Defaults USGA: 5/4/3/2/1/0. Ajustá si tu torneo usa una tabla custom.
      </p>

      <div style={tableStyle}>
        {ROWS.map((row) => (
          <div key={row.key} style={rowStyle}>
            <label htmlFor={`sb-${row.key}`} style={labelStyle}>
              {row.label}
            </label>
            <input
              id={`sb-${row.key}`}
              type="number"
              step={1}
              style={numInputStyle}
              value={sb.points_table[row.key]}
              onChange={(e) =>
                update(row.key, Number.isFinite(Number(e.target.value)) ? Number(e.target.value) : 0)
              }
            />
          </div>
        ))}
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

const helperStyle: React.CSSProperties = {
  margin: 0,
  fontSize: 13,
  color: 'var(--text-secondary, #4b5563)',
}

const tableStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 8,
}

const rowStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '1fr 100px',
  alignItems: 'center',
  gap: 12,
}

const labelStyle: React.CSSProperties = {
  fontSize: 14,
  color: 'var(--text-primary, #111827)',
}

const numInputStyle: React.CSSProperties = {
  padding: '8px 10px',
  borderRadius: 8,
  border: '1px solid var(--border, #e5e7eb)',
  background: 'var(--input-bg, #ffffff)',
  color: 'var(--text-primary, #111827)',
  fontFamily: '"DM Sans", sans-serif',
  fontSize: 14,
  textAlign: 'right',
  outline: 'none',
}
