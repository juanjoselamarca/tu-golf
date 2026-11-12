'use client'

import { Check } from '@/components/icons'

interface StepperProps {
  steps: number
  current: number
  labels?: string[]
  className?: string
  /**
   * Si viene, los pasos YA completados se pueden tocar para volver a ellos.
   * Sólo hacia atrás: un paso pendiente no se salta, porque avanzar exige que el
   * paso actual esté completo (eso lo valida el botón "Siguiente" de cada paso).
   */
  onVolverAPaso?: (paso: number) => void
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
 * Con `onVolverAPaso`, cada paso completado es un botón (disco + etiqueta, ≥44 px de alto y de ancho)
 * que vuelve a esa etapa sin perder lo ya cargado. Se ve igual que antes: la marca de "hecho" ya dice
 * que es un paso al que se puede volver, y el patrón es el de los steppers editables de Material.
 *
 * Etiquetas: caption de DESIGN.md §4 (12 px, uppercase, tracking-wider). 12 px es el piso: el ancho se
 * ajusta con el conector y el tracking, nunca achicando la letra (jurisprudencia P5). Bajo 360 px (fuera
 * de la base 360–430 de §7) el tracking baja un paso para que las 4 etiquetas quepan sin cortarse.
 */
export function Stepper({ steps, current, labels, className = '', onVolverAPaso }: StepperProps) {
  const items = Array.from({ length: steps }, (_, i) => i + 1)
  const active = Math.max(1, Math.min(current, steps))
  const resumen = labels ? `Paso ${active} de ${steps}: ${labels[active - 1] ?? ''}` : `Paso ${active} de ${steps}`

  // Un `progressbar` no puede tener hijos interactivos (ARIA los vuelve presentacionales y el lector de
  // pantalla no anuncia los botones). Con pasos navegables el contenedor es un grupo con nombre.
  const rolDelContenedor = onVolverAPaso
    ? { role: 'group' as const, 'aria-label': resumen }
    : {
        role: 'progressbar' as const,
        'aria-valuenow': active,
        'aria-valuemin': 1,
        'aria-valuemax': steps,
        'aria-label': resumen,
      }

  return (
    <div className={`w-full flex items-center ${className}`} {...rolDelContenedor}>
      {items.map((n, idx) => {
        const isDone = n < active
        const isActive = n === active
        const label = labels?.[idx]
        const navegable = isDone && onVolverAPaso != null

        const disco = (
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
        )

        const etiqueta = label && (
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
        )

        return (
          // flex-auto (no flex-1): el espacio libre se reparte entre los conectores, que quedan del mismo largo
          // aunque las etiquetas midan distinto.
          <div key={n} className="flex items-start flex-auto last:flex-none">
            {navegable ? (
              <button
                type="button"
                onClick={() => onVolverAPaso(n)}
                aria-label={label ? `Volver a ${label.toLowerCase()}` : `Volver al paso ${n}`}
                // min-w/min-h 44: el disco mide 32, el área táctil no puede medir eso (DESIGN.md, uso en
                // cancha). El -m compensa el padding para que el layout quede idéntico al paso no navegable.
                // Anillo de foco igual al de Toggle: --brand-on-bg (oro para texto; el --gold sobre el crema del
                // tema claro no llega a 3:1, el piso de WCAG 1.4.11) y outline-none para que Chrome no sume su
                // anillo nativo blanco (outline-style: auto).
                className="flex flex-col items-center gap-1 min-w-[44px] min-h-[44px] -m-1.5 p-1.5 rounded-lg cursor-pointer active:opacity-70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--brand-on-bg)] focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--bg)]"
              >
                {disco}
                {etiqueta}
              </button>
            ) : (
              <div className="flex flex-col items-center gap-1">
                {disco}
                {etiqueta}
              </div>
            )}
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
