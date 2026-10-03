'use client'

import { type HTMLAttributes } from 'react'

interface ToggleProps extends Omit<HTMLAttributes<HTMLButtonElement>, 'onChange'> {
  checked: boolean
  onChange: (next: boolean) => void
  disabled?: boolean
  ariaLabel: string
}

/**
 * Tokens del Toggle — FUENTE ÚNICA de sus colores. El test de contraste
 * (Toggle.test.ts) los resuelve contra globals.css en claro y oscuro y exige
 * WCAG 1.4.11 (≥3:1): pista vs fondo de página y de card, y thumb vs pista.
 *
 * - Pista OFF `--text-3` (gris sólido): antes era `--border-md`, un 12% de
 *   alpha que compositado sobre #fafaf7 daba ~1.3:1 → el switch apagado no se
 *   veía en modo claro.
 * - Pista ON `--brand-on-bg`: el oro accesible por tema (#8A6A16 claro,
 *   #C4992A oscuro). `bg-gold` fijo (#C4992A) daba ~2.6:1 sobre el fondo claro
 *   y el thumb blanco encima ~2.5:1.
 * - Thumb `--bg-card-light`: blanco en claro, navy en oscuro → contrasta con
 *   ambas pistas en ambos temas.
 */
export const TOGGLE_TOKENS = {
  trackOff: '--text-3',
  trackOn: '--brand-on-bg',
  thumb: '--bg-card-light',
} as const

/**
 * Toggle Golfers+ — UN solo color activo (audit 2026-04-22 P6).
 *
 * Regla: dorado brand para ON, neutro para OFF. NO mezclar verde y dorado como
 * dos "ONs" distintos (el verde se reserva para "en vivo" o "éxito").
 *
 * El <button> es el área táctil (56×44, ≥44px de DESIGN.md) y la pista visible
 * (48×28) va adentro: así la regla global `button { min-height: 44px }` no
 * deforma la pista en un óvalo.
 */
export function Toggle({
  checked,
  onChange,
  disabled = false,
  ariaLabel,
  className = '',
  ...rest
}: ToggleProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel}
      disabled={disabled}
      onClick={() => !disabled && onChange(!checked)}
      className={
        'group relative inline-flex shrink-0 items-center justify-center h-11 w-14 rounded-full ' +
        'focus-visible:outline-none disabled:opacity-50 disabled:cursor-not-allowed ' +
        className
      }
      {...rest}
    >
      <span
        aria-hidden
        className={
          'relative inline-flex items-center h-7 w-12 rounded-full transition-colors ' +
          'group-focus-visible:ring-2 group-focus-visible:ring-[color:var(--brand-on-bg)] group-focus-visible:ring-offset-2 ' +
          'group-focus-visible:ring-offset-[color:var(--bg)]'
        }
        style={{ background: `var(${checked ? TOGGLE_TOKENS.trackOn : TOGGLE_TOKENS.trackOff})` }}
      >
        <span
          className={
            'inline-block h-5 w-5 rounded-full shadow transform transition-transform ' +
            (checked ? 'translate-x-6' : 'translate-x-1')
          }
          style={{ background: `var(${TOGGLE_TOKENS.thumb})` }}
        />
      </span>
    </button>
  )
}
