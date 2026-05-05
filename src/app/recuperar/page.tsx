'use client'

import { useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase'

const inputStyle: React.CSSProperties = {
  background:   'var(--input-bg)',
  border:       '1px solid var(--input-border)',
  color:        'var(--text)',
  borderRadius: '8px',
  padding:      '12px',
  width:        '100%',
  fontSize:     '16px',
  outline:      'none',
  transition:   'border-color 200ms',
}

export default function RecuperarPage() {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    const supabase = createClient()
    const { error: err } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/callback?next=/perfil`,
    })

    if (err) {
      setError('No pudimos enviar el email. Verifica que el correo sea correcto.')
      setLoading(false)
    } else {
      setSent(true)
      setLoading(false)
    }
  }

  return (
    <div
      style={{
        minHeight:      '100vh',
        display:        'flex',
        alignItems:     'center',
        justifyContent: 'center',
        background:     'var(--bg-surface)',
      }}
    >
      <div
        style={{
          background:   'var(--bg-card-light)',
          border:       '1px solid var(--border)',
          boxShadow:    'var(--shadow-lg)',
          borderRadius: '16px',
          padding:      'clamp(24px, 6vw, 40px)',
          maxWidth:     '420px',
          width:        '90%',
        }}
      >
        <div style={{ textAlign: 'center', marginBottom: '6px' }}>
          <span style={{ fontFamily: '"Playfair Display", serif', fontSize: '26px', color: 'var(--text)', fontWeight: 700 }}>
            Golfers<span style={{ color: '#8A6A16' }}>+</span>
          </span>
        </div>

        <h1 style={{ fontFamily: '"Playfair Display", serif', fontSize: '22px', color: 'var(--text)', textAlign: 'center', margin: '12px 0 4px' }}>
          Recuperar contraseña
        </h1>

        {sent ? (
          <div style={{ textAlign: 'center', marginTop: '24px' }}>
            <div style={{ fontSize: '48px', marginBottom: '16px' }}>📧</div>
            <p style={{ fontSize: '16px', color: 'var(--text)', marginBottom: '8px', fontWeight: 500 }}>
              Revisa tu email
            </p>
            <p style={{ fontSize: '14px', color: 'var(--text-2)', marginBottom: '24px', lineHeight: 1.5 }}>
              Enviamos un enlace de recuperación a <strong style={{ color: 'var(--text)' }}>{email}</strong>.
              Revisa tu bandeja de entrada y spam.
            </p>
            <Link
              href="/login"
              style={{
                display:      'inline-block',
                color:        '#8A6A16',
                fontSize:     '14px',
                textDecoration: 'none',
                fontWeight:   600,
              }}
            >
              ← Volver al login
            </Link>
          </div>
        ) : (
          <>
            <p style={{ fontSize: '14px', color: 'var(--text-2)', textAlign: 'center', marginBottom: '24px' }}>
              Ingresa tu email y te enviaremos un enlace para crear una nueva contraseña.
            </p>

            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <input
                type="email"
                placeholder="tu@email.com"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                style={inputStyle}
                onFocus={(e) => (e.currentTarget.style.borderColor = '#c4992a')}
                onBlur={(e) => (e.currentTarget.style.borderColor = 'rgba(122,143,168,0.3)')}
              />

              {error && (
                <p style={{ fontSize: '13px', color: '#ef4444', margin: 0 }}>{error}</p>
              )}

              <button
                type="submit"
                disabled={loading}
                style={{
                  background:   '#c4992a',
                  color:        'var(--brand-dark)',
                  fontWeight:   600,
                  width:        '100%',
                  borderRadius: '10px',
                  padding:      '14px',
                  border:       'none',
                  cursor:       loading ? 'not-allowed' : 'pointer',
                  fontSize:     '15px',
                  opacity:      loading ? 0.8 : 1,
                  transition:   'filter 200ms',
                }}
                onMouseEnter={(e) => { if (!loading) (e.currentTarget as HTMLButtonElement).style.filter = 'brightness(1.1)' }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.filter = 'brightness(1)' }}
              >
                {loading ? 'Enviando...' : 'Enviar enlace de recuperación'}
              </button>
            </form>

            <p style={{ textAlign: 'center', fontSize: '14px', color: 'var(--text-2)', marginTop: '24px' }}>
              <Link href="/login" style={{ color: '#8A6A16', textDecoration: 'none', fontWeight: 600 }}>
                ← Volver al login
              </Link>
            </p>
          </>
        )}
      </div>
    </div>
  )
}
