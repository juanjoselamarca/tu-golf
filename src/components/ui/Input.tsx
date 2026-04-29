'use client'

import { forwardRef, type InputHTMLAttributes, type ReactNode } from 'react'

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  leftIcon?: ReactNode
  rightIcon?: ReactNode
  error?: boolean
  fullWidth?: boolean
}

/**
 * Input Golfers+ — contraste WCAG AA + uso en sol con guante (audit 2026-04-22 P19).
 *
 * - min-height 44px (touch target).
 * - border 2px en focus para visibilidad bajo sol.
 * - placeholder con contrast ratio >= 4.5:1.
 * - font-size 16px mínimo (evita zoom en iOS).
 */
export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  {
    leftIcon,
    rightIcon,
    error = false,
    fullWidth = true,
    className = '',
    ...rest
  },
  ref,
) {
  const width = fullWidth ? 'w-full' : ''

  return (
    <div
      className={
        'inline-flex items-center gap-2 h-12 px-3.5 rounded-xl border-2 ' +
        'transition-colors focus-within:ring-2 focus-within:ring-brand/30 ' +
        (error ? 'border-red-500 focus-within:border-red-600 ' : 'focus-within:border-brand ') +
        width + ' ' + className
      }
      style={{
        background: 'var(--input-bg)',
        borderColor: error ? undefined : 'var(--input-border)',
      }}
    >
      {leftIcon && (
        <span style={{ color: 'var(--text-3)', flexShrink: 0 }}>{leftIcon}</span>
      )}
      <input
        ref={ref}
        className="flex-1 bg-transparent outline-none text-base disabled:opacity-50"
        style={{ color: 'var(--text)' }}
        {...rest}
      />
      {rightIcon && (
        <span style={{ color: 'var(--text-3)', flexShrink: 0 }}>{rightIcon}</span>
      )}
    </div>
  )
})
