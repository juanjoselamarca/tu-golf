'use client'

// src/app/organizador/nuevo/sections/QueTorneoSection.tsx
//
// Sección "Qué torneo" del editor:
// identidad del torneo — nombre, fecha de inicio, foto de portada.
//
// Cancha y hoyos por ronda viven en RondasSection (única fuente de verdad).
// La fecha de inicio ES la fecha de la ronda 1 (un concepto, dos inputs): al
// cambiar acá se mueve `rounds[0].date`, y RondasSection hace lo mismo al
// revés. Los límites del input salen de la misma regla que valida el servidor.

import { useMemo } from 'react'
import type { TournamentConfig } from '@/lib/draft/types'
import { limitesFechaTorneo } from '@/golf/tournament-fechas'
import { CoverUploader } from '@/components/tournament-draft/CoverUploader'
import { cardStyle, titleStyle, fieldStyle, labelStyle, inputStyle } from '../styles'

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
  const limitesFecha = useMemo(() => limitesFechaTorneo(new Date()), [])

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
          min={limitesFecha.min}
          max={limitesFecha.max}
          onChange={(e) => {
            const nextDate = e.target.value || null
            // La ronda 1 se juega el día de inicio: se mueve SIEMPRE con esta
            // fecha (antes sólo cuando estaba vacía, y las dos podían quedar
            // distintas — que el validador ahora rechaza).
            const nextRounds = config.rounds.map((r) =>
              r.round_number === 1 ? { ...r, date: nextDate } : r,
            )
            applyChange({ date_start: nextDate, rounds: nextRounds })
          }}
        />
      </div>

      <div style={fieldStyle}>
        <label style={labelStyle} htmlFor="t-desc">Descripción del torneo</label>
        <textarea
          id="t-desc"
          value={config.description ?? ''}
          placeholder="Código de vestimenta, cuota de inscripción, formato de salida, premios..."
          maxLength={500}
          rows={3}
          style={{ ...inputStyle, resize: 'vertical' as const }}
          onChange={(e) => applyChange({ description: e.target.value })}
        />
        <span style={{ fontSize: 11, color: 'var(--text-secondary)', textAlign: 'right' as const }}>
          {(config.description ?? '').length}/500
        </span>
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
