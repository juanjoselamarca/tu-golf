'use client'

import { useEffect, useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import type { ResultadoCPI } from '@/golf/stats/cpi'
import { nivelCPI } from '@/golf/stats/cpi'

interface StepCelebrationProps {
  cpiResult: ResultadoCPI
  insights: string[]
  roundCount: number
}

const LEVEL_COLORS: Record<string, string> = {
  'Elite': '#c4992a',
  'Avanzado': '#22c55e',
  'Intermedio': '#60a5fa',
  'En desarrollo': '#94a8c0',
  'Principiante': '#94a8c0',
  'Sin clasificar': '#94a8c0',
}

function easeOutExpo(t: number): number {
  return t === 1 ? 1 : 1 - Math.pow(2, -10 * t)
}

function getTrendText(trend: number): string {
  if (trend > 0) return 'en ascenso'
  if (trend < 0) return 'con espacio para mejorar'
  return 'estable'
}

function getTrendLabel(trend: number): string {
  if (trend > 0) return 'Mejorando'
  if (trend < 0) return 'Bajando'
  return 'Estable'
}

function getConsistenciaLabel(score: number): string {
  if (score > 70) return 'Alta'
  if (score >= 50) return 'Media'
  return 'En desarrollo'
}

function getPersonalizedMessage(score: number, trend: number, roundCount: number): string {
  const trendText = getTrendText(trend)

  if (score >= 80) {
    return `Tu momentum es excepcional. ${roundCount} rondas confirman un nivel de consistencia que pocos logran. La tendencia ${trendText} refuerza que tu juego esta en su mejor version.`
  }
  if (score >= 60) {
    const trendDetailed = trend > 0
      ? 'La tendencia en ascenso es una senal clara de progreso'
      : trend < 0
        ? 'Hay margen para optimizar, y eso es una oportunidad'
        : 'La estabilidad muestra una base sólida'
    return `Estás construyendo un momentum sólido. Con ${roundCount} rondas analizadas, tu consistencia muestra una base fuerte. ${trendDetailed} — cada ronda suma a tu evolución.`
  }
  if (score >= 40) {
    const trendDetailed = trend > 0
      ? 'La tendencia positiva indica que vas en la dirección correcta.'
      : trend < 0
        ? 'Algunos ajustes pueden cambiar la trayectoria.'
        : 'La estabilidad es un buen punto de partida.'
    return `Tu momentum está en desarrollo. Las ${roundCount} rondas revelan oportunidades claras para crecer. ${trendDetailed} tAIger+ tiene la información que necesita para guiarte.`
  }
  if (score >= 20) {
    return `El momentum empieza aquí. Con ${roundCount} rondas ya tenemos suficiente para que tAIger+ identifique los patrones clave de tu juego.`
  }
  return 'Cada ronda que agregas construye tu momentum. Sigue importando para que tAIger+ pueda analizar tu juego a fondo.'
}

// CSS keyframes injected once
const KEYFRAMES = `
@keyframes celebFadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}
@keyframes celebSlideUp {
  from { opacity: 0; transform: translateY(24px); }
  to { opacity: 1; transform: translateY(0); }
}
`

export default function StepCelebration({
  cpiResult,
  insights,
  roundCount,
}: StepCelebrationProps) {
  const router = useRouter()
  const [animatedScore, setAnimatedScore] = useState(0)
  const [counterDone, setCounterDone] = useState(false)
  const startTimeRef = useRef<number | null>(null)

  // Inject keyframes
  useEffect(() => {
    const id = 'celeb-keyframes'
    if (typeof document !== 'undefined' && !document.getElementById(id)) {
      const style = document.createElement('style')
      style.id = id
      style.textContent = KEYFRAMES
      document.head.appendChild(style)
    }
  }, [])

  // Animated counter with easing
  useEffect(() => {
    const target = cpiResult.score
    const duration = 1500

    function tick(timestamp: number) {
      if (startTimeRef.current === null) startTimeRef.current = timestamp
      const elapsed = timestamp - startTimeRef.current
      const progress = Math.min(elapsed / duration, 1)
      const eased = easeOutExpo(progress)
      const current = eased * target

      setAnimatedScore(Math.round(current * 10) / 10)

      if (progress < 1) {
        requestAnimationFrame(tick)
      } else {
        setAnimatedScore(target)
        setCounterDone(true)
      }
    }

    requestAnimationFrame(tick)
  }, [cpiResult.score])

  const level = nivelCPI(cpiResult.score)
  const levelColor = LEVEL_COLORS[level] || '#94a8c0'
  const consistenciaLabel = getConsistenciaLabel(cpiResult.score)
  const trendLabel = getTrendLabel(cpiResult.trend)
  const message = getPersonalizedMessage(cpiResult.score, cpiResult.trend, roundCount)

  // Trend arrow SVG
  const TrendArrow = () => {
    if (cpiResult.trend > 0) {
      return (
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
          <path d="M10 4L16 12H4L10 4Z" fill="#22c55e" />
        </svg>
      )
    }
    if (cpiResult.trend < 0) {
      return (
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
          <path d="M10 16L4 8H16L10 16Z" fill="#ef4444" />
        </svg>
      )
    }
    return (
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
        <rect x="3" y="9" width="14" height="2" rx="1" fill="#94a8c0" />
      </svg>
    )
  }

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: '#070d18',
        zIndex: 100,
        overflowY: 'auto',
        WebkitOverflowScrolling: 'touch',
      }}
    >
      <div
        style={{
          maxWidth: '480px',
          margin: '0 auto',
          padding: 'calc(48px + env(safe-area-inset-top)) 24px calc(40px + env(safe-area-inset-bottom))',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          minHeight: '100vh',
        }}
      >
        {/* Section 1: Score Animation */}
        <div
          style={{
            textAlign: 'center',
            marginBottom: '40px',
          }}
        >
          <div
            style={{
              fontSize: 'clamp(48px, 15vw, 72px)',
              fontWeight: 700,
              color: '#c4992a',
              lineHeight: 1,
              fontFamily: '"Playfair Display", serif',
              letterSpacing: '-2px',
            }}
          >
            {Math.round(animatedScore)}
          </div>
          <div
            style={{
              fontSize: '13px',
              color: '#94a8c0',
              marginTop: '4px',
              letterSpacing: '2px',
              textTransform: 'uppercase',
              fontFamily: '"DM Sans", sans-serif',
            }}
          >
            CPI
          </div>
          <div
            style={{
              marginTop: '16px',
              fontSize: '18px',
              fontWeight: 600,
              color: levelColor,
              fontFamily: '"Playfair Display", serif',
              opacity: counterDone ? 1 : 0,
              transition: 'opacity 0.5s ease',
            }}
          >
            {level}
          </div>
        </div>

        {/* Section 2: Tu Momentum Card */}
        <div
          style={{
            width: '100%',
            background: '#0e1c2f',
            border: '1px solid rgba(196,153,42,0.15)',
            borderRadius: '16px',
            padding: '24px 20px',
            marginBottom: '28px',
            opacity: 0,
            animation: counterDone ? 'celebSlideUp 0.5s ease forwards' : 'none',
            animationDelay: '0.3s',
          }}
        >
          <div
            style={{
              fontSize: '13px',
              fontWeight: 600,
              color: '#c4992a',
              letterSpacing: '1.5px',
              textTransform: 'uppercase',
              marginBottom: '20px',
              fontFamily: '"DM Sans", sans-serif',
            }}
          >
            Tu Momentum
          </div>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr 1fr',
              gap: '16px',
            }}
          >
            {/* Consistencia */}
            <div style={{ textAlign: 'center' }}>
              <div
                style={{
                  fontSize: '11px',
                  color: '#94a8c0',
                  textTransform: 'uppercase',
                  letterSpacing: '0.5px',
                  marginBottom: '8px',
                  fontFamily: '"DM Sans", sans-serif',
                }}
              >
                Consistencia
              </div>
              <div
                style={{
                  fontSize: '16px',
                  fontWeight: 700,
                  color: '#edeae4',
                  fontFamily: '"DM Sans", sans-serif',
                }}
              >
                {consistenciaLabel}
              </div>
            </div>

            {/* Tendencia */}
            <div style={{ textAlign: 'center' }}>
              <div
                style={{
                  fontSize: '11px',
                  color: '#94a8c0',
                  textTransform: 'uppercase',
                  letterSpacing: '0.5px',
                  marginBottom: '8px',
                  fontFamily: '"DM Sans", sans-serif',
                }}
              >
                Tendencia
              </div>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '4px',
                }}
              >
                <TrendArrow />
                <span
                  style={{
                    fontSize: '16px',
                    fontWeight: 700,
                    color: '#edeae4',
                    fontFamily: '"DM Sans", sans-serif',
                  }}
                >
                  {trendLabel}
                </span>
              </div>
            </div>

            {/* Volumen */}
            <div style={{ textAlign: 'center' }}>
              <div
                style={{
                  fontSize: '11px',
                  color: '#94a8c0',
                  textTransform: 'uppercase',
                  letterSpacing: '0.5px',
                  marginBottom: '8px',
                  fontFamily: '"DM Sans", sans-serif',
                }}
              >
                Volumen
              </div>
              <div
                style={{
                  fontSize: '16px',
                  fontWeight: 700,
                  color: '#edeae4',
                  fontFamily: '"DM Sans", sans-serif',
                }}
              >
                {roundCount} ronda{roundCount !== 1 ? 's' : ''}
              </div>
            </div>
          </div>
        </div>

        {/* Section 3: Personalized Analysis */}
        <div
          style={{
            width: '100%',
            marginBottom: '36px',
            opacity: 0,
            animation: counterDone ? 'celebFadeIn 0.6s ease forwards' : 'none',
            animationDelay: '0.8s',
          }}
        >
          <p
            style={{
              fontSize: '15px',
              lineHeight: 1.7,
              color: '#94a8c0',
              margin: 0,
              fontFamily: '"DM Sans", sans-serif',
            }}
          >
            {message}
          </p>
        </div>

        {/* Section 4: Buttons */}
        <div
          style={{
            width: '100%',
            display: 'flex',
            flexDirection: 'column',
            gap: '12px',
            marginTop: 'auto',
            opacity: 0,
            animation: counterDone ? 'celebFadeIn 0.5s ease forwards' : 'none',
            animationDelay: '1.0s',
          }}
        >
          <button
            onClick={() => router.push('/perfil/stats')}
            style={{
              width: '100%',
              padding: '16px 24px',
              borderRadius: '14px',
              fontSize: '16px',
              fontWeight: 700,
              background: 'linear-gradient(135deg, #c4992a 0%, #d4a94a 100%)',
              color: '#070d18',
              border: 'none',
              cursor: 'pointer',
              minHeight: '52px',
              fontFamily: '"DM Sans", sans-serif',
              letterSpacing: '0.3px',
            }}
          >
            Ver mi CPI y estadisticas &rarr;
          </button>
          <button
            onClick={() => router.push('/coach')}
            style={{
              width: '100%',
              padding: '16px 24px',
              borderRadius: '14px',
              fontSize: '16px',
              fontWeight: 600,
              background: 'transparent',
              color: '#c4992a',
              border: '1px solid rgba(196,153,42,0.3)',
              cursor: 'pointer',
              minHeight: '52px',
              fontFamily: '"DM Sans", sans-serif',
            }}
          >
            Hablar con tAIger+
          </button>
          <button
            onClick={() => router.push('/perfil/historial')}
            style={{
              width: '100%',
              padding: '16px 24px',
              borderRadius: '14px',
              fontSize: '14px',
              fontWeight: 500,
              background: 'transparent',
              color: '#94a8c0',
              border: 'none',
              cursor: 'pointer',
              minHeight: '44px',
              fontFamily: '"DM Sans", sans-serif',
            }}
          >
            Ver historial de rondas
          </button>
        </div>
      </div>
    </div>
  )
}
