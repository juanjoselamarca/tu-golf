'use client'

import { useState, useEffect, useRef } from 'react'

interface Stat {
  end:     number
  suffix:  string
  label:   string
  /** Override display once count reaches end (e.g. "10.000+") */
  finalDisplay?: string
}

const STATS: Stat[] = [
  { end: 500,   suffix: '+', label: 'Torneos realizados'  },
  { end: 10000, suffix: '+', label: 'Jugadores registrados', finalDisplay: '10.000+' },
  { end: 100,   suffix: '%', label: 'Gratis para siempre' },
]

function useCountUp(end: number, durationMs: number, active: boolean) {
  const [count, setCount] = useState(0)

  useEffect(() => {
    if (!active) return
    let raf: number
    const startTime = performance.now()

    const tick = (now: number) => {
      const elapsed  = now - startTime
      const progress = Math.min(elapsed / durationMs, 1)
      // Ease-out cubic
      const eased = 1 - Math.pow(1 - progress, 3)
      setCount(Math.floor(eased * end))
      if (progress < 1) raf = requestAnimationFrame(tick)
      else              setCount(end)
    }

    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [active, end, durationMs])

  return count
}

function StatItem({ stat, active }: { stat: Stat; active: boolean }) {
  const count = useCountUp(stat.end, 2000, active)
  const done  = count >= stat.end

  const display = done && stat.finalDisplay
    ? stat.finalDisplay
    : `${count.toLocaleString('es-CL')}${stat.suffix}`

  return (
    <div className={`flex flex-col items-center text-center ${active ? 'count-enter' : 'opacity-0'}`}>
      <div
        className="text-5xl lg:text-6xl font-display font-black text-gold mb-3 tabular-nums"
      >
        {display}
      </div>
      <div className="text-sm font-sans text-gray-soft uppercase tracking-wider font-medium">
        {stat.label}
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
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-12">
          {STATS.map((stat) => (
            <StatItem key={stat.label} stat={stat} active={active} />
          ))}
        </div>
      </div>
      <div className="gold-divider" />
    </section>
  )
}
