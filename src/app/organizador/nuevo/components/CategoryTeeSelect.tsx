'use client'

// src/app/organizador/nuevo/components/CategoryTeeSelect.tsx
//
// Selector "Tee por defecto" de una categoría. Ofrece solo los tees reales de
// las canchas del torneo (filtrados por género), porque `resolvePlayerTee`
// matchea por nombre contra `course_tees`: un texto libre ("aaaa") nunca
// matchea y el jugador cae en silencio a otro tee.

import {
  categoryTeeOptions,
  isKnownCategoryTee,
  type CategoryGender,
} from '@/golf/courses/category-tee-options'
import type { CourseTeeNamesState } from '../hooks/useCourseTeeNames'

export interface CategoryTeeSelectProps {
  id: string
  value: string
  gender: CategoryGender
  teeNames: CourseTeeNamesState
  onChange: (value: string) => void
  selectStyle: React.CSSProperties
}

export function CategoryTeeSelect({ id, value, gender, teeNames, onChange, selectStyle }: CategoryTeeSelectProps) {
  const options = teeNames.status === 'ready' ? categoryTeeOptions(teeNames.courses, gender) : []
  const ready = teeNames.status === 'ready'
  const unknown = ready && !isKnownCategoryTee(value, options)
  const selected = options.find(o => o.nombre.toLowerCase() === value.trim().toLowerCase())
  const multiCourse = ready && teeNames.courses.length > 1

  const hint =
    teeNames.status === 'no-course'
      ? 'Elige la cancha en Rondas para ver sus tees.'
      : teeNames.status === 'error'
        ? 'No pudimos cargar los tees. Revisa tu conexión.'
        : ready && options.length === 0
          ? 'La cancha no tiene tees cargados para esta categoría.'
          : null

  return (
    <>
      <select
        id={id}
        style={{
          ...selectStyle,
          ...(unknown ? { border: '1px solid var(--double)' } : {}),
        }}
        value={unknown ? value : (selected?.nombre ?? '')}
        disabled={!ready}
        aria-invalid={unknown || undefined}
        aria-describedby={`${id}-hint`}
        onChange={e => onChange(e.target.value)}
      >
        <option value="">{teeNames.status === 'loading' ? 'Cargando tees…' : 'Sin definir'}</option>
        {options.map(o => (
          <option key={o.nombre} value={o.nombre}>
            {o.label}
            {multiCourse && o.missingIn.length > 0 ? ' (no en todas las canchas)' : ''}
          </option>
        ))}
        {unknown && <option value={value}>{value} (no existe)</option>}
      </select>
      <span id={`${id}-hint`} style={hintStyle(unknown)}>
        {unknown
          ? 'Este tee no existe en la cancha. Elige uno de la lista.'
          : selected && selected.missingIn.length > 0
            ? `No existe en ${selected.missingIn.join(', ')}: ahí cada jugador usa su propio tee.`
            : !value.trim() && ready && options.length > 0
              ? 'Sin definir: cada jugador usa su propio tee.'
              : hint}
      </span>
    </>
  )
}

const hintStyle = (error: boolean): React.CSSProperties => ({
  fontSize: 11,
  lineHeight: 1.35,
  color: error ? 'var(--double)' : 'var(--text-secondary)',
  marginTop: 2,
})
