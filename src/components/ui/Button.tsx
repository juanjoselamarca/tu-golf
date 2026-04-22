'use client'

import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react'

type Variant = 'commit' | 'nav' | 'ghost' | 'destructive'
type Size = 'sm' | 'md' | 'lg'

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
  const base =
    'inline-flex items-center justify-center gap-2 rounded-xl font-semibold transition-colors ' +
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/60 focus-visible:ring-offset-2 ' +
    'disabled:opacity-50 disabled:cursor-not-allowed select-none'

  const sizes: Record<Size, string> = {
    sm: 'h-10 px-4 text-sm min-w-[44px]',
    md: 'h-12 px-5 text-base min-w-[44px]',
    lg: 'h-14 px-6 text-base min-w-[44px]',
  }

  const variants: Record<Variant, string> = {
    commit:
      'bg-brand text-black hover:bg-brand/90 active:bg-brand/80 ' +
      'shadow-sm',
    nav:
      'bg-transparent text-brand border border-brand/60 hover:bg-brand/10 active:bg-brand/20',
    ghost:
      'bg-transparent text-brand hover:bg-brand/10 active:bg-brand/20',
    destructive:
      'bg-red-600 text-white hover:bg-red-700 active:bg-red-800',
  }

  const width = fullWidth ? 'w-full' : ''

  return (
    <button
      ref={ref}
      className={`${base} ${sizes[size]} ${variants[variant]} ${width} ${className}`}
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
