'use client'

import { useEffect, useState } from 'react'

/**
 * tAIger+ Hero — entrada cinematica al abrir la seccion coach.
 * Garras animadas que revelan la marca. Fondo con depth.
 */
export function TaigerHero({ subtitle }: { subtitle?: string }) {
  const [mounted, setMounted] = useState(false)
  useEffect(() => { setMounted(true) }, [])

  return (
    <>
      <style>{`
        @keyframes clawReveal {
          0% { transform: scaleY(0) rotate(-8deg); opacity: 0; }
          60% { transform: scaleY(1.05) rotate(-8deg); opacity: 1; }
          100% { transform: scaleY(1) rotate(-8deg); opacity: 1; }
        }
        @keyframes heroGlow {
          0%, 100% { opacity: 0.4; }
          50% { opacity: 0.7; }
        }
        @keyframes brandReveal {
          0% { opacity: 0; transform: translateY(16px) scale(0.95); }
          100% { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes subtleShine {
          0% { left: -60%; }
          100% { left: 160%; }
        }
      `}</style>
      <div style={{
        position: 'relative',
        borderRadius: 20,
        overflow: 'hidden',
        background: 'linear-gradient(160deg, #0d1a2d 0%, #0a1628 40%, #111827 100%)',
        border: '1px solid rgba(196,153,42,0.12)',
        padding: '40px 24px 36px',
        marginBottom: 28,
      }}>
        {/* Background glow */}
        <div style={{
          position: 'absolute',
          top: '30%', left: '50%',
          width: 200, height: 200,
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(196,153,42,0.15) 0%, transparent 70%)',
          transform: 'translate(-50%, -50%)',
          animation: mounted ? 'heroGlow 4s ease-in-out infinite' : 'none',
          pointerEvents: 'none',
        }} />

        {/* Claw marks — 3 dramatic slashes */}
        <div style={{
          display: 'flex', justifyContent: 'center', gap: 10,
          marginBottom: 24, height: 56,
          position: 'relative', zIndex: 1,
        }}>
          {[0, 1, 2].map(i => (
            <div
              key={i}
              style={{
                width: 6,
                height: '100%',
                borderRadius: 3,
                background: `linear-gradient(180deg, #c4992a ${40 + i * 10}%, #e8c06a 100%)`,
                transformOrigin: 'top center',
                animation: mounted ? `clawReveal 0.5s cubic-bezier(0.34, 1.56, 0.64, 1) ${0.15 + i * 0.1}s both` : 'none',
                boxShadow: '0 0 12px rgba(196,153,42,0.3)',
              }}
            />
          ))}
        </div>

        {/* Brand name */}
        <div style={{
          position: 'relative', zIndex: 1,
          textAlign: 'center',
          animation: mounted ? 'brandReveal 0.6s ease-out 0.6s both' : 'none',
        }}>
          <h2 style={{
            fontFamily: "'Playfair Display', serif",
            fontSize: 28, fontWeight: 700, letterSpacing: '2px',
            color: '#edeae4', margin: 0,
            position: 'relative', display: 'inline-block',
            overflow: 'hidden',
          }}>
            tAIger+
            {/* Shine sweep */}
            <span style={{
              position: 'absolute', top: 0, left: '-60%',
              width: '40%', height: '100%',
              background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.15), transparent)',
              animation: mounted ? 'subtleShine 2s ease-in-out 1.2s' : 'none',
              pointerEvents: 'none',
            }} />
          </h2>

          {subtitle && (
            <p style={{
              color: '#94a8c0', fontSize: 13, margin: '8px 0 0',
              letterSpacing: '0.5px',
            }}>
              {subtitle}
            </p>
          )}
        </div>

        {/* Bottom accent line */}
        <div style={{
          position: 'absolute', bottom: 0, left: '10%', right: '10%',
          height: 2,
          background: 'linear-gradient(90deg, transparent, rgba(196,153,42,0.4), transparent)',
          borderRadius: 1,
        }} />
      </div>
    </>
  )
}
