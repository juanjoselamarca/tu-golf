'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import type { ResultadoCPI } from '@/lib/cpi'
import { nivelCPI } from '@/lib/cpi'

interface StepCelebrationProps {
  cpiResult: ResultadoCPI
  insights: string[]
  roundCount: number
}

export default function StepCelebration({
  cpiResult,
  insights,
  roundCount,
}: StepCelebrationProps) {
  const router = useRouter()
  const [animatedScore, setAnimatedScore] = useState(0)

  useEffect(() => {
    const target = cpiResult.score
    const duration = 1500
    const steps = 60
    const increment = target / steps
    let current = 0
    const interval = setInterval(() => {
      current += increment
      if (current >= target) {
        setAnimatedScore(target)
        clearInterval(interval)
      } else {
        setAnimatedScore(Math.round(current * 10) / 10)
      }
    }, duration / steps)
    return () => clearInterval(interval)
  }, [cpiResult.score])

  const level = nivelCPI(cpiResult.score)

  // Gauge angle: 0-100 maps to -135deg to 135deg
  const gaugeAngle = -135 + (animatedScore / 100) * 270

  return (
    <div
      style={{
        paddingTop: '40px',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        textAlign: 'center',
      }}
    >
      <h2
        style={{
          fontSize: '24px',
          fontWeight: 700,
          color: '#edeae4',
          marginBottom: '8px',
          fontFamily: '"Playfair Display", serif',
        }}
      >
        {roundCount} ronda{roundCount !== 1 ? 's' : ''} importada{roundCount !== 1 ? 's' : ''}
      </h2>
      <p style={{ color: '#94a8c0', fontSize: '14px', marginBottom: '40px' }}>
        Tu perfil competitivo esta listo
      </p>

      {/* CPI Gauge */}
      <div
        style={{
          position: 'relative',
          width: '200px',
          height: '120px',
          marginBottom: '24px',
        }}
      >
        <svg
          viewBox="0 0 200 120"
          style={{ width: '100%', height: '100%' }}
        >
          {/* Background arc */}
          <path
            d="M 20 110 A 80 80 0 0 1 180 110"
            fill="none"
            stroke="rgba(255,255,255,0.05)"
            strokeWidth="8"
            strokeLinecap="round"
          />
          {/* Colored arc */}
          <path
            d="M 20 110 A 80 80 0 0 1 180 110"
            fill="none"
            stroke="#c4992a"
            strokeWidth="8"
            strokeLinecap="round"
            strokeDasharray={`${(animatedScore / 100) * 251.2} 251.2`}
            style={{ transition: 'stroke-dasharray 0.3s ease' }}
          />
        </svg>
        {/* Score number */}
        <div
          style={{
            position: 'absolute',
            bottom: '0',
            left: '50%',
            transform: 'translateX(-50%)',
            textAlign: 'center',
          }}
        >
          <div
            style={{
              fontSize: '42px',
              fontWeight: 800,
              color: '#c4992a',
              lineHeight: 1,
            }}
          >
            {Math.round(animatedScore)}
          </div>
          <div style={{ fontSize: '11px', color: '#94a8c0', marginTop: '2px' }}>
            CPI
          </div>
        </div>
      </div>

      {/* Level badge */}
      <div
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '8px',
          padding: '8px 20px',
          background: 'rgba(196,153,42,0.1)',
          border: '1px solid rgba(196,153,42,0.25)',
          borderRadius: '20px',
          marginBottom: '32px',
        }}
      >
        <span style={{ color: '#c4992a', fontWeight: 700, fontSize: '14px' }}>
          {level}
        </span>
        <span style={{ color: '#5a6a7d', fontSize: '12px' }}>
          &middot; {cpiResult.status === 'provisional' ? 'Provisional' : 'Establecido'}
        </span>
      </div>

      {/* Insights */}
      {insights.length > 0 && (
        <div
          style={{
            width: '100%',
            background: 'rgba(255,255,255,0.03)',
            border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: '16px',
            padding: '20px',
            marginBottom: '32px',
            textAlign: 'left',
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              marginBottom: '12px',
            }}
          >
            <span style={{ fontSize: '18px' }}>{'\uD83D\uDC2F'}</span>
            <span
              style={{ fontWeight: 600, fontSize: '14px', color: '#edeae4' }}
            >
              tAIger+ dice:
            </span>
          </div>
          <div
            style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}
          >
            {insights.map((insight, i) => (
              <p
                key={i}
                style={{
                  color: '#94a8c0',
                  fontSize: '13px',
                  lineHeight: 1.5,
                  margin: 0,
                }}
              >
                {insight}
              </p>
            ))}
          </div>
        </div>
      )}

      {/* CTAs */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '12px',
          width: '100%',
        }}
      >
        <button
          onClick={() => router.push('/coach')}
          style={{
            width: '100%',
            padding: '16px',
            borderRadius: '14px',
            fontSize: '16px',
            fontWeight: 700,
            background: '#c4992a',
            color: '#070d18',
            border: 'none',
            cursor: 'pointer',
            minHeight: '52px',
          }}
        >
          {'\uD83D\uDC2F'} Hablar con tAIger+
        </button>
        <button
          onClick={() => router.push('/dashboard')}
          style={{
            width: '100%',
            padding: '16px',
            borderRadius: '14px',
            fontSize: '16px',
            fontWeight: 600,
            background: 'rgba(255,255,255,0.05)',
            color: '#edeae4',
            border: '1px solid rgba(255,255,255,0.1)',
            cursor: 'pointer',
            minHeight: '52px',
          }}
        >
          Ver mi perfil
        </button>
      </div>
    </div>
  )
}
