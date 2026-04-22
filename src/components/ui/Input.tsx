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
  const borderColor = error
    ? 'border-red-500 focus-within:border-red-600'
    : 'border-gray-300 dark:border-white/20 focus-within:border-brand'

  return (
    <div
      className={
        'inline-flex items-center gap-2 h-12 px-3.5 rounded-xl border-2 bg-white dark:bg-white/5 ' +
        'transition-colors focus-within:ring-2 focus-within:ring-brand/30 ' +
        borderColor +
        ' ' + width + ' ' + className
      }
    >
      {leftIcon && (
        <span className="text-gray-500 dark:text-white/50 flex-shrink-0">{leftIcon}</span>
      )}
      <input
        ref={ref}
        className={
          'flex-1 bg-transparent outline-none text-base text-gray-900 dark:text-white ' +
          'placeholder:text-gray-600 dark:placeholder:text-white/55 ' +
          'disabled:opacity-50'
        }
        {...rest}
      />
      {rightIcon && (
        <span className="text-gray-500 dark:text-white/50 flex-shrink-0">{rightIcon}</span>
      )}
    </div>
  )
})
