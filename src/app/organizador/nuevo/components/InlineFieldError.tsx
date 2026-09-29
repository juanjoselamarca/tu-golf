'use client'

// src/app/organizador/nuevo/components/InlineFieldError.tsx
//
// Error de UN campo, junto al input (WCAG 3.3.1: identificar el error en el
// ítem). Las secciones leen el motivo con `useFieldErrors()(path)` y pasan
// `inputProps` + `borderStyle` al input.

import { createContext, useContext } from 'react'

/** dot-path ("prizes.0.description") → motivo en humano ("Obligatorio"). */
export const DraftFieldErrorsContext = createContext<Record<string, string>>({})

export interface FieldErrorState {
  message: string | null
  id: string
  inputProps: { 'aria-invalid'?: true; 'aria-describedby'?: string }
  borderStyle: React.CSSProperties
}

function fieldErrorState(byPath: Record<string, string>, dotPath: string): FieldErrorState {
  const message = byPath[dotPath] ?? null
  const id = `field-error-${dotPath.replace(/\./g, '-')}`
  return {
    message,
    id,
    inputProps: message ? { 'aria-invalid': true, 'aria-describedby': id } : {},
    borderStyle: message ? { border: '1px solid var(--error-border)' } : {},
  }
}

/**
 * Consulta de errores por campo. Devuelve una función (no un hook por campo)
 * porque las secciones dibujan premios/categorías/rondas dentro de un `.map`.
 */
export function useFieldErrors(): (dotPath: string) => FieldErrorState {
  const byPath = useContext(DraftFieldErrorsContext)
  return (dotPath) => fieldErrorState(byPath, dotPath)
}

export function InlineFieldError({ state }: { state: FieldErrorState }) {
  if (!state.message) return null
  return (
    <span id={state.id} style={messageStyle}>
      {state.message}
    </span>
  )
}

const messageStyle: React.CSSProperties = {
  fontSize: 12,
  lineHeight: 1.35,
  color: 'var(--error-fg)',
  marginTop: 2,
}
