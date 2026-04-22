'use client'

import { type HTMLAttributes } from 'react'

interface ToggleProps extends Omit<HTMLAttributes<HTMLButtonElement>, 'onChange'> {
  checked: boolean
  onChange: (next: boolean) => void
  disabled?: boolean
  ariaLabel: string
}

/**
 * Toggle Golfers+ — UN solo color activo (audit 2026-04-22 P6).
 *
 * Regla: dorado brand para ON, neutro apagado para OFF. NO mezclar verde
 * y dorado como dos "ONs" distintos (el verde se reserva solo para estados
 * "en vivo" o "éxito", no para settings).
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
        'relative inline-flex items-center h-7 w-12 rounded-full transition-colors ' +
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/60 focus-visible:ring-offset-2 ' +
        'disabled:opacity-50 disabled:cursor-not-allowed ' +
        (checked ? 'bg-brand' : 'bg-gray-300 dark:bg-white/15') +
        ' ' + className
      }
      {...rest}
    >
      <span
        className={
          'inline-block h-5 w-5 rounded-full bg-white shadow transform transition-transform ' +
          (checked ? 'translate-x-6' : 'translate-x-1')
        }
      />
    </button>
  )
}
