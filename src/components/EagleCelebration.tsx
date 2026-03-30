'use client'

import { useEffect, useState, useCallback } from 'react'

interface Props {
  playerName: string
  holeNumber: number
  onClose: () => void
}

/**
 * Celebración de eagle.
 * Confeti azul/dorado (20 partículas) + badge + texto animado.
 * Auto-close 2.5s. Más impactante que birdie, menos que hole-in-one.
 */
export default function EagleCelebration({ playerName, holeNumber, onClose }: Props) {
  const [visible, setVisible] = useState(false)
  const [particles] = useState(() =>
    Array.from({ length: 20 }, (_, i) => ({
      id: i,
      left: Math.random() * 100,
      size: 4 + Math.random() * 8,
      delay: Math.random() * 0.8,
      duration: 1.5 + Math.random() * 1.5,
      color: ['#c4992a', '#fbbf24', '#3b82f6', '#60a5fa', '#ffffff'][Math.floor(Math.random() * 5)],
      isCircle: Math.random() > 0.3,
    }))
  )

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape') onClose()
  }, [onClose])

  useEffect(() => {
    requestAnimationFrame(() => setVisible(true))
    document.addEventListener('keydown', handleKeyDown)
    const timer = setTimeout(() => {
      setVisible(false)
      setTimeout(onClose, 300)
    }, 2500)
    return () => { clearTimeout(timer); document.removeEventListener('keydown', handleKeyDown) }
  }, [onClose, handleKeyDown])

  return (
    <div
      role="alert"
      aria-live="assertive"
      aria-label={`Eagle de ${playerName} en hoyo ${holeNumber}`}
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 280,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: visible ? 'rgba(0,0,0,0.7)' : 'rgba(0,0,0,0)',
        backdropFilter: visible ? 'blur(6px)' : 'none',
        transition: 'background 300ms ease, backdrop-filter 300ms ease',
        cursor: 'pointer',
        overflow: 'hidden',
      }}
    >
      <style>{`
        @keyframes eagleConfetti {
          0% { transform: translateY(-20px) rotate(0deg); opacity: 1; }
          100% { transform: translateY(110vh) rotate(720deg); opacity: 0; }
        }
        @keyframes eaglePulse {
          0%, 100% { text-shadow: 0 0 20px rgba(196,153,42,0.5), 0 0 40px rgba(196,153,42,0.2); }
          50% { text-shadow: 0 0 30px rgba(196,153,42,0.8), 0 0 60px rgba(196,153,42,0.4); }
        }
        @keyframes eagleScale {
          0% { transform: scale(0.2); opacity: 0; }
          60% { transform: scale(1.15); }
          100% { transform: scale(1); opacity: 1; }
        }
        @keyframes eagleFadeIn {
          0% { opacity: 0; transform: translateY(10px); }
          100% { opacity: 1; transform: translateY(0); }
        }
      `}</style>

      {/* Confetti */}
      {particles.map(p => (
        <div
          key={p.id}
          style={{
            position: 'absolute',
            top: '-20px',
            left: `${p.left}%`,
            width: p.isCircle ? p.size : p.size * 0.3,
            height: p.size,
            borderRadius: p.isCircle ? '50%' : '2px',
            background: p.color,
            animation: `eagleConfetti ${p.duration}s ${p.delay}s ease-in forwards`,
            opacity: 0,
          }}
        />
      ))}

      <div style={{ textAlign: 'center', position: 'relative', zIndex: 1 }}>
        {/* Score */}
        <div style={{
          fontSize: 72,
          fontWeight: 900,
          color: '#c4992a',
          lineHeight: 1,
          animation: 'eagleScale 0.5s ease-out forwards, eaglePulse 1.5s ease-in-out 0.5s infinite',
        }}>
          -2
        </div>

        {/* Label */}
        <div style={{
          fontSize: 16,
          fontWeight: 700,
          color: '#fbbf24',
          letterSpacing: '4px',
          textTransform: 'uppercase',
          marginTop: 12,
          animation: 'eagleFadeIn 0.5s ease-out 0.3s both',
        }}>
          EAGLE
        </div>

        {/* Info */}
        <div style={{
          fontSize: 22,
          fontWeight: 700,
          color: '#edeae4',
          fontFamily: '"Playfair Display", serif',
          marginTop: 12,
          animation: 'eagleFadeIn 0.5s ease-out 0.5s both',
        }}>
          {playerName}
        </div>
        <div style={{
          fontSize: 13,
          color: 'rgba(255,255,255,0.4)',
          marginTop: 4,
          animation: 'eagleFadeIn 0.5s ease-out 0.7s both',
        }}>
          Hoyo {holeNumber}
        </div>
      </div>
    </div>
  )
}
