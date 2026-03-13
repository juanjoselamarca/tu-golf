'use client'

import { useEffect, useState } from 'react'
import { Toast, type ToastType } from '@/components/ui/Toast'
import { createElement, Fragment } from 'react'

// ── Module-level store (singleton, no context needed) ──────────────────────

export interface ToastItem {
  id:       string
  type:     ToastType
  title:    string
  message?: string
  duration?: number
}

let _toasts: ToastItem[] = []
const _listeners = new Set<() => void>()

function _notify() {
  _listeners.forEach((fn) => fn())
}

export function addToast(toast: Omit<ToastItem, 'id'>) {
  const id = `t-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
  _toasts = [..._toasts, { ...toast, id }]
  _notify()
}

export function removeToast(id: string) {
  _toasts = _toasts.filter((t) => t.id !== id)
  _notify()
}

// ── Hook ──────────────────────────────────────────────────────────────────

export function useToast() {
  return {
    showError: (title: string, message?: string, opts?: { duration?: number }) =>
      addToast({ type: 'error',   title, message, duration: opts?.duration ?? 5000 }),

    showSuccess: (title: string, message?: string, opts?: { duration?: number }) =>
      addToast({ type: 'success', title, message, duration: opts?.duration ?? 4000 }),

    showWarning: (title: string, message?: string, opts?: { duration?: number }) =>
      addToast({ type: 'warning', title, message, duration: opts?.duration ?? 5000 }),

    showInfo: (title: string, message?: string, opts?: { duration?: number }) =>
      addToast({ type: 'info',    title, message, duration: opts?.duration ?? 5000 }),
  }
}

// ── ToastContainer ────────────────────────────────────────────────────────
// Rendered once in layout.tsx — listens to the store and renders all active toasts.

export function ToastContainer() {
  const [toasts, setToasts] = useState<ToastItem[]>([])

  useEffect(() => {
    const update = () => setToasts([..._toasts])
    _listeners.add(update)
    return () => { _listeners.delete(update) }
  }, [])

  if (toasts.length === 0) return null

  return createElement(
    'div',
    {
      style: {
        position:      'fixed',
        top:           '24px',
        right:         '24px',
        zIndex:        9999,
        display:       'flex',
        flexDirection: 'column',
        alignItems:    'flex-end',
        pointerEvents: 'none',
      },
    },
    ...toasts.map((t) =>
      createElement(
        'div',
        { key: t.id, style: { pointerEvents: 'auto' } },
        createElement(Toast, {
          type:     t.type,
          title:    t.title,
          message:  t.message,
          duration: t.duration,
          onClose:  () => removeToast(t.id),
        })
      )
    )
  )
}
