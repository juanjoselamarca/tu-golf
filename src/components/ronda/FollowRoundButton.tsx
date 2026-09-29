/**
 * FollowRoundButton — "Seguir" / "Siguiendo" toggle (Instagram-style).
 *
 * Funciona con y sin cuenta: la identidad del seguidor es la suscripción push
 * de ESTE dispositivo (ver /api/push/follow).
 *
 * Two visual modes:
 * - Default: gold "Seguir" button with bell icon
 * - Following: muted "Siguiendo" with check. Tap → unfollow with confirmation
 *
 * Compact mode: icon-only for feed cards (/en-vivo)
 * Full mode: text button for ronda detail view
 *
 * iPhone fuera de la app instalada (Safari): iOS no entrega Web Push a una
 * pestaña, sólo a la PWA agregada a la pantalla de inicio (iOS 16.4+). Antes el
 * botón devolvía null y el espectador no veía nada (inbox c09c8391). Ahora el
 * botón se ve igual y al tocarlo explica el camino.
 */

'use client'

import { useState, useCallback, useEffect, useRef, useSyncExternalStore } from 'react'
import { Bell, CheckCircle } from '@/components/icons'
import {
  followRound,
  unfollowRound,
  isFollowingRound,
  showSpectatorNotification,
  type SpectatorPlayer,
  type FollowOutcome,
} from '@/lib/round-notifications'
import { getPushSupportStatus } from '@/lib/push-notifications'

interface FollowRoundButtonProps {
  codigo: string
  courseName: string
  players: SpectatorPlayer[]
  /** Hoyos de la ronda (9/18). */
  totalHoles: number
  /** Compact mode for feed cards */
  compact?: boolean
  /** Callback when follow state changes */
  onFollowChange?: (following: boolean) => void
}

type Support = 'pending' | 'ok' | 'ios_install' | 'hidden'

const FAIL_COPY: Record<Exclude<FollowOutcome, 'ok'>, string> = {
  unsupported: 'No disponible',
  permission_denied: 'Sin permiso',
  round_over: 'Ronda terminada',
  error: 'No se pudo activar',
}

function resolveSupport(): Support {
  const status = getPushSupportStatus()
  if (status.supported) return 'ok'
  if (status.reason === 'ios_not_pwa' || status.reason === 'ios_too_old') return 'ios_install'
  return 'hidden'
}

// Soporte de push y "¿sigo esta ronda?" viven en el browser (UA, localStorage).
// En SSR e hidratación se rinde null; el primer render cliente ya trae el valor
// real, sin setState en un efecto ni desajuste de hidratación.
const subscribeNoop = () => () => {}
const useIsClient = () => useSyncExternalStore(subscribeNoop, () => true, () => false)

export function FollowRoundButton({
  codigo, courseName, players, totalHoles, compact = false, onFollowChange,
}: FollowRoundButtonProps) {
  const isClient = useIsClient()
  const support: Support = isClient ? resolveSupport() : 'pending'
  // null = todavía no hubo acción del usuario: se lee del storage del dispositivo.
  const [followingOverride, setFollowingOverride] = useState<boolean | null>(null)
  const [overrideCodigo, setOverrideCodigo] = useState(codigo)
  if (overrideCodigo !== codigo) {
    setOverrideCodigo(codigo)
    setFollowingOverride(null)
  }
  const following = followingOverride ?? (isClient && isFollowingRound(codigo))
  const [loading, setLoading] = useState(false)
  const [failure, setFailure] = useState<string | null>(null)
  const [confirmUnfollow, setConfirmUnfollow] = useState(false)
  const [showIosHint, setShowIosHint] = useState(false)
  const confirmTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const failureTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => () => {
    if (confirmTimer.current) clearTimeout(confirmTimer.current)
    if (failureTimer.current) clearTimeout(failureTimer.current)
  }, [])

  // Listen for unfollow messages from SW
  useEffect(() => {
    const handler = (e: MessageEvent) => {
      if (e.data?.type === 'UNFOLLOW_ROUND' && e.data?.rondaCodigo === codigo) {
        setFollowingOverride(false)
        onFollowChange?.(false)
      }
    }
    navigator.serviceWorker?.addEventListener('message', handler)
    return () => navigator.serviceWorker?.removeEventListener('message', handler)
  }, [codigo, onFollowChange])

  const showFailure = useCallback((outcome: Exclude<FollowOutcome, 'ok'>) => {
    setFailure(FAIL_COPY[outcome])
    if (failureTimer.current) clearTimeout(failureTimer.current)
    failureTimer.current = setTimeout(() => setFailure(null), 3000)
  }, [])

  const handleFollow = useCallback(async () => {
    if (support === 'ios_install') { setShowIosHint(true); return }
    setLoading(true)
    try {
      const outcome = await followRound(codigo, courseName)
      if (outcome !== 'ok') { showFailure(outcome); return }
      setFollowingOverride(true)
      onFollowChange?.(true)
      if (players.length > 0) {
        void showSpectatorNotification({ courseName, codigo, players, totalHoles })
      }
    } finally {
      setLoading(false)
    }
  }, [support, codigo, courseName, players, totalHoles, onFollowChange, showFailure])

  const handleUnfollow = useCallback(() => {
    // Instagram pattern: first tap shows "Dejar de seguir?", second tap confirms
    if (!confirmUnfollow) {
      setConfirmUnfollow(true)
      confirmTimer.current = setTimeout(() => setConfirmUnfollow(false), 3000)
      return
    }
    if (confirmTimer.current) clearTimeout(confirmTimer.current)
    unfollowRound(codigo)
    setFollowingOverride(false)
    setConfirmUnfollow(false)
    onFollowChange?.(false)
  }, [confirmUnfollow, codigo, onFollowChange])

  const handleToggle = useCallback(async () => {
    if (following) {
      handleUnfollow()
    } else {
      await handleFollow()
    }
  }, [following, handleFollow, handleUnfollow])

  if (support === 'pending' || support === 'hidden') return null

  const iosHint = showIosHint && <IosInstallHint onClose={() => setShowIosHint(false)} />

  // ── Compact (icon-only for /en-vivo feed) ──
  if (compact) {
    return (
      <>
        <button
          onClick={(e) => { e.preventDefault(); e.stopPropagation(); void handleToggle() }}
          disabled={loading}
          aria-label={following ? 'Dejar de seguir ronda' : 'Seguir ronda'}
          title={failure ?? undefined}
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            width: '36px', height: '36px', borderRadius: '10px',
            background: failure
              ? 'rgba(220,38,38,0.08)'
              : following
                ? confirmUnfollow ? 'rgba(220,38,38,0.08)' : 'rgba(22,163,74,0.1)'
                : 'rgba(196,153,42,0.12)',
            border: failure
              ? '1px solid rgba(220,38,38,0.25)'
              : following
                ? confirmUnfollow ? '1px solid rgba(220,38,38,0.25)' : '1px solid rgba(22,163,74,0.25)'
                : '1px solid rgba(196,153,42,0.25)',
            cursor: loading ? 'wait' : 'pointer',
            transition: 'all 0.2s',
            flexShrink: 0,
            padding: 0,
          }}
        >
          {following
            ? <CheckCircle size={16} />
            : <Bell size={16} />
          }
        </button>
        {iosHint}
      </>
    )
  }

  // ── Full button ──
  if (following) {
    return (
      <button
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleUnfollow() }}
        style={{
          display: 'flex', alignItems: 'center', gap: '8px',
          padding: '10px 16px', borderRadius: '10px',
          background: confirmUnfollow ? 'rgba(220,38,38,0.06)' : 'rgba(22,163,74,0.08)',
          color: confirmUnfollow ? 'var(--error, #ef4444)' : 'var(--status-live-fg)',
          border: confirmUnfollow
            ? '1px solid rgba(220,38,38,0.2)'
            : '1px solid rgba(22,163,74,0.2)',
          fontSize: '13px', fontWeight: 700,
          cursor: 'pointer',
          transition: 'all 0.2s',
          minHeight: '44px',
          fontFamily: 'var(--font-dm-sans)',
        }}
      >
        <CheckCircle size={16} />
        {confirmUnfollow ? 'Dejar de seguir?' : 'Siguiendo'}
      </button>
    )
  }

  return (
    <>
      <button
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); void handleFollow() }}
        disabled={loading}
        style={{
          display: 'flex', alignItems: 'center', gap: '8px',
          padding: '10px 16px', borderRadius: '10px',
          background: failure ? 'rgba(220,38,38,0.06)' : 'var(--brand)',
          color: failure ? 'var(--error, #ef4444)' : 'var(--brand-dark)',
          border: failure ? '1px solid rgba(220,38,38,0.2)' : 'none',
          fontSize: '13px', fontWeight: 700,
          cursor: loading ? 'wait' : 'pointer',
          transition: 'all 0.2s',
          minHeight: '44px',
          fontFamily: 'var(--font-dm-sans)',
        }}
      >
        <Bell size={16} />
        {failure ?? (loading ? 'Activando...' : 'Seguir')}
      </button>
      {iosHint}
    </>
  )
}

/**
 * iPhone en Safari: el camino honesto. iOS entrega Web Push sólo a la app
 * agregada a la pantalla de inicio (16.4+); no hay forma de seguir la ronda
 * desde la pestaña.
 */
function IosInstallHint({ onClose }: { onClose: () => void }) {
  return (
    <div
      role="dialog"
      aria-label="Cómo seguir la ronda en iPhone"
      onClick={(e) => { e.preventDefault(); e.stopPropagation() }}
      style={{
        position: 'fixed', left: '12px', right: '12px', bottom: '16px', zIndex: 90,
        background: 'var(--bg-surface)', color: 'var(--text)',
        border: '1px solid var(--border)', borderRadius: '14px',
        padding: '14px 16px', boxShadow: '0 12px 32px rgba(0,0,0,0.18)',
        fontFamily: 'var(--font-dm-sans)',
      }}
    >
      <div style={{ fontSize: '14px', fontWeight: 700, marginBottom: '6px' }}>
        Para seguir la ronda en iPhone
      </div>
      <div style={{ fontSize: '13px', color: 'var(--text-2)', lineHeight: 1.5 }}>
        Los avisos en vivo llegan solo con Golfers+ instalada. En Safari toca
        <span style={{ fontWeight: 600, color: 'var(--text)' }}> Compartir</span> y elige
        <span style={{ fontWeight: 600, color: 'var(--text)' }}> “Agregar a pantalla de inicio”</span>.
        Ábrela desde el ícono y toca Seguir.
      </div>
      <button
        onClick={onClose}
        style={{
          marginTop: '12px', width: '100%', minHeight: '44px', borderRadius: '10px',
          background: 'var(--brand)', color: 'var(--brand-dark)', border: 'none',
          fontSize: '13px', fontWeight: 700, cursor: 'pointer',
          fontFamily: 'var(--font-dm-sans)',
        }}
      >
        Entendido
      </button>
    </div>
  )
}
