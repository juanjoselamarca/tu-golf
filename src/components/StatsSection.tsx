'use client'

import { useState, useEffect, useRef } from 'react'

interface Props {
  torneos:   number
  golfistas: number
}

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

function StatItem({ end, label, active }: { end: number; label: string; active: boolean }) {
  const count = useCountUp(end, 2000, active)

  return (
    <div className={`flex flex-col items-center text-center ${active ? 'count-enter' : 'opacity-0'}`}>
      <div className="text-5xl lg:text-6xl font-display font-black text-gold mb-3 tabular-nums">
        {count.toLocaleString('es-CL')}+
      </div>
      <div className="text-sm font-sans text-gray-soft uppercase tracking-wider font-medium">
        {label}
      </div>
    </div>
  )
}

export default function StatsSection({ torneos, golfistas }: Props) {
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
          <StatItem end={torneos}   label="Torneos organizados"  active={active} />
          <StatItem end={golfistas} label="Golfistas registrados" active={active} />
          <div className={`flex flex-col items-center text-center ${active ? 'count-enter' : 'opacity-0'}`}>
            <div className="text-5xl lg:text-6xl font-display font-black text-gold mb-3">
              $0
            </div>
            <div className="text-sm font-sans text-gray-soft uppercase tracking-wider font-medium">
              Siempre gratis
            </div>
          </div>
        </div>
      </div>
      <div className="gold-divider" />
    </section>
  )
}
