'use client'

// src/app/organizador/nuevo/sections/QueTorneoSection.tsx
//
// Sección "Qué torneo" del editor:
// nombre, cancha (autocomplete contra `courses` que llega del padre),
// fecha y foto de portada.

import { useMemo, useState } from 'react'
import type { TournamentConfig } from '@/lib/draft/types'

export interface CourseOption {
  id: string
  nombre: string
  ciudad?: string | null
}

export interface QueTorneoSectionProps {
  config: TournamentConfig
  applyChange: (partial: Partial<TournamentConfig>) => void
  courses: CourseOption[]
}

export function QueTorneoSection({
  config,
  applyChange,
  courses,
}: QueTorneoSectionProps) {
  // El course principal vive en rounds[0].course_id por convención —
  // la cancha del torneo en sí (sin ronda específica) es la de la primera ronda.
  const firstRound = config.rounds[0]
  const courseId = firstRound?.course_id ?? ''

  const [courseQuery, setCourseQuery] = useState<string>(() => {
    if (!courseId) return ''
    const found = courses.find((c) => c.id === courseId)
    return found ? found.nombre : ''
  })

  const filteredCourses = useMemo(() => {
    const q = courseQuery.trim().toLowerCase()
    if (!q) return courses.slice(0, 10)
    return courses
      .filter((c) =>
        c.nombre.toLowerCase().includes(q) ||
        (c.ciudad ?? '').toLowerCase().includes(q),
      )
      .slice(0, 10)
  }, [courses, courseQuery])

  const pickCourse = (c: CourseOption) => {
    setCourseQuery(c.nombre)
    const nextRounds = [...config.rounds]
    if (nextRounds.length === 0) {
      nextRounds.push({
        round_number: 1,
        date: config.date_start,
        course_id: c.id,
        hole_count: 18,
        tee_assignment_mode: 'per_player',
      })
    } else {
      nextRounds[0] = { ...nextRounds[0], course_id: c.id }
    }
    applyChange({ rounds: nextRounds })
  }

  return (
    <section style={cardStyle}>
      <h2 style={titleStyle}>Qué torneo</h2>

      <div style={fieldStyle}>
        <label style={labelStyle} htmlFor="t-name">Nombre</label>
        <input
          id="t-name"
          type="text"
          value={config.name}
          placeholder="Copa del Club, Pro-Am, Match Anual..."
          style={inputStyle}
          onChange={(e) => applyChange({ name: e.target.value })}
        />
      </div>

      <div style={fieldStyle}>
        <label style={labelStyle} htmlFor="t-course">Cancha</label>
        <input
          id="t-course"
          type="text"
          list="t-course-list"
          value={courseQuery}
          placeholder="Buscá por nombre o ciudad"
          style={inputStyle}
          onChange={(e) => {
            setCourseQuery(e.target.value)
            const exact = courses.find(
              (c) => c.nombre.toLowerCase() === e.target.value.toLowerCase(),
            )
            if (exact) pickCourse(exact)
          }}
        />
        <datalist id="t-course-list">
          {filteredCourses.map((c) => (
            <option key={c.id} value={c.nombre}>
              {c.ciudad ?? ''}
            </option>
          ))}
        </datalist>
      </div>

      <div style={fieldStyle}>
        <label style={labelStyle} htmlFor="t-date">Fecha</label>
        <input
          id="t-date"
          type="date"
          value={config.date_start ?? ''}
          style={inputStyle}
          onChange={(e) =>
            applyChange({ date_start: e.target.value || null })
          }
        />
      </div>

      <div style={fieldStyle}>
        <label style={labelStyle} htmlFor="t-cover">Foto de portada (URL)</label>
        <input
          id="t-cover"
          type="url"
          value={config.cover_image_url ?? ''}
          placeholder="https://..."
          style={inputStyle}
          onChange={(e) =>
            applyChange({ cover_image_url: e.target.value || null })
          }
        />
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
