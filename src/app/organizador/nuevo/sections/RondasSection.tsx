'use client'

// src/app/organizador/nuevo/sections/RondasSection.tsx
//
// Sección "Rondas": lista editable de config.rounds.

import { useMemo } from 'react'
import CourseSelector from '@/components/CourseSelector'
import type { TournamentConfig, RoundConfig } from '@/lib/draft/types'

export interface CourseOption {
  id: string
  nombre: string
  ciudad?: string | null
}

export interface RondasSectionProps {
  config: TournamentConfig
  applyChange: (partial: Partial<TournamentConfig>) => void
  courses: CourseOption[]
}

export function RondasSection({ config, applyChange, courses }: RondasSectionProps) {
  const rounds = config.rounds ?? []

  const courseMap = useMemo(() => {
    const m = new Map<string, CourseOption>()
    for (const c of courses) m.set(c.id, c)
    return m
  }, [courses])

  const updateAt = (idx: number, patch: Partial<RoundConfig>) => {
    const next = rounds.map((r, i) => (i === idx ? { ...r, ...patch } : r))
    applyChange({ rounds: next })
  }

  const addRound = () => {
    const nextNumber =
      rounds.length === 0
        ? 1
        : Math.max(...rounds.map((r) => r.round_number)) + 1
    const newRound: RoundConfig = {
      round_number: nextNumber,
      date: null,
      course_id: null,
      hole_count: 18,
      tee_assignment_mode: rounds[0]?.tee_assignment_mode ?? 'per_player',
    }
    applyChange({ rounds: [...rounds, newRound] })
  }

  const removeAt = (idx: number) => {
    applyChange({ rounds: rounds.filter((_, i) => i !== idx) })
  }

  return (
    <section style={cardStyle}>
      <h2 style={titleStyle}>Rondas</h2>

      {rounds.length === 0 && (
        <p style={emptyStyle}>Agregá al menos una ronda para definir cancha, fecha y hoyos.</p>
      )}

      <div style={listStyle}>
        {rounds.map((round, idx) => {
          const selectedCourse = round.course_id ? courseMap.get(round.course_id) : null
          return (
            <div key={`r-${round.round_number}-${idx}`} style={rowStyle}>
              <div style={rowHeaderStyle}>
                <span style={roundBadgeStyle}>Ronda {round.round_number}</span>
                <button
                  type="button"
                  style={removeBtnStyle}
                  onClick={() => removeAt(idx)}
                >
                  Eliminar
                </button>
              </div>

              <div style={rowGridStyle}>
                <div style={fieldStyle}>
                  <label style={labelStyle} htmlFor={`r-date-${idx}`}>Fecha</label>
                  <input
                    id={`r-date-${idx}`}
                    type="date"
                    style={inputStyle}
                    value={round.date ?? ''}
                    onChange={(e) =>
                      updateAt(idx, { date: e.target.value || null })
                    }
                  />
                </div>

                <div style={fieldStyle}>
                  <label style={labelStyle}>Cancha</label>
                  <CourseSelector
                    initialValue={selectedCourse?.nombre ?? ''}
                    onSelect={(course) => {
                      updateAt(idx, { course_id: course.id })
                    }}
                  />
                </div>

                <div style={fieldStyle}>
                  <label style={labelStyle} htmlFor={`r-holes-${idx}`}>Hoyos</label>
                  <select
                    id={`r-holes-${idx}`}
                    style={inputStyle}
                    value={round.hole_count}
                    onChange={(e) =>
                      updateAt(idx, { hole_count: Number(e.target.value) as 9 | 18 })
                    }
                  >
                    <option value={18}>18</option>
                    <option value={9}>9</option>
                  </select>
                </div>
              </div>
            </div>
          )
        })}
      </div>

      <button type="button" style={addBtnStyle} onClick={addRound}>
        + Agregar ronda
      </button>
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

const emptyStyle: React.CSSProperties = {
  margin: 0,
  fontSize: 13,
  fontStyle: 'italic',
  color: 'var(--text-secondary, #4b5563)',
}

const listStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 12,
}

const rowStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 10,
  padding: 12,
  borderRadius: 10,
  border: '1px solid var(--border, #e5e7eb)',
  background: 'var(--input-bg, #ffffff)',
}

const rowHeaderStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
}

const roundBadgeStyle: React.CSSProperties = {
  padding: '2px 10px',
  borderRadius: 999,
  background: 'var(--brand-gold, #c4992a)',
  color: '#fff',
  fontSize: 12,
  fontWeight: 600,
}

const rowGridStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
  gap: 10,
}

const fieldStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 4,
}

const labelStyle: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 500,
  color: 'var(--text-secondary, #4b5563)',
}

const inputStyle: React.CSSProperties = {
  padding: '8px 10px',
  borderRadius: 8,
  border: '1px solid var(--border, #e5e7eb)',
  background: 'var(--input-bg, #ffffff)',
  color: 'var(--text-primary, #111827)',
  fontFamily: '"DM Sans", sans-serif',
  fontSize: 13,
  outline: 'none',
}

const removeBtnStyle: React.CSSProperties = {
  padding: '6px 12px',
  borderRadius: 8,
  border: '1px solid var(--border, #e5e7eb)',
  background: 'transparent',
  color: 'var(--text-secondary, #4b5563)',
  fontFamily: '"DM Sans", sans-serif',
  fontSize: 12,
  cursor: 'pointer',
}

const addBtnStyle: React.CSSProperties = {
  alignSelf: 'flex-start',
  padding: '8px 14px',
  borderRadius: 8,
  border: '1px dashed var(--brand-gold, #c4992a)',
  background: 'transparent',
  color: 'var(--brand-gold, #c4992a)',
  fontFamily: '"DM Sans", sans-serif',
  fontSize: 13,
  fontWeight: 500,
  cursor: 'pointer',
}
