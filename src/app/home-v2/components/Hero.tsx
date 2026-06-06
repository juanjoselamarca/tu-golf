'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { HOME } from '@/content/home'

const SLIDES = ['s1', 's2', 's3', 's4'] as const
const Arrow = () => (
  <svg className="ar" viewBox="0 0 24 24"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
)

export default function Hero() {
  const [current, setCurrent] = useState(0)

  useEffect(() => {
    const t = setInterval(() => setCurrent(p => (p + 1) % SLIDES.length), 6000)
    return () => clearInterval(t)
  }, [])

  const h = HOME.hero

  return (
    <section className="hero">
      <div className="bgs">
        {SLIDES.map((s, i) => (
          <div key={s} className={`s ${s} ${i === current ? 'on' : ''}`} />
        ))}
      </div>
      <div className="navy" />
      <div className="glow" />
      <div className="grain" />
      <div className="fade" />

      <div className="inner">
        <span className="eyebrow"><span className="d" />{h.eyebrow}</span>
        <h1 className="display">
          <span className="a">{h.titleLine1}</span>
          <span className="b">{h.titleLine2}</span>
        </h1>
        <p className="sub">{h.subtitle}</p>
        <div className="hcta">
          <Link className="commit" href="/register">
            {h.ctaPrimary}<span className="c"><Arrow /></span>
          </Link>
          <a className="ghost" href="#game">{h.ctaSecondary} ↓</a>
        </div>
        <p className="trust">{h.trustLine1}</p>
        <p className="trust" style={{ marginTop: 8, color: 'var(--gold-ant)' }}>{h.trustLine2}</p>
      </div>

      <div className="dots">
        {SLIDES.map((s, i) => (
          <button
            key={s}
            className={i === current ? 'on' : ''}
            onClick={() => setCurrent(i)}
            aria-label={`Imagen ${i + 1}`}
          />
        ))}
      </div>
    </section>
  )
}
