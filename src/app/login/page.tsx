'use client'

import { Suspense, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { useToast } from '@/hooks/useToast'

function Spinner() {
  return (
    <svg className="animate-spin" width="18" height="18" viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  )
}

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20">
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
    </svg>
  )
}

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

function translateLoginError(message: string): { title: string; body: string; type: 'error' | 'warning' } {
  const m = message.toLowerCase()
  if (m.includes('invalid login credentials') || m.includes('invalid_credentials'))
    return { type: 'error',   title: 'Credenciales incorrectas', body: 'El email o contraseña no son correctos. Verifica tus datos e intenta de nuevo.' }
  if (m.includes('email not confirmed'))
    return { type: 'warning', title: 'Email sin confirmar', body: 'Revisa tu bandeja de entrada y confirma tu email antes de ingresar.' }
  if (m.includes('too many requests') || m.includes('rate limit'))
    return { type: 'warning', title: 'Demasiados intentos', body: 'Por seguridad, espera unos minutos antes de volver a intentarlo.' }
  return { type: 'error', title: 'Error al iniciar sesión', body: 'No pudimos procesar tu solicitud. Por favor intenta nuevamente.' }
}

function LoginContent() {
  const router  = useRouter()
  const { showError, showWarning } = useToast()
  const searchParams = useSearchParams()
  const redirectTo = searchParams.get('redirect') || '/dashboard'
  const isTournamentJoin = redirectTo.includes('/torneo/') && redirectTo.includes('/unirse')

  const [email,   setEmail]   = useState('')
  const [password, setPassword] = useState('')
  const [showPwd, setShowPwd] = useState(false)
  const [loading, setLoading] = useState(false)

  const handleGoogle = async () => {
    const supabase = createClient()
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo:  `${window.location.origin}/auth/callback?next=${encodeURIComponent(redirectTo)}`,
        queryParams: { access_type: 'offline', prompt: 'select_account' },
      },
    })
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)

    const supabase = createClient()
    const { error } = await supabase.auth.signInWithPassword({ email, password })

    if (error) {
      const { type, title, body } = translateLoginError(error.message)
      if (type === 'warning') showWarning(title, body)
      else showError(title, body)
      setLoading(false)
    } else {
      router.push(redirectTo)
    }
  }

  return (
    <div
      style={{
        minHeight:          '100vh',
        display:            'flex',
        alignItems:         'center',
        justifyContent:     'center',
        background:         'var(--bg-surface)',
        position:           'relative',
      }}
    >

      <div
        style={{
          position:             'relative',
          zIndex:               10,
          background:           'var(--bg-card-light)',
          border:               '1px solid var(--border)',
          boxShadow:            'var(--shadow-lg)',
          borderRadius:         '16px',
          padding:              'clamp(24px, 6vw, 40px)',
          maxWidth:             '420px',
          width:                '90%',
        }}
      >
        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: '6px' }}>
          <span style={{ fontFamily: '"Playfair Display", serif', fontSize: '26px', color: '#edeae4', fontWeight: 700 }}>
            Golfers<span style={{ color: '#c4992a' }}>+</span>
          </span>
        </div>

        <h1 style={{ fontFamily: '"Playfair Display", serif', fontSize: '22px', color: 'var(--text)', textAlign: 'center', margin: '12px 0 4px' }}>
          Bienvenido a Golfers+
        </h1>
        <p style={{ fontSize: '14px', color: 'var(--text-2)', textAlign: 'center', marginBottom: isTournamentJoin ? '12px' : '28px' }}>
          {isTournamentJoin
            ? 'Para anotar tu score en el torneo, inicia sesión'
            : 'Inicia sesión para continuar mejorando tu golf'}
        </p>
        {isTournamentJoin && (
          <p style={{ fontSize: '12px', color: 'rgba(196,153,42,0.7)', textAlign: 'center', marginBottom: '28px' }}>
            Vuelves automáticamente al torneo después
          </p>
        )}

        {/* Google */}
        <button
          onClick={handleGoogle}
          style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px', background: 'white', color: '#1a1a1a', borderRadius: '8px', padding: '12px 16px', width: '100%', fontSize: '15px', fontWeight: 500, border: 'none', cursor: 'pointer', transition: 'box-shadow 200ms' }}
          onMouseEnter={(e) => ((e.currentTarget as HTMLButtonElement).style.boxShadow = '0 0 0 2px rgba(196,153,42,0.5)')}
          onMouseLeave={(e) => ((e.currentTarget as HTMLButtonElement).style.boxShadow = 'none')}
        >
          <GoogleIcon />
          Continuar con Google
        </button>

        {/* Divider */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px', margin: '24px 0' }}>
          <div style={{ flex: 1, height: '1px', background: 'linear-gradient(90deg, transparent, rgba(196,153,42,0.3))' }} />
          <span style={{ fontSize: '11px', color: 'rgba(196,153,42,0.6)', whiteSpace: 'nowrap', letterSpacing: '0.05em', fontWeight: 500, textTransform: 'uppercase' }}>o continúa con email</span>
          <div style={{ flex: 1, height: '1px', background: 'linear-gradient(90deg, rgba(196,153,42,0.3), transparent)' }} />
        </div>

        {/* Form */}
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

          <div style={{ position: 'relative' }}>
            <input
              type={showPwd ? 'text' : 'password'}
              placeholder="Tu contraseña"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              style={{ ...inputStyle, paddingRight: '44px' }}
              onFocus={(e) => (e.currentTarget.style.borderColor = '#c4992a')}
              onBlur={(e) => (e.currentTarget.style.borderColor = 'rgba(122,143,168,0.3)')}
            />
            <button type="button" onClick={() => setShowPwd(!showPwd)} aria-label={showPwd ? 'Ocultar contraseña' : 'Mostrar contraseña'} style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-2)', padding: '2px', display: 'flex', alignItems: 'center' }}>
              {showPwd
                ? <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24" /><line x1="1" y1="1" x2="23" y2="23" /></svg>
                : <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></svg>
              }
            </button>
          </div>

          <button
            type="submit"
            disabled={loading}
            style={{ background: '#c4992a', color: '#070d18', fontWeight: 600, width: '100%', borderRadius: '10px', padding: '14px', border: 'none', cursor: loading ? 'not-allowed' : 'pointer', fontSize: '15px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', opacity: loading ? 0.8 : 1, transition: 'filter 200ms' }}
            onMouseEnter={(e) => { if (!loading) (e.currentTarget as HTMLButtonElement).style.filter = 'brightness(1.1)' }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.filter = 'brightness(1)' }}
          >
            {loading && <Spinner />}
            {loading ? 'Ingresando...' : 'Iniciar sesión'}
          </button>
        </form>

        <p style={{ textAlign: 'center', fontSize: '14px', color: 'var(--text-2)', marginTop: '24px' }}>
          ¿No tienes cuenta?{' '}
          <Link href="/register" style={{ color: '#c4992a', textDecoration: 'none', fontWeight: 600 }}>
            Regístrate gratis →
          </Link>
        </p>
      </div>
    </div>
  )
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div style={{ background: 'var(--bg)', minHeight: '100vh' }} />}>
      <LoginContent />
    </Suspense>
  )
}
