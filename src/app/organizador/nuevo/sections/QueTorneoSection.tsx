'use client'

// src/app/organizador/nuevo/sections/QueTorneoSection.tsx
//
// Sección "Qué torneo" del editor:
// identidad del torneo — nombre, fecha de inicio, foto de portada.
//
// Cancha y hoyos por ronda viven en RondasSection (única fuente de verdad).
// La fecha global propagara a rounds[0].date al sincronizarse en el editor.

import type { TournamentConfig } from '@/lib/draft/types'
import { CoverUploader } from '@/components/tournament-draft/CoverUploader'

export interface CourseOption {
  id: string
  nombre: string
  ciudad?: string | null
}

export interface QueTorneoSectionProps {
  config: TournamentConfig
  applyChange: (partial: Partial<TournamentConfig>) => void
  // courses se mantiene en props por compatibilidad con el padre, aunque
  // ya no se usa acá (lo consume RondasSection).
  courses: CourseOption[]
  draftId: string
}

export function QueTorneoSection({
  config,
  applyChange,
  draftId,
}: QueTorneoSectionProps) {

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
        <label style={labelStyle} htmlFor="t-date">Fecha de inicio</label>
        <input
          id="t-date"
          type="date"
          value={config.date_start ?? ''}
          style={inputStyle}
          onChange={(e) => {
            const nextDate = e.target.value || null
            // Propagar a rounds[0].date si la ronda 1 todavía no tiene fecha,
            // para que la lista de rondas refleje la fecha del torneo por defecto.
            const nextRounds = [...config.rounds]
            if (nextRounds.length > 0 && !nextRounds[0].date) {
              nextRounds[0] = { ...nextRounds[0], date: nextDate }
              applyChange({ date_start: nextDate, rounds: nextRounds })
            } else {
              applyChange({ date_start: nextDate })
            }
          }}
        />
      </div>

      <div style={fieldStyle}>
        <span style={labelStyle}>Foto de portada</span>
        <CoverUploader
          draftId={draftId}
          value={config.cover_image_url}
          onChange={(url) => applyChange({ cover_image_url: url })}
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
