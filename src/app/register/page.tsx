'use client'

import { Suspense, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { useToast } from '@/hooks/useToast'
import { useFormErrors } from '@/hooks/useFormErrors'

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

const baseInput: React.CSSProperties = {
  background:   'var(--input-bg)',
  color:        'var(--text)',
  borderRadius: '8px',
  padding:      '12px',
  width:        '100%',
  fontSize:     '15px',
  outline:      'none',
  transition:   'border-color 200ms',
  boxSizing:    'border-box' as const,
}

function FieldErr({ msg }: { msg: string | null }) {
  if (!msg) return null
  return <p style={{ color: '#f87171', fontSize: '12px', marginTop: '4px' }}>{msg}</p>
}

function translateRegisterError(message: string) {
  const m = message.toLowerCase()
  if (m.includes('user already registered') || m.includes('already been registered'))
    return { field: 'email', title: 'Email ya registrado', body: '¿Quieres iniciar sesión?' }
  if (m.includes('password should be at least') || m.includes('password is too short'))
    return { field: 'password', title: 'Contraseña muy corta', body: 'La contraseña debe tener al menos 6 caracteres.' }
  return { field: null, title: 'Error al registrarse', body: 'No pudimos crear tu cuenta. Por favor intenta nuevamente.' }
}

function RegisterContent() {
  const router = useRouter()
  const { showError } = useToast()
  const { fieldError, setFieldError, clearAll } = useFormErrors()
  const searchParams = useSearchParams()
  const redirectTo = searchParams.get('redirect') || '/dashboard'

  const [isOpen,   setIsOpen]   = useState(false)
  const [name,     setName]     = useState('')
  const [email,    setEmail]    = useState('')
  const [password, setPassword] = useState('')
  const [indice,   setIndice]   = useState('')
  const [showPwd,  setShowPwd]  = useState(false)
  const [loading,  setLoading]  = useState(false)

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
    clearAll()

    // Client validation
    if (password.length < 6) {
      setFieldError('password', 'Mínimo 6 caracteres')
      showError('Contraseña muy corta', 'La contraseña debe tener al menos 6 caracteres.')
      return
    }

    setLoading(true)
    const supabase = createClient()
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          name,
          indice: indice ? parseFloat(indice) : null,
        },
      },
    })

    if (error) {
      const { field, title, body } = translateRegisterError(error.message)
      if (field) setFieldError(field, title)
      showError(title, body)
      setLoading(false)
    } else {
      router.push(redirectTo)
    }
  }

  const inputStyle = (field: string): React.CSSProperties => ({
    ...baseInput,
    border: `1px solid ${fieldError(field) ? '#dc2626' : 'rgba(122,143,168,0.3)'}`,
  })

  return (
    <div
      style={{
        minHeight:          '100vh',
        display:            'flex',
        alignItems:         'center',
        justifyContent:     'center',
        background:         'var(--bg-surface)',
        position:           'relative',
        padding:            '24px 0',
      }}
    >

      <div
        style={{
          position:             'relative',
          zIndex:               10,
          background:           'var(--bg-card-light)',
          border:               '1px solid rgba(196,153,42,0.25)',
          borderRadius:         '16px',
          padding:              '40px',
          maxWidth:             '420px',
          width:                '90%',
        }}
      >
        <div style={{ textAlign: 'center', marginBottom: '6px' }}>
          <span style={{ fontFamily: '"Playfair Display", serif', fontSize: '26px', color: '#edeae4', fontWeight: 700 }}>Golfers<span style={{ color: '#c4992a' }}>+</span></span>
        </div>
        <h1 style={{ fontFamily: '"Playfair Display", serif', fontSize: '22px', color: 'var(--text)', textAlign: 'center', margin: '12px 0 4px' }}>Crea tu cuenta</h1>
        <p style={{ fontSize: '14px', color: 'var(--text-2)', textAlign: 'center', marginBottom: '28px' }}>Únete a Golfers+</p>

        {/* Google */}
        <button
          onClick={handleGoogle}
          style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px', background: 'white', color: '#1a1a1a', borderRadius: '8px', padding: '12px 16px', width: '100%', fontSize: '15px', fontWeight: 500, border: 'none', cursor: 'pointer', transition: 'box-shadow 200ms' }}
          onMouseEnter={(e) => ((e.currentTarget as HTMLButtonElement).style.boxShadow = '0 0 0 2px rgba(196,153,42,0.5)')}
          onMouseLeave={(e) => ((e.currentTarget as HTMLButtonElement).style.boxShadow = 'none')}
        >
          <GoogleIcon />
          Registrarse con Google
        </button>

        {/* Divider */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', margin: '20px 0' }}>
          <div style={{ flex: 1, height: '1px', background: 'rgba(122,143,168,0.25)' }} />
          <span style={{ fontSize: '12px', color: 'var(--text-2)', whiteSpace: 'nowrap' }}>o regístrate express</span>
          <div style={{ flex: 1, height: '1px', background: 'rgba(122,143,168,0.25)' }} />
        </div>

        {/* Accordion trigger */}
        <button
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          style={{ border: '1px dashed rgba(196,153,42,0.6)', background: isOpen ? 'rgba(196,153,42,0.05)' : 'transparent', borderRadius: '10px', padding: '14px 20px', width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', transition: 'background 200ms' }}
          onMouseEnter={(e) => { if (!isOpen) (e.currentTarget as HTMLButtonElement).style.background = 'rgba(196,153,42,0.05)' }}
          onMouseLeave={(e) => { if (!isOpen) (e.currentTarget as HTMLButtonElement).style.background = 'transparent' }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <span style={{ fontSize: '18px', color: '#c4992a' }}>⚡</span>
            <div style={{ textAlign: 'left' }}>
              <div style={{ color: 'var(--text)', fontSize: '14px', fontWeight: 500 }}>Registro Express — solo 4 campos</div>
              <div style={{ color: 'var(--text-2)', fontSize: '11px' }}>Menos de 20 segundos</div>
            </div>
          </div>
          <span style={{ color: 'var(--text-2)', fontSize: '14px', transition: 'transform 200ms', transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)', display: 'inline-block' }}>▾</span>
        </button>

        {/* Accordion content */}
        <div style={{ overflow: 'hidden', maxHeight: isOpen ? '560px' : '0', transition: 'max-height 350ms ease' }}>
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '12px', padding: '16px 4px 4px' }}>

            {/* Name */}
            <div>
              <label style={{ display: 'block', fontSize: '12px', color: 'var(--text-2)', marginBottom: '6px' }}>Nombre completo</label>
              <input type="text" placeholder="Tu nombre y apellido" required value={name} onChange={(e) => setName(e.target.value)}
                style={inputStyle('name')}
                onFocus={(e) => (e.currentTarget.style.borderColor = '#c4992a')}
                onBlur={(e) => (e.currentTarget.style.borderColor = fieldError('name') ? '#dc2626' : 'rgba(122,143,168,0.3)')} />
            </div>

            {/* Email */}
            <div>
              <label style={{ display: 'block', fontSize: '12px', color: 'var(--text-2)', marginBottom: '6px' }}>Email</label>
              <input type="email" placeholder="tu@email.com" required value={email} onChange={(e) => setEmail(e.target.value)}
                style={inputStyle('email')}
                onFocus={(e) => (e.currentTarget.style.borderColor = '#c4992a')}
                onBlur={(e) => (e.currentTarget.style.borderColor = fieldError('email') ? '#dc2626' : 'rgba(122,143,168,0.3)')} />
              <FieldErr msg={fieldError('email')} />
            </div>

            {/* Password */}
            <div>
              <label style={{ display: 'block', fontSize: '12px', color: 'var(--text-2)', marginBottom: '6px' }}>Contraseña</label>
              <div style={{ position: 'relative' }}>
                <input
                  type={showPwd ? 'text' : 'password'}
                  placeholder="Mínimo 6 caracteres"
                  required
                  value={password}
                  onChange={(e) => { setPassword(e.target.value); if (fieldError('password')) clearAll() }}
                  style={{ ...inputStyle('password'), paddingRight: '44px' }}
                  onFocus={(e) => (e.currentTarget.style.borderColor = '#c4992a')}
                  onBlur={(e) => (e.currentTarget.style.borderColor = fieldError('password') ? '#dc2626' : 'rgba(122,143,168,0.3)')}
                />
                <button type="button" onClick={() => setShowPwd(!showPwd)} style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-2)', padding: '2px', display: 'flex', alignItems: 'center' }}>
                  {showPwd
                    ? <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24" /><line x1="1" y1="1" x2="23" y2="23" /></svg>
                    : <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></svg>
                  }
                </button>
              </div>
              <FieldErr msg={fieldError('password')} />
            </div>

            {/* Índice */}
            <div>
              <label style={{ display: 'block', fontSize: '12px', color: 'var(--text-2)', marginBottom: '6px' }}>Índice de hándicap (opcional)</label>
              <input type="number" min={0} max={54} step={0.1} placeholder="ej: 12.4 — déjalo vacío si no lo sabes" value={indice} onChange={(e) => setIndice(e.target.value)}
                style={{ ...baseInput, border: '1px solid rgba(122,143,168,0.3)' }}
                onFocus={(e) => (e.currentTarget.style.borderColor = '#c4992a')}
                onBlur={(e) => (e.currentTarget.style.borderColor = 'rgba(122,143,168,0.3)')} />
            </div>

            {/* Submit */}
            <button
              type="submit"
              disabled={loading}
              style={{ background: '#c4992a', color: '#070d18', fontWeight: 700, fontSize: '15px', width: '100%', borderRadius: '8px', padding: '13px', border: 'none', cursor: loading ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', opacity: loading ? 0.8 : 1, transition: 'filter 200ms', marginTop: '4px' }}
              onMouseEnter={(e) => { if (!loading) (e.currentTarget as HTMLButtonElement).style.filter = 'brightness(1.05)' }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.filter = 'brightness(1)' }}
            >
              {loading && <Spinner />}
              {loading ? 'Creando cuenta...' : 'Crear mi cuenta →'}
            </button>
            <p style={{ fontSize: '11px', color: 'var(--text-2)', textAlign: 'center', margin: '2px 0 0' }}>
              ✓ Gratis &nbsp;·&nbsp; ✓ Sin tarjeta &nbsp;·&nbsp; ✓ Sin spam
            </p>
          </form>
        </div>

        <p style={{ textAlign: 'center', fontSize: '14px', color: 'var(--text-2)', marginTop: '24px' }}>
          ¿Ya tienes cuenta?{' '}
          <Link href="/login" style={{ color: '#c4992a', textDecoration: 'none', fontWeight: 600 }}>Inicia sesión →</Link>
        </p>
      </div>
    </div>
  )
}

export default function RegisterPage() {
  return (
    <Suspense fallback={<div style={{ background: '#070d18', minHeight: '100vh' }} />}>
      <RegisterContent />
    </Suspense>
  )
}
