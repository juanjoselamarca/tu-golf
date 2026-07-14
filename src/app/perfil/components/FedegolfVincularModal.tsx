'use client'
import { useState, useEffect, useRef, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { Button } from '@/components/ui/Button'
import { ShieldCheck, Lock, Check, X } from '@/components/icons'
import { formatRelativeTime } from '@/lib/format'
import type { FedegolfStatus } from '@/lib/data/perfil'

const inputStyle: React.CSSProperties = {
  background: 'var(--bg-surface)',
  border: '1px solid var(--input-border)',
  color: 'var(--text)',
  borderRadius: '10px',
  padding: '12px 14px',
  fontSize: '16px', // 16px evita el zoom automático de iOS al enfocar
  outline: 'none',
  width: '100%',
  boxSizing: 'border-box',
}

interface Props {
  open: boolean
  onClose: () => void
  status: FedegolfStatus
  vincular: (rut: string, password: string) => Promise<boolean>
  desvincular: () => Promise<boolean>
  submitting: boolean
  unlinking: boolean
  error: string | null
  clearError: () => void
}

/** Marca "CHILE GOLF" de la Federación sobre un chip blanco (legible en dark y light). */
function FedegolfBadge() {
  return (
    <span
      style={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        width: '48px', height: '48px', borderRadius: '12px',
        background: '#ffffff', border: '1px solid var(--border)',
        boxShadow: '0 2px 8px rgba(7,13,24,0.08)', flexShrink: 0,
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/images/fedegolf-logo.png" alt="FedeGolf" width={30} height={30} style={{ objectFit: 'contain' }} />
    </span>
  )
}

/** Línea de confianza: el mensaje central que pidió Juanjo — solo lee, nunca modifica. */
function SoloLeeCallout() {
  return (
    <div
      style={{
        display: 'flex', alignItems: 'flex-start', gap: '10px',
        background: 'rgba(196,153,42,0.07)',
        border: '1px solid rgba(196,153,42,0.2)',
        borderRadius: '12px', padding: '12px 14px', margin: '0 0 18px',
      }}
    >
      <ShieldCheck size={18} strokeWidth={2} color="#c4992a" style={{ flexShrink: 0, marginTop: '1px' }} />
      <p style={{ fontSize: '12.5px', color: 'var(--text-2)', margin: 0, lineHeight: 1.5 }}>
        Golfers+ <strong style={{ color: 'var(--text)' }}>solo lee tu índice</strong> y lo mantiene al día.
        Nunca modifica nada en tu cuenta de FedeGolf.
      </p>
    </div>
  )
}

export function FedegolfVincularModal({
  open, onClose, status, vincular, desvincular, submitting, unlinking, error, clearError,
}: Props) {
  const [rut, setRut] = useState('')
  const [password, setPassword] = useState('')
  const [confirmUnlink, setConfirmUnlink] = useState(false)
  // Portal a document.body: el overlay position:fixed debe anclarse al viewport,
  // no a un ancestro con transform/animation (que lo dejaría in-flow y fuera de
  // pantalla). Ver reference_transform_stacking_dropdown.
  const [mounted, setMounted] = useState(false)
  const firstFieldRef = useRef<HTMLInputElement>(null)
  const cardRef = useRef<HTMLDivElement>(null)

  const close = useCallback(() => {
    if (submitting || unlinking) return
    setRut(''); setPassword(''); setConfirmUnlink(false); clearError()
    onClose()
  }, [submitting, unlinking, clearError, onClose])

  useEffect(() => setMounted(true), [])

  // a11y (WCAG AA): al abrir, foco al primer campo (o a la card); Escape cierra.
  useEffect(() => {
    if (!open || !mounted) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close() }
    document.addEventListener('keydown', onKey)
    const t = setTimeout(() => (firstFieldRef.current ?? cardRef.current)?.focus(), 60)
    return () => { document.removeEventListener('keydown', onKey); clearTimeout(t) }
  }, [open, mounted, close])

  if (!open || !mounted) return null

  const busy = submitting || unlinking

  const handleVincular = async () => {
    const ok = await vincular(rut, password)
    if (ok) { setRut(''); setPassword('') } // pasa a la vista "vinculado" (status cambia en el padre)
  }

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="fedegolf-modal-title"
      onClick={close}
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        background: 'rgba(7,13,24,0.55)', backdropFilter: 'blur(4px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '24px',
        animation: 'modalOverlayIn 200ms ease-out both',
      }}
    >
      <div
        ref={cardRef}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        style={{
          outline: 'none',
          background: 'var(--bg-surface)', borderRadius: '16px',
          padding: '28px', maxWidth: '420px', width: '100%',
          border: '1px solid rgba(196,153,42,0.18)',
          boxShadow: '0 24px 48px rgba(7,13,24,0.18)',
          animation: 'modalCardIn 320ms ease-out both',
          maxHeight: 'calc(100vh - 48px)', overflowY: 'auto',
        }}
      >
        {/* Cabecera: logo + título + cerrar */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
          <FedegolfBadge />
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-3)', fontFamily: '"DM Mono", monospace', margin: '0 0 3px' }}>
              Federación
            </p>
            <h3
              id="fedegolf-modal-title"
              style={{ fontFamily: '"Playfair Display", serif', fontSize: '19px', fontWeight: 600, color: 'var(--text)', margin: 0, letterSpacing: '-0.01em' }}
            >
              {status.vinculado ? 'Cuenta FedeGolf vinculada' : 'Vincular con FedeGolf'}
            </h3>
          </div>
          <button
            type="button"
            onClick={close}
            disabled={busy}
            aria-label="Cerrar"
            style={{ background: 'transparent', border: 'none', padding: '4px', cursor: busy ? 'not-allowed' : 'pointer', color: 'var(--text-3)', flexShrink: 0, lineHeight: 0, opacity: busy ? 0.4 : 1 }}
          >
            <X size={20} strokeWidth={2} />
          </button>
        </div>

        {status.vinculado ? (
          /* ─── Vista: cuenta ya vinculada ─────────────────────────── */
          <>
            <div
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px',
                background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: '12px',
                padding: '14px 16px', marginBottom: '18px',
              }}
            >
              <div>
                <p style={{ fontSize: '11px', color: 'var(--text-3)', margin: '0 0 2px' }}>Índice oficial</p>
                <p style={{ fontSize: '26px', fontWeight: 700, color: 'var(--text)', fontFamily: '"Cormorant Garamond", serif', lineHeight: 1, margin: 0 }}>
                  {status.ultimoIndice != null ? status.ultimoIndice.toFixed(1) : '—'}
                </p>
              </div>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', fontSize: '12px', color: '#16a34a', fontWeight: 600 }}>
                <Check size={15} strokeWidth={2.5} /> Vinculada
              </span>
            </div>

            {status.ultimoSync && (
              <p style={{ fontSize: '11px', color: 'var(--text-3)', margin: '0 0 18px', fontFamily: '"DM Mono", monospace', letterSpacing: '0.02em' }}>
                Última sincronización {formatRelativeTime(status.ultimoSync)}
              </p>
            )}

            <SoloLeeCallout />

            {error && (
              <p role="status" style={{ fontSize: '12.5px', color: '#dc2626', margin: '0 0 14px', lineHeight: 1.45 }}>{error}</p>
            )}

            {confirmUnlink ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <p style={{ fontSize: '13px', color: 'var(--text-2)', margin: 0, lineHeight: 1.5 }}>
                  Al desvincular, tu índice deja de sincronizarse solo. Puedes volver a vincular cuando quieras.
                </p>
                <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                  <Button variant="ghost" size="sm" onClick={() => setConfirmUnlink(false)} disabled={unlinking}>
                    Cancelar
                  </Button>
                  <Button variant="destructive" size="sm" loading={unlinking} disabled={unlinking} onClick={async () => { const ok = await desvincular(); if (ok) setConfirmUnlink(false) }}>
                    Sí, desvincular
                  </Button>
                </div>
              </div>
            ) : (
              <div style={{ textAlign: 'center' }}>
                <button
                  type="button"
                  onClick={() => setConfirmUnlink(true)}
                  style={{ background: 'transparent', border: 'none', padding: '8px 12px', fontSize: '12px', color: 'var(--text-3)', cursor: 'pointer', textDecoration: 'underline', textUnderlineOffset: '3px', fontFamily: '"DM Sans", system-ui, sans-serif' }}
                >
                  Desvincular cuenta
                </button>
              </div>
            )}
          </>
        ) : (
          /* ─── Vista: vincular (formulario) ───────────────────────── */
          <>
            <p style={{ fontSize: '13px', color: 'var(--text-2)', margin: '0 0 18px', lineHeight: 1.55 }}>
              Conecta tu cuenta de la Federación para traer tu índice oficial y mantenerlo al día automáticamente.
            </p>

            <SoloLeeCallout />

            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <label htmlFor="fedegolf-rut" style={{ display: 'block', fontSize: '12px', color: 'var(--text-2)', marginBottom: '6px', fontWeight: 500 }}>RUT</label>
                <input
                  ref={firstFieldRef}
                  id="fedegolf-rut"
                  type="text"
                  inputMode="numeric"
                  autoComplete="username"
                  placeholder="12.345.678-9"
                  value={rut}
                  onChange={(e) => { setRut(e.target.value); if (error) clearError() }}
                  style={inputStyle}
                  onFocus={(e) => (e.currentTarget.style.borderColor = '#c4992a')}
                  onBlur={(e) => (e.currentTarget.style.borderColor = 'var(--input-border)')}
                />
              </div>
              <div>
                <label htmlFor="fedegolf-pass" style={{ display: 'block', fontSize: '12px', color: 'var(--text-2)', marginBottom: '6px', fontWeight: 500 }}>Clave de FedeGolf</label>
                <input
                  id="fedegolf-pass"
                  type="password"
                  autoComplete="current-password"
                  placeholder="Tu clave de fedegolf.cl"
                  value={password}
                  onChange={(e) => { setPassword(e.target.value); if (error) clearError() }}
                  onKeyDown={(e) => { if (e.key === 'Enter' && !submitting) handleVincular() }}
                  style={inputStyle}
                  onFocus={(e) => (e.currentTarget.style.borderColor = '#c4992a')}
                  onBlur={(e) => (e.currentTarget.style.borderColor = 'var(--input-border)')}
                />
              </div>
            </div>

            {error && (
              <p role="status" aria-live="polite" style={{ fontSize: '12.5px', color: '#dc2626', margin: '12px 0 0', lineHeight: 1.45 }}>{error}</p>
            )}

            <div style={{ marginTop: '20px' }}>
              <Button variant="commit" size="lg" loading={submitting} disabled={submitting} onClick={handleVincular} style={{ width: '100%' }}>
                {submitting ? 'Vinculando…' : 'Vincular cuenta'}
              </Button>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', marginTop: '14px' }}>
              <Lock size={12} strokeWidth={2} color="var(--text-3)" />
              <p style={{ fontSize: '11px', color: 'var(--text-3)', margin: 0, textAlign: 'center', lineHeight: 1.4 }}>
                Tu clave se guarda cifrada. Puedes desvincular cuando quieras.
              </p>
            </div>
          </>
        )}
      </div>

      <style>{`
        @keyframes modalOverlayIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes modalCardIn {
          from { opacity: 0; transform: translateY(8px) scale(0.97); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
      `}</style>
    </div>,
    document.body,
  )
}
