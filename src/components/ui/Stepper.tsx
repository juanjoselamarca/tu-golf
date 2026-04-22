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
          <div key={n} className="flex items-center flex-1 last:flex-none">
            <div className="flex flex-col items-center gap-1">
              <div
                className={
                  'w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold transition-colors ' +
                  (isActive
                    ? 'bg-brand text-black shadow-sm'
                    : isDone
                    ? 'bg-brand/15 text-brand'
                    : 'bg-gray-200 dark:bg-white/10 text-gray-500 dark:text-white/40')
                }
                aria-current={isActive ? 'step' : undefined}
              >
                {isDone ? <Check className="w-4 h-4" /> : n}
              </div>
              {label && (
                <span
                  className={
                    'text-[10px] uppercase tracking-wider font-medium ' +
                    (isActive
                      ? 'text-brand'
                      : isDone
                      ? 'text-gray-600 dark:text-white/60'
                      : 'text-gray-400 dark:text-white/30')
                  }
                >
                  {label}
                </span>
              )}
            </div>
            {idx < steps - 1 && (
              <div
                className={
                  'flex-1 h-px mx-2 transition-colors ' +
                  (isDone ? 'bg-brand/50' : 'bg-gray-300 dark:bg-white/10')
                }
              />
            )}
          </div>
        )
      })}
    </div>
  )
}
