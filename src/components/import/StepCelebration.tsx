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
  cpiResult: ResultadoCPI
  insights: string[]
  roundCount: number
}

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

export default function StepCelebration({ roundCount }: StepCelebrationProps) {
  const router = useRouter()
  const [totalRounds, setTotalRounds] = useState<number | null>(null)

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
