'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { GWISparkline } from '@/components/GWISparkline'

/* ── Theme (coherente con /demo hub y el resto de Golfers+) ─────────── */
const theme = {
  bg: 'var(--bg)',
  card: 'var(--bg-surface)',
  text: 'var(--text)',
  textMuted: 'var(--text-2)',
  textFaint: 'var(--text-3)',
  border: 'var(--border)',
  borderSoft: 'var(--border)',
  gold: '#c4992a',
  navy: '#070d18',
  emerald: '#16a34a',
} as const

/* ── Player fantasma — Carlos Méndez ─────────────────────────────────── */
const PLAYER = {
  name: 'Carlos Méndez',
  club: 'C. G. Los Leones',
  indiceWHS: 9.0,
  indiceGolfers: 8.3,
  rondasAnalizadas: 20,
  tendencia: 'mejorando' as const,
}

// Serie de Índice Golfers+ (últimas 10 rondas): tendencia de bajada = mejora
const INDICE_SERIES = [10.4, 10.1, 9.8, 9.6, 9.4, 9.2, 9.0, 8.8, 8.5, 8.3]

/* ── Insights ficticios — diseñados como "pequeños hallazgos de un coach" ── */
interface Insight {
  id: string
  symbol: string
  title: string
  summary: string
  detail: {
    stat: string
    example: string
    source: string
  }
  severity: 'strength' | 'opportunity' | 'attention'
}

const INSIGHTS: Insight[] = [
  {
    id: 'fairways-fatiga',
    symbol: '🎯',
    title: 'Cansancio en la segunda vuelta',
    summary: 'Pegás 73% de fairways en los primeros 10 hoyos, solo 48% del 11 al 18.',
    detail: {
      stat: '−25 puntos de precisión entre 9 y 18',
      example: 'Los Leones · 13-abr — 3 drives fuera en hoyos 13, 15 y 17. Ganaste el front 9 con +1, cediste el back 9 con +5.',
      source: 'Patrón recurrente en 14 de 20 rondas.',
    },
    severity: 'attention',
  },
  {
    id: 'putting-largo',
    symbol: '⛳',
    title: 'El putting largo te come 6 golpes por ronda',
    summary: 'Promedio: 1.8 putts en pares 3, 2.4 putts en pares 5. Casi un golpe extra por hoyo largo.',
    detail: {
      stat: 'Diferencia de 0.6 putts por hoyo entre pares 3 y pares 5',
      example: 'La Dehesa · 20-abr — 3-putt en el hoyo 2 (par 5, 32 m). Otro 3-putt en el 14 (par 5, 28 m).',
      source: 'Consistente en 18 de 20 rondas. Putts >25 m son tu flanco más débil.',
    },
    severity: 'opportunity',
  },
  {
    id: 'hoyos-duros',
    symbol: '🌬️',
    title: 'Tus 3 hoyos más caros',
    summary: 'En Los Leones perdés +1.2 golpes promedio en los hoyos 13, 15 y 17 vs el par.',
    detail: {
      stat: '+3.6 golpes acumulados contra el par en solo 3 hoyos',
      example: 'El 13 (par 5, 478 m, viento contra) te saca +1.5 golpes promedio. Es tu hoyo más difícil del año.',
      source: 'Confirmado por viento promedio: ese tramo enfrenta el viento predominante oeste.',
    },
    severity: 'attention',
  },
  {
    id: 'hierros-cortos',
    symbol: '💪',
    title: 'Tu juego de hierros cortos es de Cat. A',
    summary: 'En hoyos de 330 a 380 m, birdie + par en 82% de los intentos.',
    detail: {
      stat: 'GIR 88% en hierros 7-9 · Proximidad promedio 5.2 m',
      example: 'Los Leones · 6-abr — 4 birdies en los hoyos 3, 7, 9 y 16. Todos con hierro 8 o 9 de aproach.',
      source: 'Tu mayor activo. Estructurá tu estrategia para maximizar tees cortos.',
    },
    severity: 'strength',
  },
]

/* ── Plan de trabajo semanal ─────────────────────────────────────────── */
interface PlanDay {
  day: string
  kind: 'range' | 'putting' | 'round' | 'rest'
  title: string
  exercises: string[]
  goalStat: string
}

const PLAN: PlanDay[] = [
  {
    day: 'Martes',
    kind: 'range',
    title: 'Driving range · rotación + cadera',
    exercises: [
      '20 drives grabando con celular detrás (línea de pies).',
      '15 swings de medio-back: focus en mantener el peso en el pie izquierdo al impacto.',
      'Último set de 10: alterná driver y madera 3 para entrenar transición.',
    ],
    goalStat: '+10% fairways después del hoyo 10',
  },
  {
    day: 'Jueves',
    kind: 'putting',
    title: 'Putting green · control de distancia',
    exercises: [
      '30 putts de 5 m a 4 agujeros distintos (pendientes variadas).',
      '20 putts de 8 m: criterio "aproxima al medio metro" en lugar de meter.',
      'Drill de 4 monedas: dejá una moneda a 2, 4, 6 y 8 m. Un putt por cada uno, 5 rondas.',
    ],
    goalStat: 'Bajar de 2.4 a 2.0 putts promedio en pares 5',
  },
  {
    day: 'Sábado',
    kind: 'round',
    title: 'Ronda test · hoyos 10-18',
    exercises: [
      'Jugá 9 back9 con foco mental: check-list antes de cada drive.',
      'En el 13, 15 y 17: no uses driver. Madera 3 o hierro 4 desde el tee.',
      'Registrá los fairways y los putts — vamos a medir en la próxima ronda.',
    ],
    goalStat: 'Back 9 en bogey o mejor por hoyo (+9 o menos)',
  },
]

/* ─────────────────────────────────────────────────────────────────────── */
/* ── Analizando overlay — efecto "el coach está leyendo" ────────────── */
/* ─────────────────────────────────────────────────────────────────────── */

function AnalizandoOverlay({ onDone }: { onDone: () => void }) {
  const [progress, setProgress] = useState(0)
  const [label, setLabel] = useState('Cargando rondas')

  useEffect(() => {
    const steps: Array<{ at: number; label: string }> = [
      { at: 15, label: 'Cargando rondas' },
      { at: 40, label: 'Mapeando fairways y greens' },
      { at: 60, label: 'Cruzando con par, viento y hora del día' },
      { at: 82, label: 'Detectando patrones ocultos' },
      { at: 98, label: 'Armando tu plan de trabajo' },
    ]
    let pct = 0
    const t = setInterval(() => {
      pct = Math.min(100, pct + 3)
      setProgress(pct)
      const current = steps.filter(s => pct >= s.at).pop()
      if (current) setLabel(current.label)
      if (pct >= 100) {
        clearInterval(t)
        setTimeout(onDone, 480)
      }
    }, 55)
    return () => clearInterval(t)
  }, [onDone])

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      background: 'rgba(7,13,24,0.92)',
      backdropFilter: 'blur(12px)',
      zIndex: 500,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '24px',
    }}>
      <div style={{
        maxWidth: '420px',
        width: '100%',
        textAlign: 'center',
        color: '#ffffff',
      }}>
        <div style={{
          fontSize: '11px',
          fontFamily: '"DM Mono", ui-monospace, monospace',
          color: theme.gold,
          letterSpacing: '0.2em',
          textTransform: 'uppercase',
          marginBottom: '20px',
        }}>
          tAIger+ leyendo tu historial
        </div>

        {/* Pulsing ring */}
        <div style={{
          width: '88px',
          height: '88px',
          margin: '0 auto 28px',
          borderRadius: '50%',
          border: `2px solid ${theme.gold}`,
          borderTopColor: 'transparent',
          animation: 'taigerRing 1.1s linear infinite',
          position: 'relative',
        }}>
          <div style={{
            position: 'absolute',
            inset: 0,
            borderRadius: '50%',
            background: `radial-gradient(circle, ${theme.gold}22 0%, transparent 70%)`,
          }} />
        </div>

        <div style={{
          fontFamily: '"Playfair Display", serif',
          fontSize: '22px',
          fontWeight: 600,
          marginBottom: '6px',
          letterSpacing: '-0.01em',
        }}>
          {label}...
        </div>

        <div style={{
          fontSize: '13px',
          color: 'rgba(255,255,255,0.5)',
          fontFamily: '"DM Mono", ui-monospace, monospace',
          marginBottom: '28px',
          fontVariantNumeric: 'tabular-nums',
        }}>
          {progress}% · rondas {Math.floor((progress / 100) * PLAYER.rondasAnalizadas)}/{PLAYER.rondasAnalizadas}
        </div>

        {/* Progress bar */}
        <div style={{
          height: '3px',
          background: 'rgba(255,255,255,0.08)',
          borderRadius: '999px',
          overflow: 'hidden',
        }}>
          <div style={{
            height: '100%',
            width: `${progress}%`,
            background: `linear-gradient(90deg, ${theme.gold} 0%, #f1c352 100%)`,
            transition: 'width 55ms linear',
            boxShadow: `0 0 12px ${theme.gold}88`,
          }} />
        </div>

        <div style={{
          marginTop: '32px',
          fontSize: '11px',
          color: 'rgba(255,255,255,0.35)',
          lineHeight: 1.6,
        }}>
          Este demo usa un perfil de ejemplo.<br />
          Cuando te unís, tAIger+ hace lo mismo con tus rondas reales.
        </div>
      </div>

      <style>{`
        @keyframes taigerRing {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  )
}

/* ─────────────────────────────────────────────────────────────────────── */
/* ── Insight Card ───────────────────────────────────────────────────── */
/* ─────────────────────────────────────────────────────────────────────── */

function InsightCard({ insight, index }: { insight: Insight; index: number }) {
  const [open, setOpen] = useState(false)
  const tone = {
    strength:    { border: theme.emerald, chipBg: 'rgba(22,163,74,0.08)',  chipText: '#15803d', label: 'Fortaleza' },
    opportunity: { border: theme.gold,    chipBg: 'rgba(196,153,42,0.10)', chipText: theme.gold, label: 'Oportunidad' },
    attention:   { border: '#dc2626',     chipBg: 'rgba(220,38,38,0.06)',  chipText: '#b91c1c', label: 'A trabajar' },
  }[insight.severity]

  return (
    <div
      style={{
        background: theme.card,
        border: `1px solid ${theme.border}`,
        borderLeft: `3px solid ${tone.border}`,
        borderRadius: '12px',
        padding: '18px 20px',
        marginBottom: '12px',
        animation: `insightIn 520ms ${index * 90}ms ease both`,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '14px' }}>
        <div style={{
          fontSize: '26px',
          lineHeight: 1,
          flexShrink: 0,
          filter: 'grayscale(0.1)',
        }}>
          {insight.symbol}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            display: 'inline-block',
            fontSize: '9px',
            letterSpacing: '0.12em',
            textTransform: 'uppercase',
            fontFamily: '"DM Mono", ui-monospace, monospace',
            fontWeight: 700,
            background: tone.chipBg,
            color: tone.chipText,
            padding: '3px 8px',
            borderRadius: '999px',
            marginBottom: '8px',
          }}>
            {tone.label}
          </div>
          <div style={{
            fontFamily: '"Playfair Display", serif',
            fontSize: '17px',
            fontWeight: 600,
            color: theme.text,
            letterSpacing: '-0.01em',
            marginBottom: '4px',
          }}>
            {insight.title}
          </div>
          <p style={{
            margin: 0,
            fontSize: '13px',
            color: theme.textMuted,
            lineHeight: 1.55,
          }}>
            {insight.summary}
          </p>

          <button
            type="button"
            onClick={() => setOpen(o => !o)}
            style={{
              marginTop: '12px',
              background: 'transparent',
              border: 'none',
              padding: 0,
              fontSize: '11px',
              fontFamily: '"DM Mono", ui-monospace, monospace',
              color: theme.gold,
              fontWeight: 600,
              letterSpacing: '0.05em',
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
            }}
            aria-expanded={open}
          >
            {open ? '− Ocultar evidencia' : '+ Cómo llegué a esto'}
          </button>

          {open && (
            <div style={{
              marginTop: '12px',
              padding: '12px 14px',
              background: 'var(--bg)',
              border: `1px dashed ${theme.border}`,
              borderRadius: '10px',
              animation: 'fadeUp 220ms ease both',
            }}>
              <div style={{
                fontSize: '10px',
                fontFamily: '"DM Mono", ui-monospace, monospace',
                color: theme.textFaint,
                textTransform: 'uppercase',
                letterSpacing: '0.1em',
                marginBottom: '4px',
              }}>
                Estadística
              </div>
              <div style={{
                fontSize: '13px',
                color: theme.text,
                fontWeight: 600,
                marginBottom: '10px',
                fontFamily: '"DM Mono", ui-monospace, monospace',
              }}>
                {insight.detail.stat}
              </div>

              <div style={{
                fontSize: '10px',
                fontFamily: '"DM Mono", ui-monospace, monospace',
                color: theme.textFaint,
                textTransform: 'uppercase',
                letterSpacing: '0.1em',
                marginBottom: '4px',
              }}>
                Ejemplo reciente
              </div>
              <p style={{
                margin: '0 0 10px',
                fontSize: '12.5px',
                color: theme.textMuted,
                lineHeight: 1.55,
              }}>
                {insight.detail.example}
              </p>

              <div style={{
                fontSize: '10px',
                fontFamily: '"DM Mono", ui-monospace, monospace',
                color: theme.textFaint,
                textTransform: 'uppercase',
                letterSpacing: '0.1em',
                marginBottom: '4px',
              }}>
                Base del análisis
              </div>
              <p style={{
                margin: 0,
                fontSize: '12px',
                color: theme.textMuted,
                lineHeight: 1.5,
                fontStyle: 'italic',
              }}>
                {insight.detail.source}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

/* ─────────────────────────────────────────────────────────────────────── */
/* ── Plan Day Card ──────────────────────────────────────────────────── */
/* ─────────────────────────────────────────────────────────────────────── */

function PlanDayCard({ day, index }: { day: PlanDay; index: number }) {
  const [open, setOpen] = useState(index === 0)
  const dayMeta = {
    range:   { label: 'Práctica · Range',    bg: 'rgba(37,99,235,0.06)',   color: '#2563eb' },
    putting: { label: 'Práctica · Putting',  bg: 'rgba(124,58,237,0.06)',  color: '#7c3aed' },
    round:   { label: 'Ronda',                bg: 'rgba(196,153,42,0.08)', color: theme.gold },
    rest:    { label: 'Descanso',             bg: 'var(--border)',                color: theme.textMuted },
  }[day.kind]

  return (
    <div style={{
      background: theme.card,
      border: `1px solid ${theme.border}`,
      borderRadius: '12px',
      marginBottom: '10px',
      overflow: 'hidden',
    }}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
        style={{
          width: '100%',
          background: 'var(--bg-surface)',
          border: 'none',
          padding: '14px 18px',
          display: 'flex',
          alignItems: 'center',
          gap: '14px',
          cursor: 'pointer',
          textAlign: 'left',
        }}
      >
        <div style={{
          width: '44px',
          height: '44px',
          flexShrink: 0,
          borderRadius: '10px',
          background: dayMeta.bg,
          color: dayMeta.color,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontFamily: '"DM Mono", ui-monospace, monospace',
          fontSize: '11px',
          fontWeight: 700,
          letterSpacing: '0.04em',
          textTransform: 'uppercase',
        }}>
          {day.day.slice(0, 3)}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontSize: '9px',
            fontFamily: '"DM Mono", ui-monospace, monospace',
            color: dayMeta.color,
            letterSpacing: '0.12em',
            textTransform: 'uppercase',
            fontWeight: 700,
            marginBottom: '3px',
          }}>
            {dayMeta.label}
          </div>
          <div style={{
            fontSize: '14px',
            color: theme.text,
            fontWeight: 600,
            letterSpacing: '-0.01em',
          }}>
            {day.title}
          </div>
        </div>
        <span style={{ fontSize: '14px', color: theme.textFaint, flexShrink: 0 }}>{open ? '−' : '+'}</span>
      </button>

      {open && (
        <div style={{
          padding: '0 18px 16px 76px',
          animation: 'fadeUp 220ms ease both',
        }}>
          <ul style={{
            margin: '0 0 12px',
            padding: 0,
            listStyle: 'none',
          }}>
            {day.exercises.map((ex, i) => (
              <li key={i} style={{
                display: 'flex',
                gap: '10px',
                fontSize: '13px',
                color: theme.textMuted,
                lineHeight: 1.55,
                padding: '6px 0',
                borderBottom: i < day.exercises.length - 1 ? `1px solid ${theme.borderSoft}` : 'none',
              }}>
                <span style={{
                  width: '18px',
                  flexShrink: 0,
                  fontFamily: '"DM Mono", ui-monospace, monospace',
                  fontSize: '11px',
                  color: theme.textFaint,
                  fontWeight: 700,
                }}>
                  {String(i + 1).padStart(2, '0')}
                </span>
                <span>{ex}</span>
              </li>
            ))}
          </ul>

          <div style={{
            marginTop: '4px',
            padding: '10px 12px',
            background: 'rgba(196,153,42,0.05)',
            border: `1px solid rgba(196,153,42,0.2)`,
            borderRadius: '8px',
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
          }}>
            <div style={{
              fontSize: '9px',
              fontFamily: '"DM Mono", ui-monospace, monospace',
              fontWeight: 700,
              color: theme.gold,
              letterSpacing: '0.12em',
              textTransform: 'uppercase',
              whiteSpace: 'nowrap',
            }}>
              Meta
            </div>
            <div style={{
              fontSize: '12.5px',
              color: theme.text,
              fontWeight: 600,
              lineHeight: 1.4,
            }}>
              {day.goalStat}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

/* ─────────────────────────────────────────────────────────────────────── */
/* ── Main page ──────────────────────────────────────────────────────── */
/* ─────────────────────────────────────────────────────────────────────── */

export default function TaigerDemoPage() {
  const [analizando, setAnalizando] = useState(true)
  const indiceDelta = INDICE_SERIES[INDICE_SERIES.length - 1] - INDICE_SERIES[0]

  return (
    <div style={{ minHeight: '100vh', background: theme.bg }}>
      {analizando && <AnalizandoOverlay onDone={() => setAnalizando(false)} />}

      <div style={{ maxWidth: '720px', margin: '0 auto', padding: '24px 16px 96px' }}>

        {/* Back link — pill coherente con las cards del hub */}
        <div style={{ marginBottom: '20px' }}>
          <Link
            href="/demo"
            aria-label="Volver al demo de Golfers+"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
              padding: '8px 14px',
              background: theme.card,
              border: `1px solid ${theme.border}`,
              borderRadius: '999px',
              fontSize: '11px',
              color: theme.textMuted,
              fontFamily: '"DM Mono", ui-monospace, monospace',
              letterSpacing: '0.12em',
              textTransform: 'uppercase' as const,
              textDecoration: 'none',
              fontWeight: 700,
              transition: 'border-color 180ms, color 180ms, transform 180ms',
            }}
            onMouseEnter={(e) => {
              const el = e.currentTarget as HTMLAnchorElement
              el.style.borderColor = theme.gold
              el.style.color = theme.gold
              const arrow = el.querySelector('[data-arrow]') as HTMLElement | null
              if (arrow) arrow.style.transform = 'translateX(-2px)'
            }}
            onMouseLeave={(e) => {
              const el = e.currentTarget as HTMLAnchorElement
              el.style.borderColor = theme.border
              el.style.color = theme.textMuted
              const arrow = el.querySelector('[data-arrow]') as HTMLElement | null
              if (arrow) arrow.style.transform = 'translateX(0)'
            }}
          >
            <span
              data-arrow
              aria-hidden="true"
              style={{ fontSize: '14px', lineHeight: 1, transition: 'transform 180ms' }}
            >
              ←
            </span>
            <span>Volver al demo</span>
          </Link>
        </div>

        {/* Hero — eyebrow + title */}
        <div style={{ marginBottom: '24px' }}>
          <div style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '7px',
            fontSize: '10px',
            color: theme.gold,
            fontFamily: '"DM Mono", ui-monospace, monospace',
            letterSpacing: '0.18em',
            textTransform: 'uppercase',
            marginBottom: '10px',
            fontWeight: 700,
          }}>
            <span style={{
              width: '6px', height: '6px', borderRadius: '50%',
              background: theme.gold,
              boxShadow: `0 0 8px ${theme.gold}`,
            }} />
            tAIger+ · coach IA
          </div>
          <h1 style={{
            fontFamily: '"Playfair Display", serif',
            fontSize: 'clamp(28px, 6vw, 38px)',
            fontWeight: 600,
            color: theme.text,
            margin: '0 0 10px',
            lineHeight: 1.1,
            letterSpacing: '-0.02em',
          }}>
            Leí tus últimas {PLAYER.rondasAnalizadas} rondas.<br />
            <span style={{ color: theme.gold }}>Esto es lo que encontré.</span>
          </h1>
          <p style={{
            fontSize: '14px',
            color: theme.textMuted,
            margin: 0,
            lineHeight: 1.6,
            maxWidth: '520px',
          }}>
            Perfil del jugador <strong style={{ color: theme.text }}>{PLAYER.name}</strong>. Todos los datos, patrones y el plan de trabajo abajo son
            reales: lo que tAIger+ va a hacer con tu historial cuando te unas.
          </p>
        </div>

        {/* Scorecard del jugador */}
        <div style={{
          background: theme.navy,
          color: '#ffffff',
          borderRadius: '16px',
          padding: '20px 22px',
          marginBottom: '28px',
          position: 'relative',
          overflow: 'hidden',
        }}>
          {/* Subtle gold accent line */}
          <div style={{
            position: 'absolute',
            top: 0, left: 0, right: 0,
            height: '2px',
            background: `linear-gradient(90deg, transparent 0%, ${theme.gold} 50%, transparent 100%)`,
          }} />

          <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
            {/* Avatar */}
            <div style={{
              width: '56px', height: '56px',
              borderRadius: '50%',
              background: `linear-gradient(135deg, #1e3a8a 0%, ${theme.gold} 100%)`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '18px',
              fontWeight: 700,
              flexShrink: 0,
              border: `1px solid rgba(196,153,42,0.4)`,
            }}>
              CM
            </div>

            <div style={{ flex: 1, minWidth: '140px' }}>
              <div style={{
                fontFamily: '"Playfair Display", serif',
                fontSize: '19px',
                fontWeight: 600,
                letterSpacing: '-0.01em',
              }}>
                {PLAYER.name}
              </div>
              <div style={{
                fontSize: '11px',
                color: 'rgba(255,255,255,0.5)',
                fontFamily: '"DM Mono", ui-monospace, monospace',
                letterSpacing: '0.06em',
                marginTop: '2px',
              }}>
                {PLAYER.club}
              </div>
            </div>

            {/* Sparkline de índice */}
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'flex-end',
              gap: '4px',
            }}>
              <div style={{
                fontSize: '9px',
                color: 'rgba(255,255,255,0.4)',
                fontFamily: '"DM Mono", ui-monospace, monospace',
                letterSpacing: '0.12em',
                textTransform: 'uppercase',
              }}>
                Índice · 10 rondas
              </div>
              <GWISparkline series={INDICE_SERIES} delta={-indiceDelta} width={80} height={22} />
            </div>
          </div>

          {/* Stats row */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3, 1fr)',
            gap: '12px',
            marginTop: '18px',
            paddingTop: '16px',
            borderTop: '1px solid rgba(255,255,255,0.08)',
          }}>
            {[
              { label: 'Índice Golfers+', value: PLAYER.indiceGolfers.toFixed(1), accent: theme.gold },
              { label: 'HCP WHS oficial', value: PLAYER.indiceWHS.toFixed(1), accent: '#ffffff' },
              { label: 'Tendencia',       value: `−${(-indiceDelta).toFixed(1)}`,  accent: '#00e676' },
            ].map(s => (
              <div key={s.label}>
                <div style={{
                  fontSize: '9px',
                  fontFamily: '"DM Mono", ui-monospace, monospace',
                  color: 'rgba(255,255,255,0.4)',
                  letterSpacing: '0.1em',
                  textTransform: 'uppercase',
                  marginBottom: '4px',
                }}>
                  {s.label}
                </div>
                <div style={{
                  fontSize: '22px',
                  fontWeight: 700,
                  color: s.accent,
                  fontFamily: '"DM Mono", ui-monospace, monospace',
                  fontVariantNumeric: 'tabular-nums',
                  letterSpacing: '-0.02em',
                }}>
                  {s.value}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Section header: insights */}
        <div style={{ marginBottom: '14px' }}>
          <div style={{
            fontSize: '10px',
            fontFamily: '"DM Mono", ui-monospace, monospace',
            color: theme.textFaint,
            letterSpacing: '0.14em',
            textTransform: 'uppercase',
            marginBottom: '6px',
            fontWeight: 700,
          }}>
            01 · Patrones detectados
          </div>
          <h2 style={{
            fontFamily: '"Playfair Display", serif',
            fontSize: '22px',
            fontWeight: 600,
            color: theme.text,
            margin: '0 0 4px',
            letterSpacing: '-0.01em',
          }}>
            Lo que tu juego te dice, aunque vos no lo veas.
          </h2>
          <p style={{ fontSize: '13px', color: theme.textMuted, margin: 0 }}>
            4 hallazgos accionables de las últimas 20 rondas. Tocá cada uno para ver la evidencia.
          </p>
        </div>

        {INSIGHTS.map((ins, idx) => (
          <InsightCard key={ins.id} insight={ins} index={idx} />
        ))}

        {/* Section header: plan */}
        <div style={{ marginTop: '36px', marginBottom: '14px' }}>
          <div style={{
            fontSize: '10px',
            fontFamily: '"DM Mono", ui-monospace, monospace',
            color: theme.textFaint,
            letterSpacing: '0.14em',
            textTransform: 'uppercase',
            marginBottom: '6px',
            fontWeight: 700,
          }}>
            02 · Plan de trabajo
          </div>
          <h2 style={{
            fontFamily: '"Playfair Display", serif',
            fontSize: '22px',
            fontWeight: 600,
            color: theme.text,
            margin: '0 0 4px',
            letterSpacing: '-0.01em',
          }}>
            Tu semana, calibrada.
          </h2>
          <p style={{ fontSize: '13px', color: theme.textMuted, margin: 0 }}>
            Tres sesiones concretas, pensadas a partir de tus puntos débiles. Cada una con una meta medible.
          </p>
        </div>

        {PLAN.map((d, idx) => (
          <PlanDayCard key={d.day} day={d} index={idx} />
        ))}

        {/* CTA final */}
        <div style={{
          marginTop: '40px',
          background: `linear-gradient(135deg, ${theme.navy} 0%, #1a2a44 100%)`,
          borderRadius: '16px',
          padding: '28px 24px',
          color: '#ffffff',
          textAlign: 'center',
          position: 'relative',
          overflow: 'hidden',
        }}>
          <div style={{
            position: 'absolute',
            top: 0, left: 0, right: 0, bottom: 0,
            background: `radial-gradient(circle at 80% 20%, ${theme.gold}22 0%, transparent 60%)`,
            pointerEvents: 'none',
          }} />
          <div style={{ position: 'relative' }}>
            <div style={{
              fontSize: '10px',
              fontFamily: '"DM Mono", ui-monospace, monospace',
              color: theme.gold,
              letterSpacing: '0.18em',
              textTransform: 'uppercase',
              marginBottom: '10px',
              fontWeight: 700,
            }}>
              Esto se vuelve tuyo cuando te unís
            </div>
            <div style={{
              fontFamily: '"Playfair Display", serif',
              fontSize: '24px',
              fontWeight: 600,
              marginBottom: '8px',
              letterSpacing: '-0.01em',
              lineHeight: 1.15,
            }}>
              Tu Coach IA, leyendo tus rondas reales.
            </div>
            <p style={{
              fontSize: '13px',
              color: 'rgba(255,255,255,0.65)',
              margin: '0 auto 20px',
              maxWidth: '420px',
              lineHeight: 1.6,
            }}>
              Golfers+ es gratis mientras tu club esté adherido. Sin tarjeta, sin spam — solo tu juego, mejorando ronda tras ronda.
            </p>
            <Link href="/register" style={{
              display: 'inline-block',
              background: theme.gold,
              color: theme.navy,
              fontSize: '14px',
              fontWeight: 700,
              padding: '13px 28px',
              borderRadius: '10px',
              textDecoration: 'none',
              boxShadow: `0 6px 24px ${theme.gold}55`,
              letterSpacing: '0.02em',
            }}>
              Empezar con tAIger+ →
            </Link>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes insightIn {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(6px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  )
}
