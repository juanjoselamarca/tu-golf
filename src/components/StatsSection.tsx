'use client'

import { useState, useEffect, useRef } from 'react'

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

interface StatCardProps {
  value: string | number
  label: string
  sublabel?: string
  active: boolean
  animate?: boolean
}

function StatCard({ value, label, sublabel, active, animate }: StatCardProps) {
  const numValue = typeof value === 'number' ? value : 0
  const count = useCountUp(numValue, 2000, active && animate === true)
  const displayValue = typeof value === 'number' ? `${count.toLocaleString('es-CL')}+` : value

  return (
    <div className={`flex flex-col items-center text-center ${active ? 'count-enter' : 'opacity-0'}`}>
      <div className="text-5xl lg:text-6xl font-display font-black text-gold mb-3 tabular-nums">
        {animate ? displayValue : value}
      </div>
      <div className="text-sm font-sans text-gray-soft uppercase tracking-wider font-medium">
        {label}
      </div>
      {sublabel && (
        <div className="text-xs font-sans text-gray-soft/60 mt-1">
          {sublabel}
        </div>
      )}
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
          <StatCard value={244} label="Rondas analizadas" active={active} animate />
          <div className={`flex flex-col items-center text-center ${active ? 'count-enter' : 'opacity-0'}`}>
            <div className="text-4xl lg:text-5xl font-display font-black text-gold mb-3">
              tAIger+
            </div>
            <div className="text-sm font-sans text-gray-soft uppercase tracking-wider font-medium">
              Coach IA · Psicología · Predicción
            </div>
          </div>
          <StatCard value="40+" label="Canchas disponibles" active={active} />
        </div>
      </div>
      <div className="gold-divider" />
    </section>
  )
}
