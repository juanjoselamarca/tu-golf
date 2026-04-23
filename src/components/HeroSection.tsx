/* eslint-disable @next/next/no-img-element */
'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import PGALiveWidget from '@/components/PGALiveWidget'

const IMAGES = [
  'https://images.unsplash.com/photo-1587174486073-ae5e5cff23aa?w=1200&q=75',
  'https://images.unsplash.com/photo-1535131749006-b7f58c99034b?w=1200&q=75',
  'https://images.unsplash.com/photo-1592919505780-303950717480?w=1200&q=75',
  'https://images.unsplash.com/photo-1611374243147-44a702c2d44c?w=1200&q=75',
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
    <section className="relative md:min-h-screen md:flex md:items-center overflow-hidden">

      {/*
        ── Slideshow ──────────────────────────────────────
        Mobile: banner superior con aspect fijo 4/3 → la imagen se ve completa,
          sin el "zoom extremo" que generaba `object-cover` + min-h-[85vh]
          (contenido alto del hero apilado estiraba el fondo verticalmente).
        Desktop (md+): fondo full-bleed absolute detrás del contenido, como antes.
      */}
      <div className="relative w-full aspect-[4/3] md:absolute md:inset-0 md:aspect-auto md:h-full md:w-full">
        {IMAGES.map((src, i) => (
          <div
            key={src}
            className="absolute inset-0 transition-opacity duration-2000 ease-in-out"
            style={{ opacity: i === current ? 1 : 0 }}
          >
            <img
              src={src}
              alt=""
              className="w-full h-full object-cover"
              loading={i === 0 ? 'eager' : 'lazy'}
              fetchPriority={i === 0 ? 'high' : 'auto'}
              decoding="async"
            />
          </div>
        ))}

        {/* Gradient overlay — DESKTOP (md+): full overlay para que el texto
            superpuesto sea legible sobre la imagen. MOBILE: el texto vive
            debajo del banner, así que solo aplicamos un fade suave en el
            borde inferior para blend con la sección de contenido. */}
        <div
          className="absolute inset-0 z-10 hidden md:block"
          style={{
            background:
              'linear-gradient(to bottom, rgba(7,13,24,0.25) 0%, rgba(7,13,24,0.65) 55%, rgba(7,13,24,0.95) 88%, rgba(7,13,24,1) 100%)',
          }}
        />
        <div
          className="absolute inset-x-0 bottom-0 h-24 z-10 md:hidden pointer-events-none"
          style={{
            background:
              'linear-gradient(to bottom, rgba(7,13,24,0) 0%, rgba(7,13,24,0.6) 60%, rgba(7,13,24,1) 100%)',
          }}
        />

        {/* Dot indicators — al pie del banner en mobile, al pie de la sección en desktop. */}
        <div className="absolute bottom-3 md:bottom-8 left-1/2 -translate-x-1/2 z-20 flex gap-2">
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
      </div>

      {/* ── Content ──────────────────────────────────────── */}
      <div className="relative z-20 w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 md:py-24 lg:py-32">
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
              Golfers+ · El golf amateur en español · Chile y LatAm
            </div>

            {/* H1 */}
            <h1 className="font-display font-black leading-[1.05] mb-6 text-[36px] sm:text-[42px] lg:text-[72px]">
              <span className="text-ivory block">Tu mejor golf,</span>
              <span className="text-gold">empieza con los datos</span>
            </h1>

            {/* Subtitle */}
            <p className="font-sans text-lg text-ivory/75 mb-10 leading-relaxed max-w-lg">
              Scoring en vivo, análisis con IA y coaching mental — todo lo que necesitas para bajar tu índice, en español.
            </p>

            {/* Buttons */}
            <div className="flex flex-col sm:flex-row gap-4">
              <Link
                href="/register"
                className="inline-flex items-center justify-center gap-2 font-sans font-bold text-lg px-10 py-4 transition-all duration-200 hover:brightness-110 active:scale-95 shadow-lg"
                style={{ background: '#c4992a', color: '#070d18', borderRadius: '10px' }}
              >
                Crear cuenta gratis
              </Link>
              <Link
                href="/demo"
                className="inline-flex items-center justify-center gap-2 font-sans font-semibold text-base px-8 py-4 transition-all duration-200 hover:bg-gold/10 active:scale-95"
                style={{ border: '1px solid #c4992a', color: '#c4992a', borderRadius: '10px' }}
              >
                Ver demo
              </Link>
            </div>

            {/* Trust badge */}
            <p className="mt-5 font-sans text-xs text-ivory/45 tracking-wide">
              Sin tarjeta &middot; Sin descarga &middot; En español
            </p>
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
