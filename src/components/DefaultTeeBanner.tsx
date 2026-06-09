'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Flag, Check } from '@/components/icons'
import { TEE_COLOR_OPTIONS } from '@/golf/courses/tee-colors'

/**
 * Banner persistente para fijar el tee por defecto.
 *
 * Red de seguridad: si el jugador importó tarjetas sin tee (Garmin no siempre lo
 * trae) y se saltó la pregunta de la celebración, sus rondas no alimentan el
 * índice. Este banner aparece en /coach · /perfil · historial hasta que elige su
 * tee — un tap recalcula sus rondas y su índice. Sin elección no desaparece (es
 * el punto: que nadie quede sin índice por saltar una pantalla). Se auto-oculta
 * vía /api/perfil/tee-prompt-status, así que no molesta a quien ya lo fijó.
 */
export function DefaultTeeBanner() {
  const router = useRouter()
  const [show, setShow] = useState(false)
  const [recoverable, setRecoverable] = useState(0)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(false)
  const [done, setDone] = useState<{ color: string; recomputed: number } | null>(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch('/api/perfil/tee-prompt-status')
        if (!res.ok) return
        const data = await res.json()
        if (!cancelled && data?.show) {
          setShow(true)
          setRecoverable(data.recoverableRounds ?? 0)
        }
      } catch {
        /* fail-closed: no mostrar */
      }
    })()
    return () => { cancelled = true }
  }, [])

  async function choose(color: string) {
    setSaving(true)
    setError(false)
    try {
      const res = await fetch('/api/perfil/default-tee', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ color }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json?.error || 'error')
      setDone({ color, recomputed: json.recomputed ?? 0 })
      // Refrescar la página para que el índice/CPI recalculados se reflejen.
      router.refresh()
    } catch {
      setError(true)
    } finally {
      setSaving(false)
    }
  }

  if (!show) return null

  return (
    <div
      role="region"
      aria-label="Definí tu tee de salida"
      style={{
        width: '100%',
        background: 'var(--bg-surface, rgba(255,255,255,0.04))',
        border: '1px solid var(--border, rgba(255,255,255,0.1))',
        borderLeft: '3px solid var(--brand-on-bg, #c4992a)',
        borderRadius: '14px',
        padding: '18px 20px',
        marginBottom: '20px',
      }}
    >
      {done ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <Check size={18} strokeWidth={2.2} style={{ color: '#16a34a', flexShrink: 0 }} />
          <p style={{ fontSize: '14px', color: 'var(--text)', margin: 0, lineHeight: 1.5 }}>
            Listo: usamos <strong>{done.color}</strong> para tus tarjetas sin tee
            {done.recomputed > 0
              ? ` — recalculamos tu índice sobre ${done.recomputed} ${done.recomputed === 1 ? 'ronda' : 'rondas'}.`
              : '.'}
          </p>
        </div>
      ) : (
        <>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', marginBottom: '14px' }}>
            <Flag size={18} strokeWidth={2} style={{ color: 'var(--brand-on-bg, #c4992a)', flexShrink: 0, marginTop: '2px' }} />
            <div>
              <p style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text)', margin: '0 0 3px', lineHeight: 1.35 }}>
                Calculá tu índice
              </p>
              <p style={{ fontSize: '13.5px', color: 'var(--text-2)', margin: 0, lineHeight: 1.5 }}>
                {recoverable > 0
                  ? `${recoverable} de tus ${recoverable === 1 ? 'ronda' : 'rondas'} entró sin el tee de salida. Elegí desde qué color jugás normalmente y calculamos tu índice al instante.`
                  : 'Elegí desde qué tee jugás normalmente para calcular tu índice.'}
              </p>
            </div>
          </div>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            {TEE_COLOR_OPTIONS.map((t) => (
              <button
                key={t.color}
                disabled={saving}
                onClick={() => choose(t.color)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '7px',
                  padding: '9px 14px',
                  borderRadius: '10px',
                  border: '1px solid var(--border, rgba(255,255,255,0.14))',
                  background: 'transparent',
                  color: 'var(--text)',
                  fontSize: '14px',
                  fontWeight: 600,
                  cursor: saving ? 'default' : 'pointer',
                  opacity: saving ? 0.5 : 1,
                  minHeight: '40px',
                }}
              >
                <span
                  aria-hidden
                  style={{
                    width: '14px',
                    height: '14px',
                    borderRadius: '50%',
                    background: t.swatch,
                    border: t.border ? `1px solid ${t.border}` : 'none',
                    flexShrink: 0,
                  }}
                />
                {t.label}
              </button>
            ))}
          </div>
          {error && (
            <p style={{ fontSize: '13px', color: '#dc2626', margin: '12px 0 0' }}>
              No pudimos guardar. Probá de nuevo.
            </p>
          )}
        </>
      )}
    </div>
  )
}
