'use client'

import { useEffect, useState, useCallback } from 'react'
import Image from 'next/image'

const SLIDES = [
  { src: '/images/taiger/taiger-domingo.png', pos: '50% 10%', label: 'Coach' },
  { src: '/images/taiger/tiger-otros.png', pos: '12% 15%', label: 'Analyst' },
  { src: '/images/taiger/taiger-zen.png', pos: '50% 15%', label: 'Mental' },
  { src: '/images/taiger/tager-swing.png', pos: '50% 10%', label: 'Swing' },
  { src: '/images/taiger/tiger-standar.png', pos: '50% 8%', label: 'Pro' },
]

const INTERVAL = 5000

export function TaigerHero({ subtitle }: { subtitle?: string }) {
  const [mounted, setMounted] = useState(false)
  const [current, setCurrent] = useState(0)

  useEffect(() => { setMounted(true) }, [])

  const advance = useCallback(() => {
    setCurrent(prev => (prev + 1) % SLIDES.length)
  }, [])

  useEffect(() => {
    if (!mounted) return
    const timer = setInterval(advance, INTERVAL)
    return () => clearInterval(timer)
  }, [mounted, advance])

  return (
    <>
      <style>{`
        @keyframes heroEntry {
          0% { opacity: 0; transform: scale(1.06); }
          100% { opacity: 1; transform: scale(1); }
        }
        @keyframes textUp {
          0% { opacity: 0; transform: translateY(16px); }
          100% { opacity: 1; transform: translateY(0); }
        }
        @keyframes glowBreath {
          0%, 100% { box-shadow: 0 0 24px rgba(196,153,42,0.06); }
          50% { box-shadow: 0 0 48px rgba(196,153,42,0.14); }
        }
      `}</style>
      <div style={{
        position: 'relative',
        borderRadius: 20,
        overflow: 'hidden',
        background: '#0a1219',
        marginBottom: 28,
        border: '1px solid rgba(196,153,42,0.1)',
        animation: mounted ? 'glowBreath 6s ease-in-out infinite' : 'none',
      }}>
        {/* Image carousel — crossfade */}
        <div style={{
          position: 'relative',
          width: '100%',
          height: 240,
          overflow: 'hidden',
          animation: mounted ? 'heroEntry 0.8s ease-out both' : 'none',
        }}>
          {SLIDES.map((slide, i) => (
            <div
              key={slide.src}
              style={{
                position: 'absolute', inset: 0,
                opacity: i === current ? 1 : 0,
                transition: 'opacity 1.2s ease-in-out',
              }}
            >
              <Image
                src={slide.src}
                alt={`tAIger+ ${slide.label}`}
                fill
                style={{
                  objectFit: 'cover',
                  objectPosition: slide.pos,
                }}
                sizes="(max-width: 640px) 100vw, 640px"
                priority={i === 0}
              />
            </div>
          ))}

          {/* Gradient overlay */}
          <div style={{
            position: 'absolute', bottom: 0, left: 0, right: 0,
            height: '65%',
            background: 'linear-gradient(to top, #0a1219 0%, rgba(10,18,25,0.8) 35%, transparent 100%)',
            pointerEvents: 'none',
            zIndex: 1,
          }} />
        </div>

        {/* Brand + dots */}
        <div style={{
          position: 'relative',
          marginTop: -56,
          padding: '0 24px 20px',
          zIndex: 2,
        }}>
          <h2 style={{
            fontFamily: "'Playfair Display', serif",
            fontSize: 28, fontWeight: 700, letterSpacing: '1px',
            color: 'var(--text)', margin: 0,
            animation: mounted ? 'textUp 0.6s ease-out 0.4s both' : 'none',
          }}>
            tAIger+
          </h2>
          {subtitle && (
            <p style={{
              color: 'var(--text-2)', fontSize: 13, margin: '6px 0 0',
              animation: mounted ? 'textUp 0.6s ease-out 0.6s both' : 'none',
            }}>
              {subtitle}
            </p>
          )}

          {/* Slide indicators */}
          <div style={{
            display: 'flex', gap: 6, marginTop: 14,
            animation: mounted ? 'textUp 0.6s ease-out 0.8s both' : 'none',
          }}>
            {SLIDES.map((_, i) => (
              <button
                key={i}
                onClick={() => setCurrent(i)}
                style={{
                  width: i === current ? 20 : 6, height: 6,
                  borderRadius: 3, border: 'none', cursor: 'pointer',
                  background: i === current ? '#c4992a' : 'rgba(196,153,42,0.25)',
                  transition: 'all 0.4s ease',
                  padding: 0,
                }}
              />
            ))}
          </div>
        </div>
      </div>
    </>
  )
}
