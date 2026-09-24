/**
 * PushPermissionPrompt — one-time, subtle prompt to enable push notifications.
 *
 * Appears at the top of the scorer the first time a user scores without
 * push permission. Dismissible, never shows again after dismiss or accept.
 * Premium design: frosted glass, gold accent, minimal footprint.
 */

'use client'

import { useState, useEffect, useCallback } from 'react'
import { Bell } from '@/components/icons'
import {
  isPushSupported,
  setupPushNotifications,
  getPermissionState,
} from '@/lib/push-notifications'

const DISMISSED_KEY = 'golfers-push-prompt-dismissed'

function wasDismissed(): boolean {
  try { return localStorage.getItem(DISMISSED_KEY) === '1' } catch { return false }
}

function markDismissed(): void {
  try { localStorage.setItem(DISMISSED_KEY, '1') } catch {}
}

export function PushPermissionPrompt() {
  const [visible, setVisible] = useState(false)
  const [activating, setActivating] = useState(false)
  const [exiting, setExiting] = useState(false)

  useEffect(() => {
    // Only show if: push supported, not already granted, not previously dismissed
    if (!isPushSupported()) return
    if (getPermissionState() === 'granted') return
    if (getPermissionState() === 'denied') return
    if (wasDismissed()) return
    // Small delay so the scorer loads first
    const t = setTimeout(() => setVisible(true), 1200)
    return () => clearTimeout(t)
  }, [])

  const dismiss = useCallback(() => {
    setExiting(true)
    markDismissed()
    setTimeout(() => setVisible(false), 300)
  }, [])

  const activate = useCallback(async () => {
    setActivating(true)
    const ok = await setupPushNotifications()
    markDismissed()
    if (ok) {
      setExiting(true)
      setTimeout(() => setVisible(false), 300)
    } else {
      setActivating(false)
    }
  }, [])

  if (!visible) return null

  return (
    <div
      style={{
        position: 'fixed',
        top: '64px',
        left: '12px',
        right: '12px',
        zIndex: 80,
        opacity: exiting ? 0 : 1,
        transform: exiting ? 'translateY(-12px)' : 'translateY(0)',
        transition: 'opacity 0.3s, transform 0.3s',
        animation: 'pushPromptIn 0.4s ease-out',
      }}
    >
      <div style={{
        background: 'var(--bg-surface)',
        backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)',
        border: '1px solid var(--border)',
        borderRadius: '14px',
        padding: '14px 16px',
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
        boxShadow: '0 4px 20px rgba(0,0,0,0.25)',
      }}>
        {/* Icon */}
        <div style={{
          width: '36px', height: '36px', borderRadius: '10px',
          background: 'rgba(196,153,42,0.12)',
          border: '1px solid rgba(196,153,42,0.25)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          flexShrink: 0,
        }}>
          <Bell size={18} />
        </div>

        {/* Text */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontSize: '13px', fontWeight: 600, color: 'var(--text)',
            fontFamily: 'var(--font-dm-sans)', lineHeight: 1.3,
          }}>
            Vuelve al scorer con un tap
          </div>
          <div style={{
            fontSize: '11px', color: 'var(--text-3)',
            fontFamily: 'var(--font-dm-sans)', marginTop: '1px',
          }}>
            Si sales de la app, una notificación te trae de vuelta
          </div>
        </div>

        {/* Actions */}
        <button
          onClick={activate}
          disabled={activating}
          style={{
            padding: '8px 14px', borderRadius: '8px',
            background: 'var(--brand)', color: 'var(--brand-dark)',
            border: 'none', fontSize: '12px', fontWeight: 700,
            cursor: activating ? 'wait' : 'pointer',
            flexShrink: 0, minHeight: '36px',
            fontFamily: 'var(--font-dm-sans)',
          }}
        >
          {activating ? '...' : 'Activar'}
        </button>

        <button
          onClick={dismiss}
          aria-label="Cerrar"
          style={{
            background: 'none', border: 'none',
            color: 'var(--text-3)', fontSize: '18px',
            cursor: 'pointer', padding: '4px',
            lineHeight: 1, flexShrink: 0,
            minWidth: '28px', minHeight: '28px',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >
          ×
        </button>
      </div>

      <style>{`
        @keyframes pushPromptIn {
          from { opacity: 0; transform: translateY(-12px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  )
}
