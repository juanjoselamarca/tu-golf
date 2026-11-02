'use client'

import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react'
import { buttonClassName, type Size, type Variant } from './button-classes'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
  loading?: boolean
  leftIcon?: ReactNode
  rightIcon?: ReactNode
  fullWidth?: boolean
}

/**
 * Button Golfers+ — jerarquía explícita (audit 2026-04-22 P14).
 *
 * - `commit` (default): acción irreversible o principal. Dorado sólido.
 * - `nav`: avanzar wizard / acción reversible. Dorado outline.
 * - `ghost`: acción terciaria / link-style. Texto dorado sobre transparente.
 * - `destructive`: eliminar / cancelar. Rojo sólido.
 *
 * Motivo: evitar que el usuario confunda "Siguiente" con "Crear ronda"
 * (que persiste data). Cada variante comunica su peso.
 */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = 'commit',
    size = 'md',
    loading = false,
    leftIcon,
    rightIcon,
    fullWidth = false,
    className = '',
    disabled,
    children,
    ...rest
  },
  ref,
) {
  // Cargando NO es deshabilitado: el botón sigue diciendo qué está haciendo ("Inscribiendo…") y al 50 %
  // su texto bajaba a ~2.3:1, ilegible al sol. Solo el deshabilitado de verdad (inactivo, exento de
  // contraste en WCAG 1.4.3) se atenúa.
  const estado = loading ? 'cursor-wait' : 'disabled:opacity-50 disabled:cursor-not-allowed'

  return (
    <button
      ref={ref}
      className={`${buttonClassName({ variant, size, fullWidth })} ${estado} ${className}`}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      {loading ? (
        <span className="inline-block w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
      ) : (
        leftIcon
      )}
      <span>{children}</span>
      {!loading && rightIcon}
    </button>
  )
})
