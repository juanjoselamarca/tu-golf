'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'

export function TournamentBottomSheet({ slug, isLive, isDemo = false }: { slug: string; isLive: boolean; isDemo?: boolean }) {
  const router = useRouter()
  const [sheet, setSheet] = useState<'hidden' | 'visible' | 'gone'>('hidden')

  useEffect(() => {
    if (!isLive) return
    // En demo no se muestra el selector de rol: nadie se inscribe a un demo.
    if (isDemo) return
    const key = `gf_sheet_${slug}`
    if (localStorage.getItem(key)) return
    const t = setTimeout(() => setSheet('visible'), 3000)
    return () => clearTimeout(t)
  }, [slug, isLive, isDemo])

  const dismiss = (tipo: 'jugador' | 'espectador') => {
    localStorage.setItem(`gf_sheet_${slug}`, tipo)
    setSheet('gone')
    if (tipo === 'jugador') router.push(`/torneo/${slug}/unirse`)
  }

  if (sheet === 'gone') return null
  if (sheet === 'hidden') return null

  return (
    <>
      {/* Gradient backdrop */}
      <div
        style={{
          position: 'fixed',
          bottom: 0,
          left: 0,
          right: 0,
          height: '180px',
          background: 'linear-gradient(to top, rgba(7,13,24,0.8) 0%, transparent 100%)',
          zIndex: 199,
          pointerEvents: 'none',
        }}
      />

      {/* Bottom sheet */}
      <div
        style={{
          position: 'fixed',
          bottom: 0,
          left: 0,
          right: 0,
          zIndex: 200,
          background: '#0e1c2f',
          borderTop: '1px solid rgba(196,153,42,0.25)',
          borderRadius: '20px 20px 0 0',
          padding: '12px 20px 28px',
          transform: sheet === 'visible' ? 'translateY(0)' : 'translateY(100%)',
          transition: 'transform 500ms ease-out',
        }}
      >
        {/* Pill drag indicator */}
        <div
          style={{
            width: '40px',
            height: '4px',
            borderRadius: '2px',
            background: 'rgba(255,255,255,0.2)',
            margin: '0 auto 16px',
          }}
        />

        {/* Title */}
        <div
          style={{
            fontSize: '16px',
            fontWeight: 700,
            color: '#edeae4',
            textAlign: 'center',
            marginBottom: '6px',
          }}
        >
          ¿Estás jugando en este torneo?
        </div>

        {/* Subtitle */}
        <div
          style={{
            fontSize: '14px',
            color: '#94a8c0',
            textAlign: 'center',
            marginBottom: '20px',
          }}
        >
          Anota tu score hoyo a hoyo en tiempo real
        </div>

        {/* Buttons */}
        <div style={{ display: 'flex', gap: '10px' }}>
          <button
            onClick={() => dismiss('jugador')}
            style={{
              flex: 1,
              height: '52px',
              borderRadius: '12px',
              background: '#c4992a',
              color: '#070d18',
              fontSize: '15px',
              fontWeight: 700,
              border: 'none',
              cursor: 'pointer',
            }}
          >
            Soy jugador →
          </button>
          <button
            onClick={() => dismiss('espectador')}
            style={{
              flex: 1,
              height: '52px',
              borderRadius: '12px',
              background: 'transparent',
              color: '#edeae4',
              fontSize: '15px',
              fontWeight: 600,
              border: '1px solid rgba(255,255,255,0.12)',
              cursor: 'pointer',
            }}
          >
            Solo estoy viendo
          </button>
        </div>
      </div>
    </>
  )
}
