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
 * botón se ve igual y al tocarlo abre EL banner de instalación de la app
 * (PWAInstallBanner) con el contexto — un solo aviso, una sola fuente del
 * camino de instalación. En iOS < 16.4 no hay push ni instalada: se dice eso.
 */

'use client'

import { useState, useCallback, useEffect, useRef, useSyncExternalStore } from 'react'
import { Bell, CheckCircle } from '@/components/icons'
import { requestPwaInstall } from '@/components/PWAInstallBanner'
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

type Support = 'pending' | 'ok' | 'ios_install' | 'ios_too_old' | 'hidden'

const FAIL_COPY: Record<Exclude<FollowOutcome, 'ok'> | 'unfollow_failed', string> = {
  unsupported: 'No disponible',
  permission_denied: 'Sin permiso',
  round_over: 'Ronda terminada',
  error: 'No se pudo activar',
  unfollow_failed: 'No se pudo dejar de seguir',
}

export const IOS_INSTALL_REASON = 'Para recibir los avisos de esta ronda, instala Golfers+.'
export const IOS_TOO_OLD_COPY = 'Tu iPhone necesita iOS 16.4 o superior para recibir avisos en vivo.'

function resolveSupport(): Support {
  const status = getPushSupportStatus()
  if (status.supported) return 'ok'
  if (status.reason === 'ios_not_pwa') return 'ios_install'
  if (status.reason === 'ios_too_old') return 'ios_too_old'
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
  const [notice, setNotice] = useState<string | null>(null)
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

  const showFailure = useCallback((key: keyof typeof FAIL_COPY) => {
    setFailure(FAIL_COPY[key])
    if (failureTimer.current) clearTimeout(failureTimer.current)
    failureTimer.current = setTimeout(() => setFailure(null), 3500)
  }, [])

  const handleFollow = useCallback(async () => {
    if (support === 'ios_install') { requestPwaInstall(IOS_INSTALL_REASON); return }
    if (support === 'ios_too_old') { setNotice(IOS_TOO_OLD_COPY); return }
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

  const handleUnfollow = useCallback(async () => {
    // Instagram pattern: first tap shows "Dejar de seguir?", second tap confirms
    if (!confirmUnfollow) {
      setConfirmUnfollow(true)
      confirmTimer.current = setTimeout(() => setConfirmUnfollow(false), 3000)
      return
    }
    if (confirmTimer.current) clearTimeout(confirmTimer.current)
    setConfirmUnfollow(false)
    setLoading(true)
    try {
      const ok = await unfollowRound(codigo)
      if (!ok) { showFailure('unfollow_failed'); return }  // sigue "Siguiendo": es la verdad
      setFollowingOverride(false)
      onFollowChange?.(false)
    } finally {
      setLoading(false)
    }
  }, [confirmUnfollow, codigo, onFollowChange, showFailure])

  const handleToggle = useCallback(async () => {
    if (following) await handleUnfollow()
    else await handleFollow()
  }, [following, handleFollow, handleUnfollow])

  if (support === 'pending' || support === 'hidden') return null

  // Un solo aviso a la vez: el de iOS viejo, o el fallo en modo compacto.
  const overlay = notice
    ? <BottomNotice text={notice} onClose={() => setNotice(null)} />
    : compact && failure
      ? <BottomNotice text={failure} tone="error" onClose={() => setFailure(null)} />
      : null

  // ── Compact (icon-only for /en-vivo feed) ──
  if (compact) {
    return (
      <>
        <button
          onClick={(e) => { e.preventDefault(); e.stopPropagation(); void handleToggle() }}
          disabled={loading}
          aria-label={following ? 'Dejar de seguir ronda' : 'Seguir ronda'}
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
        {overlay}
      </>
    )
  }

  // ── Full button ──
  if (following) {
    return (
      <>
        <button
          onClick={(e) => { e.preventDefault(); e.stopPropagation(); void handleUnfollow() }}
          disabled={loading}
          style={{
            display: 'flex', alignItems: 'center', gap: '8px',
            padding: '10px 16px', borderRadius: '10px',
            background: (confirmUnfollow || failure) ? 'rgba(220,38,38,0.06)' : 'rgba(22,163,74,0.08)',
            color: (confirmUnfollow || failure) ? 'var(--error, #ef4444)' : 'var(--status-live-fg)',
            border: (confirmUnfollow || failure)
              ? '1px solid rgba(220,38,38,0.2)'
              : '1px solid rgba(22,163,74,0.2)',
            fontSize: '13px', fontWeight: 700,
            cursor: loading ? 'wait' : 'pointer',
            transition: 'all 0.2s',
            minHeight: '44px',
            fontFamily: 'var(--font-dm-sans)',
          }}
        >
          <CheckCircle size={16} />
          {failure ?? (loading ? 'Un momento...' : confirmUnfollow ? 'Dejar de seguir?' : 'Siguiendo')}
        </button>
        {overlay}
      </>
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
      {overlay}
    </>
  )
}

/**
 * Aviso anclado abajo (modo compacto no tiene espacio para texto inline).
 * Entero en pantalla en 390×844 con la barra de Safari: respeta la zona segura
 * inferior y nunca excede el viewport (scroll interno si hiciera falta).
 */
function BottomNotice({ text, tone = 'neutral', onClose }: { text: string; tone?: 'neutral' | 'error'; onClose: () => void }) {
  return (
    <div
      role={tone === 'error' ? 'alert' : 'status'}
      onClick={(e) => { e.preventDefault(); e.stopPropagation() }}
      style={{
        position: 'fixed', left: '12px', right: '12px', zIndex: 90,
        bottom: 'calc(16px + env(safe-area-inset-bottom, 0px))',
        maxHeight: 'calc(100dvh - 32px - env(safe-area-inset-bottom, 0px))',
        overflowY: 'auto', boxSizing: 'border-box',
        background: 'var(--bg-surface)', color: 'var(--text)',
        border: `1px solid ${tone === 'error' ? 'rgba(220,38,38,0.35)' : 'var(--border)'}`,
        borderRadius: '14px',
        padding: '14px 16px', boxShadow: '0 12px 32px rgba(0,0,0,0.18)',
        fontFamily: 'var(--font-dm-sans)',
      }}
    >
      <div style={{ fontSize: '13px', color: tone === 'error' ? 'var(--error, #ef4444)' : 'var(--text-2)', lineHeight: 1.5, fontWeight: tone === 'error' ? 600 : 400 }}>
        {text}
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
