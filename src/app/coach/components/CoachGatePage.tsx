'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { TaigerHero } from '@/components/coach/TaigerHero'

export function CoachGatePage() {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [code, setCode] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function activate() {
    if (!code.trim()) return
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/coach/activate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: code.trim() }),
      })
      if (res.ok) {
        router.refresh()
      } else {
        setError('Código incorrecto')
      }
    } catch {
      setError('Error de conexión')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ maxWidth: 600, margin: '0 auto', padding: '24px 16px 100px' }}>
      <TaigerHero />

      <div style={{ padding: '0 4px', marginTop: 8 }}>
        <h3 style={{
          fontFamily: 'var(--font-playfair)',
          fontSize: 24,
          fontWeight: 700,
          color: 'var(--text)',
          lineHeight: 1.25,
          margin: '0 0 20px',
        }}>
          Tu coach personal de golf
        </h3>

        <p style={{
          fontSize: 15,
          lineHeight: 1.7,
          color: 'var(--text-2)',
          margin: '0 0 16px',
          maxWidth: 420,
        }}>
          tAIger+ analiza cada ronda que juegas, detecta los patrones que te
          cuestan golpes y te guía para bajar tu handicap con recomendaciones
          adaptadas a tu juego.
        </p>

        <p style={{
          fontSize: 14,
          lineHeight: 1.6,
          color: 'var(--text-3)',
          margin: '0 0 40px',
        }}>
          Próximamente disponible para todos los usuarios.
        </p>

        {!open ? (
          <button
            onClick={() => setOpen(true)}
            style={{
              background: 'none',
              border: 'none',
              padding: 0,
              cursor: 'pointer',
              fontSize: 13,
              color: 'var(--text-3)',
              textDecoration: 'underline',
              textUnderlineOffset: 3,
            }}
          >
            Tengo un código de acceso
          </button>
        ) : (
          <div style={{ maxWidth: 280 }}>
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                type="text"
                value={code}
                onChange={(e) => { setCode(e.target.value); setError('') }}
                onKeyDown={(e) => e.key === 'Enter' && activate()}
                placeholder="Código"
                autoFocus
                disabled={loading}
                style={{
                  flex: 1,
                  background: 'var(--bg-surface)',
                  border: '1px solid var(--line)',
                  borderRadius: 8,
                  padding: '10px 14px',
                  fontSize: 14,
                  color: 'var(--text)',
                  fontFamily: '"DM Mono", monospace',
                  letterSpacing: '0.08em',
                  outline: 'none',
                }}
              />
              <button
                onClick={activate}
                disabled={loading || !code.trim()}
                style={{
                  background: 'var(--brand-on-bg)',
                  color: 'var(--bg)',
                  border: 'none',
                  borderRadius: 8,
                  padding: '10px 18px',
                  fontSize: 14,
                  fontWeight: 600,
                  cursor: loading ? 'wait' : 'pointer',
                  opacity: loading || !code.trim() ? 0.5 : 1,
                }}
              >
                {loading ? '...' : 'Entrar'}
              </button>
            </div>
            {error && (
              <p style={{
                fontSize: 13,
                color: 'var(--double)',
                marginTop: 8,
              }}>
                {error}
              </p>
            )}
          </div>
        )}

        <div style={{ marginTop: 40 }}>
          <Link href="/dashboard" style={{
            fontSize: 14,
            color: 'var(--brand-on-bg)',
            textDecoration: 'none',
            opacity: 0.7,
          }}>
            ← Volver
          </Link>
        </div>
      </div>
    </div>
  )
}
