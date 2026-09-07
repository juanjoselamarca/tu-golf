'use client'

import { useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { useRouter } from 'next/navigation'

const HERO_IMG = '/images/taiger/taiger-domingo.png'

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
    <>
      <style>{`
        .gate-wrap {
          min-height: calc(100vh - 52px);
          display: flex;
          flex-direction: column;
        }
        .gate-hero {
          position: relative;
          width: 100%;
          height: 340px;
          overflow: hidden;
        }
        @media (max-width: 640px) {
          .gate-hero { height: 260px; }
        }
        .gate-body {
          position: relative;
          z-index: 2;
          margin-top: -80px;
          padding: 0 28px 60px;
          max-width: 520px;
          margin-left: auto;
          margin-right: auto;
        }
        @media (max-width: 640px) {
          .gate-body {
            margin-top: -60px;
            padding: 0 20px 48px;
          }
        }
        .gate-input:focus {
          border-color: rgba(196,153,42,0.4) !important;
        }
      `}</style>

      <div className="gate-wrap">
        {/* Full-bleed hero image */}
        <div className="gate-hero">
          <Image
            src={HERO_IMG}
            alt="tAIger+"
            fill
            style={{ objectFit: 'cover', objectPosition: '50% 10%' }}
            sizes="100vw"
            priority
          />
          <div style={{
            position: 'absolute', inset: 0,
            background: 'linear-gradient(to bottom, transparent 20%, var(--bg) 100%)',
          }} />
        </div>

        {/* Content */}
        <div className="gate-body">
          <h2 style={{
            fontFamily: 'var(--font-playfair)',
            fontSize: 32,
            fontWeight: 700,
            color: 'var(--text)',
            lineHeight: 1.15,
            margin: '0 0 8px',
            letterSpacing: '-0.01em',
          }}>
            tAIger+
          </h2>

          <p style={{
            fontSize: 15,
            lineHeight: 1.7,
            color: 'var(--text-2)',
            margin: '0 0 6px',
          }}>
            Coach de golf con inteligencia artificial.
          </p>

          <p style={{
            fontSize: 14,
            lineHeight: 1.6,
            color: 'var(--text-3)',
            margin: '0 0 36px',
          }}>
            Disponible próximamente.
          </p>

          {/* Code input area */}
          {!open ? (
            <button
              onClick={() => setOpen(true)}
              style={{
                background: 'none',
                border: 'none',
                padding: 0,
                cursor: 'pointer',
                fontSize: 13,
                color: 'var(--brand-on-bg)',
                opacity: 0.6,
              }}
            >
              Ingresar código de acceso
            </button>
          ) : (
            <div>
              <div style={{ display: 'flex', gap: 10, maxWidth: 300 }}>
                <input
                  className="gate-input"
                  type="text"
                  value={code}
                  onChange={(e) => { setCode(e.target.value.toUpperCase()); setError('') }}
                  onKeyDown={(e) => e.key === 'Enter' && activate()}
                  placeholder="Código"
                  autoFocus
                  disabled={loading}
                  style={{
                    flex: 1,
                    background: 'rgba(14,28,47,0.6)',
                    border: '1px solid rgba(196,153,42,0.15)',
                    borderRadius: 10,
                    padding: '12px 16px',
                    fontSize: 15,
                    color: 'var(--text)',
                    fontFamily: '"DM Mono", monospace',
                    letterSpacing: '0.12em',
                    outline: 'none',
                    transition: 'border-color 0.2s',
                  }}
                />
                <button
                  onClick={activate}
                  disabled={loading || !code.trim()}
                  style={{
                    background: 'var(--brand-on-bg)',
                    color: 'var(--bg)',
                    border: 'none',
                    borderRadius: 10,
                    padding: '12px 20px',
                    fontSize: 14,
                    fontWeight: 600,
                    cursor: loading ? 'wait' : 'pointer',
                    opacity: loading || !code.trim() ? 0.4 : 1,
                    transition: 'opacity 0.2s',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {loading ? '...' : 'Activar'}
                </button>
              </div>
              {error && (
                <p style={{ fontSize: 13, color: 'var(--double)', marginTop: 10 }}>
                  {error}
                </p>
              )}
            </div>
          )}

          <div style={{ marginTop: 48 }}>
            <Link href="/dashboard" style={{
              fontSize: 13,
              color: 'var(--text-3)',
              textDecoration: 'none',
            }}>
              ← Volver a Golfers+
            </Link>
          </div>
        </div>
      </div>
    </>
  )
}
