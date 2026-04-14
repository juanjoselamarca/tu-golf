'use client'

import { useEffect, useState } from 'react'
import Image from 'next/image'

/**
 * tAIger+ Hero — tiger coach portrait con entrada cinematica.
 * Usa la imagen real del tigre-coach con animaciones premium.
 */
export function TaigerHero({ subtitle }: { subtitle?: string }) {
  const [mounted, setMounted] = useState(false)
  useEffect(() => { setMounted(true) }, [])

  return (
    <>
      <style>{`
        @keyframes heroReveal {
          0% { opacity: 0; transform: scale(1.08); }
          100% { opacity: 1; transform: scale(1); }
        }
        @keyframes textSlideUp {
          0% { opacity: 0; transform: translateY(20px); }
          100% { opacity: 1; transform: translateY(0); }
        }
        @keyframes glowPulse {
          0%, 100% { box-shadow: 0 0 30px rgba(196,153,42,0.08), inset 0 0 30px rgba(196,153,42,0.03); }
          50% { box-shadow: 0 0 50px rgba(196,153,42,0.15), inset 0 0 40px rgba(196,153,42,0.06); }
        }
        @keyframes shimmer {
          0% { left: -100%; }
          100% { left: 200%; }
        }
      `}</style>
      <div style={{
        position: 'relative',
        borderRadius: 20,
        overflow: 'hidden',
        background: '#0a1219',
        marginBottom: 28,
        animation: mounted ? 'glowPulse 5s ease-in-out infinite' : 'none',
        border: '1px solid rgba(196,153,42,0.1)',
      }}>
        {/* Tiger portrait — left half of the dual image (coach with glasses) */}
        <div style={{
          position: 'relative',
          width: '100%',
          height: 220,
          overflow: 'hidden',
          animation: mounted ? 'heroReveal 1s ease-out 0.1s both' : 'none',
        }}>
          <Image
            src="/images/taiger/tiger-coaches.png"
            alt="tAIger+ Coach"
            fill
            style={{
              objectFit: 'cover',
              objectPosition: '12% 15%',
            }}
            sizes="(max-width: 640px) 100vw, 640px"
            priority
          />
          {/* Gradient overlay bottom — blends image into content */}
          <div style={{
            position: 'absolute', bottom: 0, left: 0, right: 0,
            height: '60%',
            background: 'linear-gradient(to top, #0a1219 0%, rgba(10,18,25,0.7) 40%, transparent 100%)',
            pointerEvents: 'none',
          }} />
          {/* Shimmer effect */}
          <div style={{
            position: 'absolute', inset: 0,
            overflow: 'hidden',
            pointerEvents: 'none',
          }}>
            <div style={{
              position: 'absolute',
              top: 0, left: '-100%',
              width: '50%', height: '100%',
              background: 'linear-gradient(90deg, transparent, rgba(196,153,42,0.06), transparent)',
              animation: mounted ? 'shimmer 3s ease-in-out 1.5s' : 'none',
            }} />
          </div>
        </div>

        {/* Brand text — overlaps the gradient */}
        <div style={{
          position: 'relative',
          marginTop: -48,
          padding: '0 24px 24px',
          zIndex: 2,
        }}>
          <h2 style={{
            fontFamily: "'Playfair Display', serif",
            fontSize: 28,
            fontWeight: 700,
            letterSpacing: '1px',
            color: '#edeae4',
            margin: 0,
            animation: mounted ? 'textSlideUp 0.7s ease-out 0.5s both' : 'none',
          }}>
            tAIger+
          </h2>
          {subtitle && (
            <p style={{
              color: '#94a8c0',
              fontSize: 13,
              margin: '6px 0 0',
              animation: mounted ? 'textSlideUp 0.7s ease-out 0.7s both' : 'none',
            }}>
              {subtitle}
            </p>
          )}
        </div>
      </div>
    </>
  )
}
