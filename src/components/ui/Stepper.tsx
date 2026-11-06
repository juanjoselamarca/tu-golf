'use client'

import { Check } from '@/components/icons'

interface StepperProps {
  steps: number
  current: number
  labels?: string[]
  className?: string
}

/**
 * Stepper Golfers+ — 4 steps numerados consistentes (audit 2026-04-22 P13).
 *
 * Regla: siempre N steps numerados explícitos. Step activo destacado, previos
 * como check, siguientes inactivos. NO mezclar numeración con checks ambiguos.
 *
 * Ejemplo para "Nueva Ronda":
 *   <Stepper steps={4} current={2} labels={['Formato', 'Cancha', 'Jugadores', 'Confirmar']} />
 *
 * Etiquetas: caption de DESIGN.md §4 (12 px, uppercase, tracking-wider). 12 px es el piso: el ancho se
 * ajusta con el conector y el tracking, nunca achicando la letra (jurisprudencia P5). Bajo 360 px (fuera
 * de la base 360–430 de §7) el tracking baja un paso para que las 4 etiquetas quepan sin cortarse.
 */
export function Stepper({ steps, current, labels, className = '' }: StepperProps) {
  const items = Array.from({ length: steps }, (_, i) => i + 1)
  const active = Math.max(1, Math.min(current, steps))

  return (
    <div
      className={`w-full flex items-center ${className}`}
      role="progressbar"
      aria-valuenow={active}
      aria-valuemin={1}
      aria-valuemax={steps}
      aria-label={labels ? `Paso ${active} de ${steps}: ${labels[active - 1] ?? ''}` : `Paso ${active} de ${steps}`}
    >
      {items.map((n, idx) => {
        const isDone = n < active
        const isActive = n === active
        const label = labels?.[idx]

        return (
          // flex-auto (no flex-1): el espacio libre se reparte entre los conectores, que quedan del mismo largo
          // aunque las etiquetas midan distinto.
          <div key={n} className="flex items-start flex-auto last:flex-none">
            <div className="flex flex-col items-center gap-1">
              <div
                className={
                  'w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold transition-colors ' +
                  (isActive
                    ? 'bg-gold text-bg-deep shadow-sm'
                    : isDone
                    ? 'bg-gold/15 text-gold-text'
                    : '')
                }
                style={
                  !isActive && !isDone
                    // --text-2: sobre el disco gris --text-3 daba 3.95:1 (bajo AA); --text-2 ≈ 5.6:1.
                    ? { background: 'var(--border)', color: 'var(--text-2)' }
                    : undefined
                }
                aria-current={isActive ? 'step' : undefined}
              >
                {isDone ? <Check className="w-4 h-4" /> : n}
              </div>
              {label && (
                <span
                  className={
                    'text-xs uppercase tracking-wide min-[360px]:tracking-wider font-medium whitespace-nowrap ' +
                    (isActive ? 'text-gold-text' : '')
                  }
                  style={
                    !isActive
                      ? { color: isDone ? 'var(--text-2)' : 'var(--text-3)' }
                      : undefined
                  }
                >
                  {label}
                </span>
              )}
            </div>
            {idx < steps - 1 && (
              <div
                className={
                  // mt-4 = centro del disco (h-8): la línea une los discos, no el bloque disco+etiqueta.
                  'flex-1 h-px mx-1 mt-4 transition-colors ' +
                  (isDone ? 'bg-gold/50' : '')
                }
                style={!isDone ? { background: 'var(--border-md)' } : undefined}
              />
            )}
          </div>
        )
      })}
    </div>
  )
}
