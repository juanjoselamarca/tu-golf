'use client'

import { useEffect, useState } from 'react'

/**
 * tAIger+ Hero — animacion premium al entrar a la seccion coach.
 * Gradientes amber/gold con rayas tiger abstractas.
 * Breathing effect + entrada staggered.
 */
export function TaigerHero({ subtitle }: { subtitle?: string }) {
  const [mounted, setMounted] = useState(false)
  useEffect(() => { setMounted(true) }, [])

  return (
    <>
      <style>{`
        @keyframes taigerBreathe {
          0%, 100% { transform: scale(1); opacity: 0.9; }
          50% { transform: scale(1.02); opacity: 1; }
        }
        @keyframes taigerStripeSlide {
          0% { transform: translateX(-100%) skewX(-15deg); }
          100% { transform: translateX(0) skewX(-15deg); }
        }
        @keyframes taigerFadeUp {
          0% { opacity: 0; transform: translateY(12px); }
          100% { opacity: 1; transform: translateY(0); }
        }
        @keyframes taigerGlow {
          0%, 100% { box-shadow: 0 0 20px rgba(196,153,42,0.1); }
          50% { box-shadow: 0 0 40px rgba(196,153,42,0.2); }
        }
      `}</style>
      <div style={{
        position: 'relative',
        borderRadius: 16,
        overflow: 'hidden',
        background: 'linear-gradient(135deg, rgba(196,153,42,0.08) 0%, rgba(196,153,42,0.02) 100%)',
        border: '1px solid rgba(196,153,42,0.15)',
        padding: '32px 24px',
        marginBottom: 24,
        animation: mounted ? 'taigerGlow 4s ease-in-out infinite' : 'none',
      }}>
        {/* Tiger stripes — abstract diagonal lines */}
        <div style={{
          position: 'absolute', inset: 0, overflow: 'hidden', opacity: 0.06,
          pointerEvents: 'none',
        }}>
          {[0, 1, 2, 3, 4].map(i => (
            <div key={i} style={{
              position: 'absolute',
              top: 0, bottom: 0,
              left: `${15 + i * 18}%`,
              width: '8%',
              background: '#c4992a',
              transform: 'skewX(-15deg)',
              animation: mounted ? `taigerStripeSlide 0.6s ease-out ${0.1 + i * 0.08}s both` : 'none',
            }} />
          ))}
        </div>

        {/* Content */}
        <div style={{
          position: 'relative', zIndex: 1,
          display: 'flex', flexDirection: 'column', alignItems: 'center',
          animation: mounted ? 'taigerFadeUp 0.5s ease-out 0.2s both' : 'none',
        }}>
          {/* Monogram large */}
          <div style={{
            width: 64, height: 64,
            borderRadius: 16,
            background: 'linear-gradient(135deg, #c4992a, #e8c06a)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            marginBottom: 16,
            animation: mounted ? 'taigerBreathe 3s ease-in-out infinite' : 'none',
            boxShadow: '0 4px 16px rgba(196,153,42,0.3)',
          }}>
            <span style={{
              fontFamily: "'DM Sans', sans-serif",
              fontSize: 32, fontWeight: 800,
              color: '#070d18', letterSpacing: '-1px',
            }}>T</span>
          </div>

          {/* Brand name */}
          <h2 style={{
            fontFamily: "'Playfair Display', serif",
            fontSize: 24, fontWeight: 700,
            color: '#edeae4', margin: 0,
            animation: mounted ? 'taigerFadeUp 0.5s ease-out 0.35s both' : 'none',
          }}>
            tAIger+
          </h2>

          {/* Subtitle */}
          {subtitle && (
            <p style={{
              color: '#94a8c0', fontSize: 14, margin: '6px 0 0',
              animation: mounted ? 'taigerFadeUp 0.5s ease-out 0.45s both' : 'none',
            }}>
              {subtitle}
            </p>
          )}
        </div>
      </div>
    </>
  )
}
