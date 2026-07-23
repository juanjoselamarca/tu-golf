'use client'

// src/components/FedegolfIndiceModal.tsx
//
// Modal "Tu índice oficial, explicado" — desglose de las ~20 tarjetas FedeGolf
// que componen el índice oficial del socio (card "Federación" de /perfil).
// Gemelo de IndiceBreakdownModal (que explica el Índice Golfers+): mismo
// bottom-sheet, mismo portal, misma familia visual.
//
// Datos EN VIVO desde /api/fedegolf/tarjetas: el flag `cuenta` (cuáles de las
// 20 entran al índice) lo resuelve fedegolf.cl, así el promedio queda cuadrado
// al decimal con el número oficial (spec: re-derivar del fetch, no de BD).

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { X, Trophy } from '@/components/icons'
import type { FedegolfTarjeta } from '@/lib/fedegolf/types'

interface TarjetasResponse {
  ok: boolean
  linked?: boolean
  tarjetas?: FedegolfTarjeta[]
  promedio?: number | null
  diferencialesQueCuentan?: number[]
  slotsVentana?: number
  rondasQueCuentan?: number
  error?: string
}

interface FedegolfIndiceModalProps {
  isOpen: boolean
  onClose: () => void
  /** Índice oficial (profiles.indice) — la verdad; el fetch confirma cómo se compone. */
  indiceOficial: number | null
}

const GOLD = '#c4992a'

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
function fechaCorta(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso)
  if (!m) return iso
  return `${Number(m[3])} ${MESES[Number(m[2]) - 1] ?? ''} ${m[1]}`
}

/** "C.G. Los Leones / Los Leones (VARONES)" → "C.G. Los Leones". */
function nombreCancha(clubCancha: string): string {
  return (clubCancha.split('/')[0] ?? clubCancha).trim() || clubCancha
}

function metaLinea(t: FedegolfTarjeta): string {
  const partes: string[] = [fechaCorta(t.fechaJuego)]
  if (t.tee) partes.push(t.tee)
  if (Number.isFinite(t.courseRating) && Number.isFinite(t.slope)) partes.push(`${t.courseRating}/${t.slope}`)
  if (Number.isFinite(t.scoreGross)) partes.push(String(t.scoreGross))
  return partes.join(' · ')
}

export default function FedegolfIndiceModal({ isOpen, onClose, indiceOficial }: FedegolfIndiceModalProps) {
  const [data, setData] = useState<TarjetasResponse | null>(null)
  const [loading, setLoading] = useState(false)

  // Keyframes globales una sola vez (patrón portable de IndiceBreakdownModal).
  useEffect(() => {
    if (typeof document === 'undefined') return
    const id = 'fedegolf-indice-keyframes'
    if (document.getElementById(id)) return
    const style = document.createElement('style')
    style.id = id
    style.textContent = `
      @keyframes fgIndiceOverlayIn { from { opacity: 0; } to { opacity: 1; } }
      @keyframes fgIndiceSheetIn { from { transform: translateY(100%); } to { transform: translateY(0); } }
    `
    document.head.appendChild(style)
  }, [])

  useEffect(() => {
    if (!isOpen) return
    let cancelled = false
    setLoading(true)
    setData(null)
    ;(async () => {
      try {
        const res = await fetch('/api/fedegolf/tarjetas')
        const json = (await res.json()) as TarjetasResponse
        if (!cancelled) setData(json)
      } catch {
        if (!cancelled) setData({ ok: false, error: 'red' })
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [isOpen])

  if (!isOpen) return null
  if (typeof document === 'undefined') return null

  const tarjetas = data?.tarjetas ?? []
  const diffsCuentan = data?.diferencialesQueCuentan ?? []
  const promedio = data?.promedio ?? null
  const hero = indiceOficial ?? promedio
  const notLinked = data?.ok === false && data?.linked === false
  const failed = data?.ok === false && !notLinked

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="fedegolf-indice-title"
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1000,
        background: 'rgba(7,13,24,0.55)',
        backdropFilter: 'blur(4px)',
        display: 'flex',
        alignItems: 'flex-end',
        justifyContent: 'center',
        animation: 'fgIndiceOverlayIn 200ms ease-out both',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: 'var(--bg-surface)',
          borderTopLeftRadius: '20px',
          borderTopRightRadius: '20px',
          padding: '20px 16px calc(24px + env(safe-area-inset-bottom, 0px))',
          maxWidth: '520px',
          width: '100%',
          maxHeight: '88vh',
          overflowY: 'auto',
          WebkitOverflowScrolling: 'touch',
          animation: 'fgIndiceSheetIn 280ms cubic-bezier(0.16,1,0.3,1) both',
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
          <h2
            id="fedegolf-indice-title"
            style={{ fontFamily: '"Playfair Display", serif', fontSize: '20px', fontWeight: 700, color: 'var(--text)', margin: 0 }}
          >
            Tu índice oficial, explicado
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: 'var(--text-2)',
              padding: '6px',
              minWidth: '36px',
              minHeight: '36px',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <X size={18} strokeWidth={2} />
          </button>
        </div>

        {loading && (
          <p style={{ textAlign: 'center', color: 'var(--text-3)', fontSize: '13px', padding: '48px 0' }}>
            Leyendo tus tarjetas oficiales…
          </p>
        )}

        {!loading && notLinked && (
          <p style={{ textAlign: 'center', color: 'var(--text-3)', fontSize: '13px', padding: '32px 0', lineHeight: 1.6 }}>
            Vincula tu cuenta FedeGolf para ver cómo se compone tu índice oficial.
          </p>
        )}

        {!loading && failed && (
          <p style={{ textAlign: 'center', color: 'var(--text-3)', fontSize: '13px', padding: '32px 0', lineHeight: 1.6 }}>
            No pudimos leer tus tarjetas oficiales ahora.<br />
            Intenta de nuevo en un momento.
          </p>
        )}

        {!loading && data?.ok && (
          <>
            {/* Hero: número oficial + la fórmula en vivo */}
            <div
              style={{
                background: 'linear-gradient(180deg, rgba(196,153,42,0.06), rgba(196,153,42,0.02))',
                border: '1px solid rgba(196,153,42,0.28)',
                borderRadius: '16px',
                padding: '18px 16px',
                textAlign: 'center',
                marginBottom: '14px',
              }}
            >
              <p
                style={{
                  fontSize: '10px',
                  fontWeight: 700,
                  letterSpacing: '0.12em',
                  textTransform: 'uppercase',
                  color: GOLD,
                  fontFamily: '"DM Mono", monospace',
                  margin: '0 0 6px',
                }}
              >
                Índice Federación
              </p>
              <p style={{ fontSize: '52px', fontWeight: 700, color: GOLD, fontFamily: '"Cormorant Garamond", serif', lineHeight: 0.95, margin: '0 0 6px' }}>
                {hero != null ? hero.toFixed(1) : '—'}
              </p>
              <p style={{ fontSize: '12px', color: 'var(--text-2)', lineHeight: 1.55, maxWidth: '300px', margin: '0 auto' }}>
                El promedio de tus <strong style={{ color: 'var(--text)' }}>{diffsCuentan.length} mejores diferenciales</strong> de la ventana oficial FedeGolf.
              </p>

              {diffsCuentan.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px', justifyContent: 'center', marginTop: '12px' }}>
                  {diffsCuentan.map((d, i) => (
                    <span
                      key={i}
                      style={{
                        fontFamily: '"DM Mono", monospace',
                        fontSize: '12px',
                        fontWeight: 500,
                        color: GOLD,
                        background: 'rgba(196,153,42,0.1)',
                        border: '1px solid rgba(196,153,42,0.28)',
                        borderRadius: '7px',
                        padding: '3px 7px',
                      }}
                    >
                      {d.toFixed(1)}
                    </span>
                  ))}
                  <span style={{ fontFamily: '"DM Mono", monospace', fontSize: '11px', color: 'var(--text-3)', alignSelf: 'center', padding: '0 2px' }}>
                    ÷{diffsCuentan.length} =
                  </span>
                  {promedio != null && (
                    <span
                      style={{
                        fontFamily: '"DM Mono", monospace',
                        fontSize: '12px',
                        fontWeight: 700,
                        color: GOLD,
                        background: 'rgba(196,153,42,0.16)',
                        border: '1px solid rgba(196,153,42,0.4)',
                        borderRadius: '7px',
                        padding: '3px 8px',
                      }}
                    >
                      {promedio.toFixed(1)}
                    </span>
                  )}
                </div>
              )}
            </div>

            {tarjetas.length > 0 && (
              <p style={{ fontSize: '11px', color: 'var(--text-3)', textAlign: 'center', margin: '0 2px 12px', lineHeight: 1.5 }}>
                {data.slotsVentana ?? tarjetas.length} diferenciales en tu ventana · los{' '}
                <strong style={{ color: 'var(--text-2)' }}>{diffsCuentan.length} mejores</strong> definen tu índice.
                {tarjetas.some((t) => t.valeDoble) && ' Una ronda de campeonato aporta 2.'}
              </p>
            )}

            {/* Lista de rondas físicas (cronológica; las que cuentan, resaltadas) */}
            <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {tarjetas.map((t) => (
                <li
                  key={t.ticket}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px',
                    padding: '11px 12px',
                    border: `1px solid ${t.cuenta ? 'rgba(196,153,42,0.35)' : 'var(--border)'}`,
                    background: t.cuenta ? 'rgba(196,153,42,0.045)' : 'var(--bg)',
                    borderRadius: '11px',
                  }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {nombreCancha(t.clubCancha)}
                    </div>
                    <div style={{ fontSize: '10.5px', color: 'var(--text-3)', fontFamily: '"DM Mono", monospace', marginTop: '2px', letterSpacing: '0.02em' }}>
                      {metaLinea(t)}
                    </div>
                    {t.valeDoble && (
                      <span
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '4px',
                          fontSize: '9.5px',
                          fontWeight: 700,
                          color: GOLD,
                          background: 'rgba(196,153,42,0.12)',
                          borderRadius: '5px',
                          padding: '2px 6px',
                          letterSpacing: '0.03em',
                          textTransform: 'uppercase',
                          marginTop: '5px',
                        }}
                      >
                        <Trophy size={11} strokeWidth={1.9} />
                        Campeonato · cuenta ×2
                      </span>
                    )}
                  </div>
                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    <div
                      style={{
                        fontFamily: '"DM Mono", monospace',
                        fontSize: '19px',
                        fontWeight: 600,
                        color: t.cuenta ? GOLD : 'var(--text-3)',
                        lineHeight: 1,
                      }}
                    >
                      {t.diferencial.toFixed(1)}
                    </div>
                    <div
                      style={{
                        fontSize: '9px',
                        textTransform: 'uppercase',
                        letterSpacing: '0.08em',
                        fontFamily: '"DM Mono", monospace',
                        marginTop: '3px',
                        color: t.cuenta ? GOLD : 'var(--text-3)',
                      }}
                    >
                      {t.cuenta ? 'cuenta' : 'diff'}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </div>,
    document.body
  )
}
