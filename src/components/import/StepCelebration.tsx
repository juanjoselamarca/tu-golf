'use client'

// src/components/import/StepCelebration.tsx
//
// Pantalla final del wizard de import.
//
// Pre-2026-05-21: mostraba CPI animado + bloque "Tu Momentum" + insights +
// 3 botones. Los reportes inbox 13e77e1b y 62e6b27b coincidieron en que
// esa pantalla "no aporta" con N=1 ronda y que el camino correcto es:
// "después de importar una tarjeta sólo aparecerá un resumen de cuantas
// tarjetas tiene el usuario y un sólo botón que lleve a las rondas
// históricas". La pantalla detallada se accede ahora desde /perfil/stats.
//
// Por eso este componente quedó intencionalmente minimalista: un checkmark,
// 1 línea de resumen, 1 CTA primario (ver historial) + 1 secundario opcional
// (ver estadísticas, para no perder el camino al CPI quien quiera verlo).
// El prop `cpiResult` se mantiene en la signature para compatibilidad con
// ImportWizard, aunque ya no se renderiza visualmente acá.

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import type { ResultadoCPI } from '@/golf/stats/cpi'
import { Check } from '@/components/icons'

interface StepCelebrationProps {
  /** Puede ser null: el CPI solo se calcula con ≥3 rondas. Prop conservado por
      compatibilidad de signature; este componente ya no lo consume. */
  cpiResult: ResultadoCPI | null
  insights: string[]
  roundCount: number
  /** Cuántas tarjetas recién importadas no traían tee de salida. Si >0 y el
      usuario no tiene tee por defecto, se le pregunta UNA vez. */
  teelessCount: number
}

// Las 4 opciones de la pregunta de 1 vez + su swatch (sin emoji, premium).
const TEE_OPTIONS: { color: string; label: string; swatch: string; border?: string }[] = [
  { color: 'negro', label: 'Negro', swatch: '#1f2937' },
  { color: 'azul', label: 'Azul', swatch: '#2563eb' },
  { color: 'blanco', label: 'Blanco', swatch: '#f8fafc', border: '#cbd5e1' },
  { color: 'rojo', label: 'Rojo', swatch: '#dc2626' },
]

const KEYFRAMES = `
@keyframes celebFadeIn {
  from { opacity: 0; transform: translateY(8px); }
  to   { opacity: 1; transform: translateY(0); }
}
@keyframes celebCheckPop {
  0%   { transform: scale(0); opacity: 0; }
  60%  { transform: scale(1.15); opacity: 1; }
  100% { transform: scale(1); opacity: 1; }
}
`

export default function StepCelebration({ roundCount, teelessCount }: StepCelebrationProps) {
  const router = useRouter()
  const [totalRounds, setTotalRounds] = useState<number | null>(null)
  // Pregunta de 1 vez por el tee de salida de las tarjetas que no lo traían.
  const [needsTee, setNeedsTee] = useState(false)
  const [savingTee, setSavingTee] = useState(false)
  const [teeError, setTeeError] = useState(false)
  const [teeResult, setTeeResult] = useState<{ color: string; recomputed: number } | null>(null)

  // Inject keyframes (una sola vez, idempotente).
  useEffect(() => {
    const id = 'celeb-keyframes-min'
    if (typeof document !== 'undefined' && !document.getElementById(id)) {
      const style = document.createElement('style')
      style.id = id
      style.textContent = KEYFRAMES
      document.head.appendChild(style)
    }
  }, [])

  // Fetch total de tarjetas históricas para el resumen "tenés N tarjetas".
  // El reporte pide explícitamente: "un resumen de cuantas tarjetas tiene el usuario".
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const supabase = createClient()
      const { count } = await supabase
        .from('historical_rounds')
        .select('*', { count: 'exact', head: true })
      if (!cancelled && typeof count === 'number') setTotalRounds(count)
    })()
    return () => { cancelled = true }
  }, [])

  // ¿Preguntar el tee? Solo si esta tanda trajo tarjetas sin tee y el usuario
  // todavía no fijó su color habitual (se pregunta UNA sola vez).
  useEffect(() => {
    if (teelessCount === 0) return
    let cancelled = false
    ;(async () => {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { data } = await supabase
        .from('profiles')
        .select('default_tee_color')
        .eq('id', user.id)
        .maybeSingle()
      if (!cancelled && !data?.default_tee_color) setNeedsTee(true)
    })()
    return () => { cancelled = true }
  }, [teelessCount])

  async function chooseTee(color: string) {
    setSavingTee(true)
    setTeeError(false)
    try {
      const res = await fetch('/api/perfil/default-tee', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ color }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json?.error || 'error')
      setTeeResult({ color, recomputed: json.recomputed ?? 0 })
      setNeedsTee(false)
    } catch {
      setTeeError(true)
    } finally {
      setSavingTee(false)
    }
  }

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'var(--bg)',
        zIndex: 100,
        overflowY: 'auto',
        WebkitOverflowScrolling: 'touch',
      }}
    >
      <div
        style={{
          maxWidth: '420px',
          margin: '0 auto',
          padding: 'calc(64px + env(safe-area-inset-top)) 24px calc(40px + env(safe-area-inset-bottom))',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          minHeight: '100vh',
        }}
      >
        {/* Checkmark animado — éxito visual minimal. */}
        <div
          style={{
            width: '72px',
            height: '72px',
            borderRadius: '50%',
            background: 'rgba(34,197,94,0.12)',
            border: '1.5px solid rgba(34,197,94,0.35)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#16a34a',
            marginBottom: '24px',
            animation: 'celebCheckPop 480ms cubic-bezier(0.16,1,0.3,1) both',
          }}
        >
          <Check size={36} strokeWidth={2} />
        </div>

        {/* Mensaje principal. */}
        <h1
          style={{
            fontFamily: '"Playfair Display", serif',
            fontSize: '28px',
            fontWeight: 700,
            color: 'var(--text)',
            margin: '0 0 10px',
            textAlign: 'center',
            lineHeight: 1.2,
            opacity: 0,
            animation: 'celebFadeIn 480ms ease 80ms forwards',
          }}
        >
          {roundCount === 1 ? 'Tarjeta guardada' : `${roundCount} tarjetas guardadas`}
        </h1>

        {/* Resumen "tenés N tarjetas en total". */}
        <p
          style={{
            fontSize: '14px',
            color: 'var(--text-2)',
            margin: '0 0 36px',
            textAlign: 'center',
            lineHeight: 1.5,
            opacity: 0,
            animation: 'celebFadeIn 480ms ease 160ms forwards',
            minHeight: '21px',  /* reserva línea para que no salte el layout mientras carga */
          }}
        >
          {totalRounds === null
            ? ' '
            : totalRounds === 1
              ? 'Esta es tu primera ronda en Golfers+.'
              : `Ya tenés ${totalRounds} rondas en tu historial.`}
        </p>

        {/* Pregunta de 1 vez: tee de salida para las tarjetas que no lo traían. */}
        {needsTee && (
          <div
            style={{
              width: '100%',
              background: 'var(--bg-surface, rgba(255,255,255,0.04))',
              border: '1px solid var(--border, rgba(255,255,255,0.1))',
              borderRadius: '14px',
              padding: '18px',
              marginBottom: '20px',
              opacity: 0,
              animation: 'celebFadeIn 480ms ease 220ms forwards',
            }}
          >
            <p style={{ fontSize: '14px', color: 'var(--text)', margin: '0 0 14px', lineHeight: 1.5, textAlign: 'center' }}>
              Algunas tarjetas no traían el tee de salida. ¿Desde qué color salís normalmente?
            </p>
            <div style={{ display: 'flex', gap: '8px', justifyContent: 'center', flexWrap: 'wrap' }}>
              {TEE_OPTIONS.map((t) => (
                <button
                  key={t.color}
                  disabled={savingTee}
                  onClick={() => chooseTee(t.color)}
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
                    cursor: savingTee ? 'default' : 'pointer',
                    opacity: savingTee ? 0.5 : 1,
                  }}
                >
                  <span
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
            {teeError && (
              <p style={{ fontSize: '13px', color: '#dc2626', margin: '12px 0 0', textAlign: 'center' }}>
                No pudimos guardar. Probá de nuevo.
              </p>
            )}
          </div>
        )}

        {/* Confirmación tras elegir el tee. */}
        {teeResult && (
          <p
            style={{
              fontSize: '14px',
              color: 'var(--text-2)',
              margin: '0 0 24px',
              textAlign: 'center',
              lineHeight: 1.5,
            }}
          >
            Listo: usaremos {teeResult.color} para tus tarjetas sin tee
            {teeResult.recomputed > 0
              ? ` — recalculamos ${teeResult.recomputed} ${teeResult.recomputed === 1 ? 'ronda' : 'rondas'}.`
              : '.'}
          </p>
        )}

        {/* CTA primario — el botón único que pide el reporte. */}
        <button
          onClick={() => router.push('/perfil/historial')}
          style={{
            width: '100%',
            padding: '16px 24px',
            borderRadius: '14px',
            fontSize: '16px',
            fontWeight: 700,
            background: 'linear-gradient(135deg, #c4992a 0%, #d4a94a 100%)',
            color: 'var(--brand-dark)',
            border: 'none',
            cursor: 'pointer',
            minHeight: '52px',
            fontFamily: '"DM Sans", sans-serif',
            letterSpacing: '0.3px',
            opacity: 0,
            animation: 'celebFadeIn 480ms ease 240ms forwards',
            marginBottom: '12px',
          }}
        >
          Ver mis rondas históricas →
        </button>

        {/* CTA secundario opcional — para usuarios que quieran ver el CPI. */}
        <button
          onClick={() => router.push('/perfil/stats')}
          style={{
            width: '100%',
            padding: '14px 24px',
            borderRadius: '14px',
            fontSize: '14px',
            fontWeight: 600,
            background: 'transparent',
            color: 'var(--text-2)',
            border: '1px solid var(--border)',
            cursor: 'pointer',
            minHeight: '46px',
            fontFamily: '"DM Sans", sans-serif',
            opacity: 0,
            animation: 'celebFadeIn 480ms ease 320ms forwards',
          }}
        >
          Ver mis estadísticas
        </button>
      </div>
    </div>
  )
}
