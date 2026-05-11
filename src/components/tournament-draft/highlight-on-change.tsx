'use client'

// src/components/tournament-draft/highlight-on-change.tsx
//
// Hook + wrapper que dispara una animación amarilla soft cuando un valor
// (campo del config del torneo) cambia. Permite al organizador ver de un
// vistazo qué tocó la IA o el otro admin.
//
// Patrones de uso:
//
//   1) Hook (preferido para inputs/selects/spans):
//      const cls = useHighlightOnChange(value, { durationMs: 2000 })
//      return <input className={cn(baseCls, cls)} ... />
//
//   2) HOC wrapper (cuando no podés agregar className al child):
//      <HighlightOnChange watch={value}>
//        <ComplexComponent value={value} />
//      </HighlightOnChange>

import { useEffect, useRef, useState, type ReactNode } from 'react'

const DEFAULT_DURATION_MS = 2000

export interface UseHighlightOnChangeOptions {
  /** Cuánto dura el highlight (ms). Default 2000. */
  durationMs?: number
  /** Si true, ignora el primer mount (no resaltea al cargar). Default true. */
  ignoreFirstChange?: boolean
}

/**
 * Compara `value` shallowly (===) y, si cambia, devuelve una className activa
 * que aplica el highlight amarillo. Después de `durationMs`, vuelve a ''.
 *
 * NOTA: usa `===` para comparar — si pasás objetos/arrays nuevos en cada render
 * vas a tener falsos positivos. Para esos casos pasá una key estable (ej.
 * `JSON.stringify(round)` o `round.id + round.date`).
 */
export function useHighlightOnChange(
  value: unknown,
  options: UseHighlightOnChangeOptions = {},
): string {
  const { durationMs = DEFAULT_DURATION_MS, ignoreFirstChange = true } = options
  const previousRef = useRef<unknown>(value)
  const isFirstRef = useRef(true)
  const [active, setActive] = useState(false)

  useEffect(() => {
    if (isFirstRef.current) {
      isFirstRef.current = false
      previousRef.current = value
      if (ignoreFirstChange) return
    }

    if (previousRef.current === value) return

    previousRef.current = value
    setActive(true)

    const timer = window.setTimeout(() => setActive(false), durationMs)
    return () => window.clearTimeout(timer)
  }, [value, durationMs, ignoreFirstChange])

  return active ? 'tdraft-highlight-active' : ''
}

export interface HighlightOnChangeProps {
  /** Valor a watchear. Cuando cambia (===), se dispara el highlight. */
  watch: unknown
  /** Hijos a envolver. */
  children: ReactNode
  /** Duración del highlight en ms. Default 2000. */
  durationMs?: number
  /** Si true, ignora el primer mount. Default true. */
  ignoreFirstChange?: boolean
  /** Tag HTML del wrapper. Default 'span' (inline-friendly). */
  as?: 'span' | 'div'
  /** className extra. */
  className?: string
}

/**
 * Wrapper component para casos donde no es práctico inyectar la className
 * directamente en el child (componentes externos, fragments, etc.).
 *
 * Renderiza un <span>/<div> que envuelve a `children` y aplica la animación.
 */
export function HighlightOnChange({
  watch,
  children,
  durationMs = DEFAULT_DURATION_MS,
  ignoreFirstChange = true,
  as = 'span',
  className,
}: HighlightOnChangeProps) {
  const highlightCls = useHighlightOnChange(watch, {
    durationMs,
    ignoreFirstChange,
  })
  const cls = [
    'tdraft-highlight-wrapper',
    highlightCls,
    className,
  ]
    .filter(Boolean)
    .join(' ')

  if (as === 'div') return <div className={cls}>{children}</div>
  return <span className={cls}>{children}</span>
}

/**
 * Styles inline (CSS-in-JSX) para no tener que tocar globals.css.
 * Se inyecta UNA VEZ via <HighlightStyles /> dentro del AssistantPanel o
 * el editor raíz. Idempotente: si ya está montado, no duplica.
 *
 * El highlight usa token soft amarillo (#fef3c7 ≈ var(--brand-light) con
 * más saturación, accesible WCAG sobre superficies claras y oscuras).
 */
export function HighlightStyles() {
  // Inyectamos una vez, key estable evita duplicados con StrictMode.
  return (
    <style jsx global>{`
      @keyframes tdraft-highlight-fade {
        0%   { background-color: rgba(254, 243, 199, 0.85); box-shadow: 0 0 0 2px rgba(196, 153, 42, 0.4); }
        60%  { background-color: rgba(254, 243, 199, 0.55); box-shadow: 0 0 0 2px rgba(196, 153, 42, 0.25); }
        100% { background-color: rgba(254, 243, 199, 0);    box-shadow: 0 0 0 2px rgba(196, 153, 42, 0); }
      }
      [data-theme='dark'] .tdraft-highlight-active {
        animation: tdraft-highlight-fade-dark 2s ease-out;
      }
      @keyframes tdraft-highlight-fade-dark {
        0%   { background-color: rgba(196, 153, 42, 0.30); box-shadow: 0 0 0 2px rgba(196, 153, 42, 0.55); }
        60%  { background-color: rgba(196, 153, 42, 0.18); box-shadow: 0 0 0 2px rgba(196, 153, 42, 0.30); }
        100% { background-color: rgba(196, 153, 42, 0);    box-shadow: 0 0 0 2px rgba(196, 153, 42, 0); }
      }
      .tdraft-highlight-active {
        animation: tdraft-highlight-fade 2s ease-out;
        border-radius: 6px;
        transition: background-color 200ms ease-out;
      }
      .tdraft-highlight-wrapper {
        display: inline-block;
        border-radius: 6px;
      }
    `}</style>
  )
}
