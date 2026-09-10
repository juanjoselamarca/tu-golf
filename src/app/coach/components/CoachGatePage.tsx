'use client'

import { useState } from 'react'
import Link from 'next/link'
export function CoachGatePage() {
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
        // router.refresh() no re-renderiza el Server Component en producción.
        // Forzar recarga completa para que la gate page se reemplace por el dashboard.
        window.location.reload()
        return
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
        @keyframes gate-mesh {
          0% { background-position: 0% 50%; }
          50% { background-position: 100% 50%; }
          100% { background-position: 0% 50%; }
        }
        @keyframes gate-pulse {
          0%, 100% { opacity: 0.35; }
          50% { opacity: 0.75; }
        }
        .gate-wrap {
          min-height: calc(100vh - 52px);
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          position: relative;
          overflow: hidden;
          background: var(--bg);
        }
        .gate-mesh-bg {
          position: absolute;
          inset: 0;
          background: radial-gradient(ellipse at 30% 20%, rgba(196,153,42,0.06) 0%, transparent 60%),
                      radial-gradient(ellipse at 70% 80%, rgba(14,28,47,0.8) 0%, transparent 50%),
                      radial-gradient(ellipse at 50% 50%, rgba(196,153,42,0.03) 0%, transparent 70%);
          background-size: 200% 200%;
          animation: gate-mesh 12s ease-in-out infinite;
        }
        .gate-content {
          position: relative;
          z-index: 2;
          max-width: 400px;
          width: 100%;
          padding: 0 28px;
          text-align: center;
        }
        .gate-divider {
          width: 40px;
          height: 1px;
          background: rgba(196,153,42,0.3);
          margin: 0 auto 32px;
        }
        .gate-dots {
          display: flex;
          justify-content: center;
          gap: 8px;
          margin-bottom: 48px;
        }
        .gate-dot {
          width: 4px;
          height: 4px;
          border-radius: 50%;
          background: rgba(196,153,42,0.5);
          animation: gate-pulse 3s ease-in-out infinite;
        }
        .gate-dot:nth-child(2) { animation-delay: 0.4s; }
        .gate-dot:nth-child(3) { animation-delay: 0.8s; }
        .gate-dot:nth-child(4) { animation-delay: 1.2s; }
        .gate-dot:nth-child(5) { animation-delay: 1.6s; }
        .gate-input:focus {
          border-color: rgba(196,153,42,0.4) !important;
        }
        .gate-grid-line {
          position: absolute;
          background: rgba(196,153,42,0.03);
        }
        .gate-grid-h { width: 100%; height: 1px; }
        .gate-grid-v { width: 1px; height: 100%; }
        .gate-activate-btn:not(:disabled):hover {
          border-color: rgba(196,153,42,0.4);
          background: rgba(196,153,42,0.04);
        }
      `}</style>

      <div className="gate-wrap">
        {/* Animated gradient mesh background */}
        <div className="gate-mesh-bg" />

        {/* Subtle grid overlay */}
        <div className="gate-grid-line gate-grid-h" style={{ top: '25%' }} />
        <div className="gate-grid-line gate-grid-h" style={{ top: '50%' }} />
        <div className="gate-grid-line gate-grid-h" style={{ top: '75%' }} />
        <div className="gate-grid-line gate-grid-v" style={{ left: '25%' }} />
        <div className="gate-grid-line gate-grid-v" style={{ left: '50%' }} />
        <div className="gate-grid-line gate-grid-v" style={{ left: '75%' }} />

        <div className="gate-content">
          {/* Animated pulse dots */}
          <div className="gate-dots">
            <span className="gate-dot" />
            <span className="gate-dot" />
            <span className="gate-dot" />
            <span className="gate-dot" />
            <span className="gate-dot" />
          </div>

          {/* Brand mark */}
          <h2 style={{
            fontFamily: 'var(--font-playfair)',
            fontSize: 38,
            fontWeight: 700,
            color: 'var(--text)',
            lineHeight: 1.1,
            margin: '0 0 16px',
            letterSpacing: '-0.02em',
          }}>
            tAIger<span style={{ color: 'var(--brand-on-bg)' }}>+</span>
          </h2>

          <div className="gate-divider" />

          <p style={{
            fontSize: 16,
            lineHeight: 1.7,
            color: 'var(--text)',
            margin: '0 0 6px',
            fontWeight: 500,
          }}>
            Rendimiento mental, medido.
          </p>

          <p style={{
            fontSize: 13,
            lineHeight: 1.7,
            color: 'var(--text-3)',
            margin: '0 0 40px',
            letterSpacing: '0.02em',
          }}>
            Acceso por invitación.
          </p>

          {/* Code activation */}
          {!open ? (
            <button
              className="gate-activate-btn"
              onClick={() => setOpen(true)}
              style={{
                background: 'transparent',
                border: '1px solid rgba(196,153,42,0.2)',
                borderRadius: 10,
                padding: '13px 28px',
                cursor: 'pointer',
                fontSize: 13,
                fontWeight: 600,
                color: 'var(--brand-on-bg)',
                letterSpacing: '0.06em',
                transition: 'border-color 0.3s, background 0.3s',
                minHeight: 44,
              }}
            >
              Ingresar código de acceso
            </button>
          ) : (
            <div style={{ display: 'flex', gap: 10, maxWidth: 320, margin: '0 auto' }}>
              <input
                className="gate-input"
                type="text"
                value={code}
                onChange={(e) => { setCode(e.target.value.toUpperCase()); setError('') }}
                onKeyDown={(e) => e.key === 'Enter' && activate()}
                placeholder="Tu código"
                autoFocus
                disabled={loading}
                style={{
                  flex: 1,
                  background: 'rgba(14,28,47,0.6)',
                  border: '1px solid rgba(196,153,42,0.15)',
                  borderRadius: 10,
                  padding: '13px 16px',
                  fontSize: 15,
                  color: 'var(--text)',
                  fontFamily: '"DM Mono", monospace',
                  letterSpacing: '0.12em',
                  outline: 'none',
                  transition: 'border-color 0.2s',
                  textAlign: 'center',
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
                  padding: '13px 24px',
                  fontSize: 14,
                  fontWeight: 600,
                  cursor: loading ? 'wait' : 'pointer',
                  opacity: loading || !code.trim() ? 0.4 : 1,
                  transition: 'opacity 0.2s',
                  whiteSpace: 'nowrap',
                  minHeight: 44,
                }}
              >
                {loading ? '...' : 'Activar'}
              </button>
            </div>
          )}

          {error && (
            <p style={{ fontSize: 13, color: 'var(--double)', marginTop: 12, textAlign: 'center' }}>
              {error}
            </p>
          )}

          <div style={{ marginTop: 56 }}>
            <Link href="/dashboard" style={{
              fontSize: 13,
              color: 'var(--text-3)',
              textDecoration: 'none',
              opacity: 0.6,
            }}>
              ← Volver a Golfers+
            </Link>
          </div>
        </div>
      </div>
    </>
  )
}
