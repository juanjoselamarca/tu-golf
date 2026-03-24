'use client'

import { useState, useEffect } from 'react'

interface Props {
  playerName: string
  holeNumber: number
  onClose: () => void
}

export default function HoleInOneCelebration({ playerName, holeNumber, onClose }: Props) {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const t = setTimeout(() => setVisible(true), 50)
    // Auto-close after 6 seconds
    const autoClose = setTimeout(onClose, 6000)
    return () => { clearTimeout(t); clearTimeout(autoClose) }
  }, [onClose])

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 300,
        background: 'rgba(0,0,0,0.85)',
        backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        opacity: visible ? 1 : 0, transition: 'opacity 0.4s',
      }}
    >
      {/* Gold particles */}
      <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none' }}>
        {Array.from({ length: 50 }, (_, i) => (
          <div key={i} style={{
            position: 'absolute',
            left: `${Math.random() * 100}%`,
            top: '-20px',
            width: `${4 + Math.random() * 8}px`,
            height: `${4 + Math.random() * 8}px`,
            borderRadius: Math.random() > 0.3 ? '50%' : '1px',
            backgroundColor: ['#c4992a', '#fbbf24', '#f59e0b', '#ffffff', '#d4a843'][Math.floor(Math.random() * 5)],
            animation: `aceConfetti ${1.5 + Math.random() * 2.5}s ${Math.random() * 1.5}s ease-in forwards`,
          }} />
        ))}
      </div>

      <div style={{ textAlign: 'center', position: 'relative' }}>
        {/* Glowing 1 */}
        <div style={{
          fontSize: '120px', fontWeight: 900, color: '#c4992a', lineHeight: 1,
          textShadow: '0 0 40px rgba(196,153,42,0.8), 0 0 80px rgba(196,153,42,0.4), 0 0 120px rgba(196,153,42,0.2)',
          animation: 'acePulse 1.5s ease-in-out infinite',
        }}>
          1
        </div>

        <div style={{
          fontSize: '14px', fontWeight: 700, color: '#c4992a',
          textTransform: 'uppercase', letterSpacing: '4px', marginTop: '8px',
          animation: 'aceFadeIn 0.6s ease-out 0.3s both',
        }}>
          HOLE IN ONE
        </div>

        <div style={{
          fontSize: '28px', fontWeight: 700, color: '#ffffff', marginTop: '16px',
          fontFamily: '"Playfair Display", serif',
          animation: 'aceFadeIn 0.6s ease-out 0.5s both',
        }}>
          {playerName}
        </div>

        <div style={{
          fontSize: '14px', color: 'rgba(255,255,255,0.5)', marginTop: '6px',
          animation: 'aceFadeIn 0.6s ease-out 0.7s both',
        }}>
          Hoyo {holeNumber}
        </div>

        <div style={{
          fontSize: '12px', color: 'rgba(255,255,255,0.25)', marginTop: '24px',
          animation: 'aceFadeIn 0.6s ease-out 1s both',
        }}>
          Toca para continuar
        </div>
      </div>

      <style>{`
        @keyframes aceConfetti {
          0% { transform: translateY(-20px) rotate(0deg); opacity: 1; }
          100% { transform: translateY(110vh) rotate(1080deg); opacity: 0; }
        }
        @keyframes acePulse {
          0%, 100% { text-shadow: 0 0 40px rgba(196,153,42,0.8), 0 0 80px rgba(196,153,42,0.4); }
          50% { text-shadow: 0 0 60px rgba(196,153,42,1), 0 0 120px rgba(196,153,42,0.6), 0 0 180px rgba(196,153,42,0.3); }
        }
        @keyframes aceFadeIn {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  )
}
