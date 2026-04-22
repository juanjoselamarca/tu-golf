'use client'

import { useState, useEffect, useRef } from 'react'

/**
 * Count-up animation from 0 to `end` over `durationMs`, activated by `active`.
 * Cubic ease-out for a premium, non-linear feel.
 */
function useCountUp(end: number, durationMs: number, active: boolean) {
  const [count, setCount] = useState(0)

  useEffect(() => {
    if (!active) return
    let raf: number
    const startTime = performance.now()

    const tick = (now: number) => {
      const elapsed  = now - startTime
      const progress = Math.min(elapsed / durationMs, 1)
      const eased    = 1 - Math.pow(1 - progress, 3)
      setCount(Math.floor(eased * end))
      if (progress < 1) raf = requestAnimationFrame(tick)
      else              setCount(end)
    }

    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [active, end, durationMs])

  return count
}

/* ──────────────────────────────────────────────────────────────────────
   HeroStat — métrica principal (47+ canchas).
   Serif display grande, número dorado 2x vs. cards soporte (P16 del audit).
   Número ≈ 96-128px, label descriptivo serif, sublabel mono pequeño.
   ──────────────────────────────────────────────────────────────────── */
interface HeroStatProps {
  value: number
  suffix?: string
  headline: string
  sublabel: string
  active: boolean
}

function HeroStat({ value, suffix = '+', headline, sublabel, active }: HeroStatProps) {
  const count = useCountUp(value, 2200, active)
  const display = `${count.toLocaleString('es-CL')}${suffix}`

  return (
    <div
      className={`flex flex-col items-center text-center ${active ? 'count-enter' : 'opacity-0'}`}
      style={{ transition: 'opacity 400ms ease' }}
    >
      <div
        className="font-display font-black text-gold tabular-nums leading-none"
        style={{
          fontSize: 'clamp(72px, 14vw, 128px)',
          letterSpacing: '-0.02em',
          textShadow: '0 0 40px rgba(196,153,42,0.15)',
        }}
      >
        {display}
      </div>
      <div
        className="font-display font-semibold text-ivory mt-4"
        style={{
          fontSize: 'clamp(18px, 2.4vw, 26px)',
          letterSpacing: '-0.01em',
          lineHeight: 1.25,
          maxWidth: '28ch',
        }}
      >
        {headline}
      </div>
      <div
        className="font-sans text-gray-soft/70 mt-2 uppercase"
        style={{
          fontSize: '11px',
          letterSpacing: '0.18em',
        }}
      >
        {sublabel}
      </div>
    </div>
  )
}

/* ──────────────────────────────────────────────────────────────────────
   SupportStat — métricas secundarias. Número serif ~40-48px, deliberadamente
   más chico que el hero (ratio ~1:2.5) para que el hero domine la jerarquía.
   ──────────────────────────────────────────────────────────────────── */
interface SupportStatProps {
  value: string | number
  label: string
  active: boolean
  animate?: boolean
}

function SupportStat({ value, label, active, animate }: SupportStatProps) {
  const numValue = typeof value === 'number' ? value : 0
  const count = useCountUp(numValue, 1800, active && animate === true)
  const display = typeof value === 'number' ? `${count.toLocaleString('es-CL')}+` : value

  return (
    <div className={`flex flex-col items-center text-center ${active ? 'count-enter' : 'opacity-0'}`}>
      <div
        className="font-display font-bold text-ivory tabular-nums leading-none"
        style={{ fontSize: 'clamp(32px, 4.5vw, 48px)', letterSpacing: '-0.01em' }}
      >
        {animate ? display : value}
      </div>
      <div
        className="font-sans text-gray-soft mt-3 uppercase"
        style={{ fontSize: '10px', letterSpacing: '0.16em', fontWeight: 500 }}
      >
        {label}
      </div>
    </div>
  )
}

export default function StatsSection() {
  const [active, setActive] = useState(false)
  const ref = useRef<HTMLElement>(null)

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setActive(true)
          observer.disconnect()
        }
      },
      { threshold: 0.1 },
    )
    if (ref.current) observer.observe(ref.current)
    return () => observer.disconnect()
  }, [])

  return (
    <section ref={ref} className="bg-bg-card">
      <div className="gold-divider" />
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20 md:py-28">

        {/* ── Hero stat — 47+ canchas chilenas con rating oficial ──────── */}
        <HeroStat
          value={47}
          headline="canchas chilenas con rating oficial"
          sublabel="Federación Chilena de Golf"
          active={active}
        />

        {/* ── Hairline divider antes del soporte ──────────────────────── */}
        <div
          className="mx-auto mt-14 md:mt-20"
          style={{
            width: '80px',
            height: '1px',
            background: 'linear-gradient(to right, transparent, rgba(196,153,42,0.4), transparent)',
          }}
        />

        {/* ── Support stats (3 métricas secundarias) ───────────────────── */}
        <div className="grid grid-cols-3 gap-6 md:gap-10 mt-10 md:mt-12 max-w-3xl mx-auto">
          <SupportStat value={864} label="Hoyos mapeados" active={active} animate />
          <SupportStat value={244} label="Rondas registradas" active={active} animate />
          <SupportStat value="100%" label="Gratis" active={active} />
        </div>
      </div>
      <div className="gold-divider" />
    </section>
  )
}
