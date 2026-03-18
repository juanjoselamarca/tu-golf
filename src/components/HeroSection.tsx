/* eslint-disable @next/next/no-img-element */
'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import PGALiveWidget from '@/components/PGALiveWidget'

const IMAGES = [
  'https://images.unsplash.com/photo-1587174486073-ae5e5cff23aa?w=1920&q=80',
  'https://images.unsplash.com/photo-1535131749006-b7f58c99034b?w=1920&q=80',
  'https://images.unsplash.com/photo-1592919505780-303950717480?w=1920&q=80',
  'https://images.unsplash.com/photo-1611374243147-44a702c2d44c?w=1920&q=80',
]

export default function HeroSection() {
  const [current, setCurrent] = useState(0)

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrent((prev) => (prev + 1) % IMAGES.length)
    }, 6000)
    return () => clearInterval(timer)
  }, [])

  return (
    <section className="relative min-h-screen flex items-center overflow-hidden">

      {/* ── Slideshow background ─────────────────────────── */}
      {IMAGES.map((src, i) => (
        <div
          key={src}
          className="absolute inset-0 transition-opacity duration-2000 ease-in-out"
          style={{ opacity: i === current ? 1 : 0 }}
        >
          <img src={src} alt="" className="w-full h-full object-cover" />
        </div>
      ))}

      {/* ── Gradient overlay ─────────────────────────────── */}
      <div
        className="absolute inset-0 z-10"
        style={{
          background:
            'linear-gradient(to bottom, rgba(7,13,24,0.25) 0%, rgba(7,13,24,0.65) 50%, rgba(7,13,24,0.95) 85%, rgba(7,13,24,1) 100%)',
        }}
      />

      {/* ── Dot indicators ───────────────────────────────── */}
      <div className="absolute bottom-8 left-1/2 -translate-x-1/2 z-20 flex gap-2">
        {IMAGES.map((_, i) => (
          <button
            key={i}
            onClick={() => setCurrent(i)}
            className="transition-all duration-300"
            style={{
              width:           i === current ? '24px' : '6px',
              height:          '6px',
              borderRadius:    '3px',
              background:      i === current ? '#c4992a' : 'rgba(196,153,42,0.35)',
            }}
            aria-label={`Imagen ${i + 1}`}
          />
        ))}
      </div>

      {/* ── Content ──────────────────────────────────────── */}
      <div className="relative z-20 w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-24 lg:py-32">
        <div className="flex flex-col lg:grid lg:grid-cols-5 gap-12 lg:gap-16 items-center">

          {/* Left — text + CTAs ─────────────────────────── */}
          <div className="lg:col-span-3">

            {/* Badge */}
            <div
              className="inline-flex items-center gap-2 px-4 py-2 mb-6 text-sm font-sans rounded-sm"
              style={{
                border:     '1px solid rgba(196,153,42,0.55)',
                background: 'rgba(196,153,42,0.09)',
                color:      '#e8c06a',
              }}
            >
              Golfers+ · Datos + Mente + Resultados
            </div>

            {/* H1 */}
            <h1 className="font-display font-black leading-[1.05] mb-6 text-[42px] lg:text-[72px]">
              <span className="text-ivory block">Tu golf,</span>
              <span className="text-gold">potenciado por IA</span>
            </h1>

            {/* Subtitle */}
            <p className="font-sans text-lg text-ivory/75 mb-10 leading-relaxed max-w-lg">
              La única plataforma en español que convierte tus datos de golf en trabajo mental específico para bajar tu score. Scoring en vivo, análisis estadístico y el tAIger, tu coach de rendimiento.
            </p>

            {/* Buttons */}
            <div className="flex flex-col sm:flex-row gap-4">
              <Link
                href="/register"
                className="inline-flex items-center justify-center gap-2 font-sans font-semibold text-base px-8 py-4 transition-all duration-200 hover:brightness-110 active:scale-95"
                style={{ background: '#c4992a', color: '#070d18', borderRadius: '4px' }}
              >
                Comenzar gratis →
              </Link>
              <Link
                href="/leaderboard"
                className="inline-flex items-center justify-center gap-2 font-sans font-semibold text-base px-8 py-4 transition-all duration-200 hover:bg-gold/10 active:scale-95"
                style={{ border: '1px solid #c4992a', color: '#c4992a', borderRadius: '4px' }}
              >
                Ver demo leaderboard
              </Link>
            </div>
          </div>

          {/* Right — PGA widget, visible on ALL sizes ──── */}
          <div className="w-full lg:col-span-2 flex items-center justify-center">
            <div style={{ width: '100%', maxWidth: 680 }}>
              <PGALiveWidget />
            </div>
          </div>

        </div>
      </div>
    </section>
  )
}
