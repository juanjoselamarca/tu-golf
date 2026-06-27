'use client'

import type { CSSProperties } from 'react'

interface SuggestionChipsProps {
  /** Preguntas a mostrar como píldoras. Vacío → no se renderiza nada. */
  items: string[]
  /** Tocar una píldora la envía como mensaje del usuario. */
  onPick: (question: string) => void
  /** Etiqueta accesible del grupo (ej. "Preguntas sugeridas", "Seguir preguntando"). */
  ariaLabel: string
  /** Overrides de layout del contenedor (margen según dónde se use). */
  containerStyle?: CSSProperties
  /** Deshabilita las píldoras (ej. durante el streaming). */
  disabled?: boolean
}

/**
 * Fila de "chips" (preguntas sugeridas) — píldoras táctiles que envían la pregunta
 * de un toque. Fuente ÚNICA del estilo de chip del chat: la usan los chips de
 * arranque del estado vacío (PR3a) y los follow-up chips post-respuesta (PR3c).
 */
export function SuggestionChips({ items, onPick, ariaLabel, containerStyle, disabled }: SuggestionChipsProps) {
  if (!items.length) return null
  return (
    <div
      style={{ display: 'flex', flexWrap: 'wrap', gap: 8, ...containerStyle }}
      role="group"
      aria-label={ariaLabel}
    >
      {items.map((q, i) => (
        <button
          key={i}
          type="button"
          disabled={disabled}
          onClick={() => onPick(q)}
          style={{
            minHeight: 44,
            padding: '8px 14px',
            background: 'rgba(196,153,42,0.10)',
            border: '1px solid rgba(196,153,42,0.35)',
            borderRadius: 999,
            color: 'var(--text)',
            fontSize: 13,
            fontWeight: 500,
            cursor: disabled ? 'default' : 'pointer',
            opacity: disabled ? 0.5 : 1,
            textAlign: 'left',
            lineHeight: 1.3,
          }}
        >
          {q}
        </button>
      ))}
    </div>
  )
}
