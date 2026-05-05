'use client'

import { useEffect, useState, useCallback } from 'react'

interface Props {
  playerName: string
  holeNumber: number
  onClose: () => void
}

/**
 * Celebración sutil de birdie.
 * Flash celeste + icono circular + texto animado.
 * Auto-close 1.5s. No bloquea la UI.
 */
export default function BirdieCelebration({ playerName, holeNumber, onClose }: Props) {
  const [visible, setVisible] = useState(false)

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape') onClose()
  }, [onClose])

  useEffect(() => {
    requestAnimationFrame(() => setVisible(true))
    document.addEventListener('keydown', handleKeyDown)
    const timer = setTimeout(() => {
      setVisible(false)
      setTimeout(onClose, 300)
    }, 1500)
    return () => { clearTimeout(timer); document.removeEventListener('keydown', handleKeyDown) }
  }, [onClose, handleKeyDown])

  return (
    <div
      role="alert"
      aria-live="assertive"
      aria-label={`Birdie de ${playerName} en hoyo ${holeNumber}`}
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 250,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: visible ? 'rgba(0,0,0,0.5)' : 'rgba(0,0,0,0)',
        backdropFilter: visible ? 'blur(4px)' : 'none',
        transition: 'background 300ms ease, backdrop-filter 300ms ease',
        cursor: 'pointer',
      }}
    >
      <style>{`
        @keyframes birdieScale {
          0% { transform: scale(0.3); opacity: 0; }
          50% { transform: scale(1.1); }
          100% { transform: scale(1); opacity: 1; }
        }
        @keyframes birdieRing {
          0% { transform: scale(0.8); opacity: 0; box-shadow: 0 0 0 0 rgba(22,163,74,0.4); }
          50% { box-shadow: 0 0 0 20px rgba(22,163,74,0); }
          100% { transform: scale(1); opacity: 1; box-shadow: 0 0 0 0 rgba(22,163,74,0); }
        }
        @keyframes birdieText {
          0% { opacity: 0; transform: translateY(10px); }
          100% { opacity: 1; transform: translateY(0); }
        }
      `}</style>

      <div style={{ textAlign: 'center' }}>
        {/* Círculo con score */}
        <div style={{
          width: 80,
          height: 80,
          borderRadius: '50%',
          border: '3px solid #16a34a',
          background: 'rgba(22,163,74,0.15)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          margin: '0 auto 16px',
          animation: 'birdieRing 0.5s ease-out forwards',
        }}>
          <span style={{
            fontSize: 32,
            fontWeight: 900,
            color: '#4ade80',
            animation: 'birdieScale 0.4s ease-out forwards',
          }}>
            -1
          </span>
        </div>

        {/* Label */}
        <div style={{
          fontSize: 14,
          fontWeight: 700,
          color: '#4ade80',
          letterSpacing: '3px',
          textTransform: 'uppercase',
          marginBottom: 8,
          animation: 'birdieText 0.4s ease-out 0.2s both',
        }}>
          BIRDIE
        </div>

        {/* Info */}
        <div style={{
          fontSize: 18,
          fontWeight: 600,
          color: 'var(--text)',
          animation: 'birdieText 0.4s ease-out 0.3s both',
        }}>
          {playerName}
        </div>
        <div style={{
          fontSize: 13,
          color: 'rgba(255,255,255,0.5)',
          animation: 'birdieText 0.4s ease-out 0.4s both',
        }}>
          Hoyo {holeNumber}
        </div>
      </div>
    </div>
  )
}
