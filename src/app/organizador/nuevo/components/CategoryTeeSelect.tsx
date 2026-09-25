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
  teeLabel,
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

const hintStyle = (error: boolean): React.CSSProperties => ({
  fontSize: 12,
  lineHeight: 1.35,
  color: error ? 'var(--error-fg)' : 'var(--text-secondary)',
  marginTop: 2,
})

const retryBtnStyle: React.CSSProperties = {
  minHeight: 44,
  padding: '0 4px',
  border: 'none',
  background: 'transparent',
  color: 'var(--brand-on-bg)',
  fontFamily: 'inherit',
  fontSize: 12,
  fontWeight: 600,
  textDecoration: 'underline',
  cursor: 'pointer',
}

const faltaEn = (n: number) => `(falta en ${n} ${n === 1 ? 'cancha' : 'canchas'})`

export function CategoryTeeSelect({ id, value, gender, teeNames, onChange, selectStyle }: CategoryTeeSelectProps) {
  const ready = teeNames.status === 'ready'
  const courses = ready ? teeNames.courses : []
  const options = categoryTeeOptions(courses, gender)
  const current = value.trim()
  const selected = options.find(o => o.nombre.toLowerCase() === current.toLowerCase())
  const unknown = ready && !isKnownCategoryTee(current, options)
  // Existe en la cancha pero es del otro género: el diagnóstico debe decirlo.
  const otherGender =
    unknown &&
    (gender === 'male' || gender === 'female') &&
    isKnownCategoryTee(current, categoryTeeOptions(courses, null))
  const multiCourse = courses.length > 1

  const hintText = unknown
    ? otherGender
      ? `${teeLabel(current)} es un tee de ${gender === 'male' ? 'damas' : 'caballeros'}. Elige otro o cambia el género.`
      : 'Este tee no existe en la cancha. Elige uno de la lista.'
    : teeNames.status === 'no-course'
      ? 'Elige la cancha en Rondas para ver sus tees.'
      : teeNames.status === 'error'
        ? 'No pudimos cargar los tees.'
        : selected && selected.missingIn.length > 0
          ? `Falta en ${selected.missingIn.length} de ${courses.length} canchas: ahí cada jugador usa su propio tee.`
          : ready && options.length === 0
            ? 'La cancha no tiene tees cargados para esta categoría.'
            : ready && !current
              ? 'Sin definir: cada jugador usa su propio tee.'
              : null

  // Sin la lista cargada, el valor guardado se sigue mostrando (no se oculta tras "Sin definir").
  const showStored = !ready && !!current
  const hintId = hintText ? `${id}-hint` : undefined

  return (
    <>
      <select
        id={id}
        style={{
          ...selectStyle,
          ...(unknown ? { border: '1px solid var(--error-border)' } : {}),
        }}
        value={unknown || showStored ? current : (selected?.nombre ?? '')}
        disabled={!ready}
        aria-invalid={unknown || undefined}
        aria-describedby={hintId}
        onChange={e => onChange(e.target.value)}
      >
        <option value="">{teeNames.status === 'loading' && !current ? 'Cargando tees…' : 'Sin definir'}</option>
        {options.map(o => (
          <option key={o.nombre} value={o.nombre}>
            {o.label}
            {multiCourse && o.missingIn.length > 0 ? ` ${faltaEn(o.missingIn.length)}` : ''}
          </option>
        ))}
        {(unknown || showStored) && (
          <option value={current}>
            {/* Un valor que no es tee se muestra tal cual se escribió. */}
            {unknown && !otherGender ? current : teeLabel(current)}
            {unknown ? (otherGender ? ' (otro género)' : ' (no existe)') : ''}
          </option>
        )}
      </select>
      {hintText && (
        <span id={hintId} style={hintStyle(unknown || teeNames.status === 'error')}>
          {hintText}
          {teeNames.status === 'error' && (
            <>
              {' '}
              <button type="button" style={retryBtnStyle} onClick={teeNames.retry}>
                Reintentar
              </button>
            </>
          )}
        </span>
      )}
    </>
  )
}
