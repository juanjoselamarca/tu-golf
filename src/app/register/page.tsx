'use client'

import { Suspense, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { useToast } from '@/hooks/useToast'
import { useFormErrors } from '@/hooks/useFormErrors'
import { Zap, Check, Mail, ArrowLeft } from '@/components/icons'

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

const theme = {
  bg:         '#ffffff',
  card:       '#ffffff',
  text:       '#1a1a2e',
  textMuted:  '#4a5568',
  textFaint:  '#94a3b8',
  border:     '#e2e8f0',
  borderSoft: '#edf1f5',
  gold:       '#c4992a',
  danger:     '#dc2626',
}

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: '11px',
  color: theme.textMuted,
  marginBottom: '8px',
  fontFamily: '"DM Mono", ui-monospace, monospace',
  fontWeight: 600,
  letterSpacing: '0.08em',
  textTransform: 'uppercase' as const,
}

const baseInput: React.CSSProperties = {
  background:   '#ffffff',
  color:        theme.text,
  borderRadius: '10px',
  padding:      '13px 14px',
  width:        '100%',
  fontSize:     '15px',
  outline:      'none',
  transition:   'border-color 200ms, box-shadow 200ms',
  boxSizing:    'border-box' as const,
  fontFamily:   'inherit',
}

function FieldErr({ msg }: { msg: string | null }) {
  if (!msg) return null
  return <p style={{ color: theme.danger, fontSize: '12px', marginTop: '6px' }}>{msg}</p>
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
  const redirectTo = searchParams.get('redirect') || searchParams.get('next') || '/dashboard'

  const [isOpen,   setIsOpen]   = useState(true)
  const [name,     setName]     = useState('')
  const [email,    setEmail]    = useState('')
  const [password, setPassword] = useState('')
  const [indice,   setIndice]   = useState('')
  const [showPwd,  setShowPwd]  = useState(false)
  const [loading,  setLoading]  = useState(false)
  const [pendingConfirmation, setPendingConfirmation] = useState(false)
  const [resending, setResending] = useState(false)
  const [resent, setResent] = useState(false)

  const handleGoogle = async () => {
    if (typeof window !== 'undefined' && redirectTo !== '/dashboard') {
      localStorage.setItem('golfers_post_login_redirect', redirectTo)
    }
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
    const { data, error } = await supabase.auth.signUp({
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
    } else if (!data.session || data.user?.identities?.length === 0) {
      // Email confirmation required — show confirmation screen
      setLoading(false)
      setPendingConfirmation(true)
    } else {
      // Add welcome flag for new users going to dashboard
      const dest = redirectTo === '/dashboard' ? '/dashboard?welcome=true' : redirectTo
      router.push(dest)
    }
  }

  const handleResend = async () => {
    setResending(true)
    setResent(false)
    const supabase = createClient()
    await supabase.auth.resend({ type: 'signup', email })
    setResending(false)
    setResent(true)
  }

  if (pendingConfirmation) {
    return (
      <div
        style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: theme.bg,
          padding: '24px 16px',
        }}
      >
        <div
          style={{
            position: 'relative',
            zIndex: 10,
            background: theme.card,
            border: `1px solid ${theme.border}`,
            borderRadius: '20px',
            boxShadow: '0 1px 3px rgba(15,23,42,0.04), 0 20px 50px -20px rgba(15,23,42,0.12)',
            padding: 'clamp(32px, 6vw, 48px)',
            maxWidth: '440px',
            width: '100%',
            textAlign: 'center',
          }}
        >
          <div style={{
            width: '64px',
            height: '64px',
            borderRadius: '50%',
            background: 'rgba(196,153,42,0.10)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 24px',
          }}>
            <Mail size={28} color={theme.gold} strokeWidth={1.5} />
          </div>

          <h1 style={{
            fontFamily: '"Playfair Display", serif',
            fontSize: '30px',
            color: theme.text,
            margin: '0 0 12px',
            letterSpacing: '-0.01em',
            lineHeight: 1.15,
          }}>
            Revisa tu correo
          </h1>

          <p style={{
            fontSize: '15px',
            color: theme.textMuted,
            lineHeight: 1.6,
            margin: '0 0 28px',
          }}>
            Te enviamos un link a <strong style={{ color: theme.text, fontWeight: 600 }}>{email}</strong> para confirmar tu cuenta.
            Revisa tu bandeja de entrada y carpeta de spam.
          </p>

          <button
            onClick={handleResend}
            disabled={resending}
            style={{
              background: 'transparent',
              color: theme.gold,
              border: `1px solid ${theme.gold}`,
              borderRadius: '10px',
              padding: '13px 24px',
              fontSize: '14px',
              fontWeight: 600,
              cursor: resending ? 'not-allowed' : 'pointer',
              opacity: resending ? 0.7 : 1,
              transition: 'all 200ms',
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
            }}
          >
            {resending ? <Spinner /> : null}
            {resending ? 'Reenviando...' : resent ? 'Email reenviado' : 'Reenviar email'}
          </button>

          {resent && (
            <p style={{ fontSize: '12px', color: '#16a34a', marginTop: '10px' }}>
              Revisa tu bandeja de entrada nuevamente.
            </p>
          )}

          <Link
            href="/login"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              color: theme.textMuted,
              fontSize: '14px',
              textDecoration: 'none',
              marginTop: '28px',
              transition: 'color 200ms',
            }}
          >
            <ArrowLeft size={16} />
            Volver al login
          </Link>
        </div>
      </div>
    )
  }

  const inputStyle = (field: string): React.CSSProperties => ({
    ...baseInput,
    border: `1px solid ${fieldError(field) ? theme.danger : theme.border}`,
  })

  return (
    <div
      style={{
        minHeight:          '100vh',
        display:            'flex',
        alignItems:         'center',
        justifyContent:     'center',
        background:         theme.bg,
        position:           'relative',
        padding:            '24px 16px',
      }}
    >

      <div
        style={{
          position:             'relative',
          zIndex:               10,
          background:           theme.card,
          border:               `1px solid ${theme.border}`,
          borderRadius:         '20px',
          boxShadow:            '0 1px 3px rgba(15,23,42,0.04), 0 20px 50px -20px rgba(15,23,42,0.12)',
          padding:              'clamp(28px, 6vw, 44px)',
          maxWidth:             '440px',
          width:                '100%',
        }}
      >
        <div style={{ textAlign: 'center', marginBottom: '4px' }}>
          <span style={{ fontFamily: '"Playfair Display", serif', fontSize: '28px', color: theme.text, fontWeight: 700, letterSpacing: '-0.01em' }}>Golfers<span style={{ color: theme.gold }}>+</span></span>
        </div>
        <h1 style={{ fontFamily: '"Playfair Display", serif', fontSize: '30px', color: theme.text, textAlign: 'center', margin: '14px 0 6px', letterSpacing: '-0.015em', lineHeight: 1.15, fontWeight: 600 }}>Crea tu cuenta</h1>
        <p style={{ fontSize: '15px', color: theme.textMuted, textAlign: 'center', marginBottom: '32px', lineHeight: 1.5 }}>Únete a la comunidad de golfistas</p>

        {/* Google */}
        <button
          onClick={handleGoogle}
          style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px', background: '#ffffff', color: theme.text, borderRadius: '10px', padding: '13px 16px', width: '100%', fontSize: '15px', fontWeight: 500, border: `1px solid ${theme.border}`, cursor: 'pointer', transition: 'box-shadow 200ms, border-color 200ms' }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.boxShadow = '0 2px 8px rgba(15,23,42,0.08)'; (e.currentTarget as HTMLButtonElement).style.borderColor = '#cbd5e0' }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.boxShadow = 'none'; (e.currentTarget as HTMLButtonElement).style.borderColor = theme.border }}
        >
          <GoogleIcon />
          Registrarse con Google
        </button>

        {/* Divider */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', margin: '24px 0' }}>
          <div style={{ flex: 1, height: '1px', background: theme.borderSoft }} />
          <span style={{ fontSize: '11px', color: theme.textFaint, whiteSpace: 'nowrap', fontFamily: '"DM Mono", ui-monospace, monospace', letterSpacing: '0.08em', textTransform: 'uppercase' }}>o con email</span>
          <div style={{ flex: 1, height: '1px', background: theme.borderSoft }} />
        </div>

        {/* Accordion trigger */}
        <button
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          style={{ border: `1px solid ${isOpen ? theme.gold : theme.border}`, background: isOpen ? 'rgba(196,153,42,0.04)' : '#ffffff', borderRadius: '10px', padding: '14px 16px', width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', transition: 'background 200ms, border-color 200ms' }}
          onMouseEnter={(e) => { if (!isOpen) (e.currentTarget as HTMLButtonElement).style.borderColor = '#cbd5e0' }}
          onMouseLeave={(e) => { if (!isOpen) (e.currentTarget as HTMLButtonElement).style.borderColor = theme.border }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <Zap size={18} color={theme.gold} strokeWidth={1.5} />
            <div style={{ textAlign: 'left' }}>
              <div style={{ color: theme.text, fontSize: '14px', fontWeight: 600 }}>Registro con email y contraseña</div>
              <div style={{ color: theme.textMuted, fontSize: '11px', marginTop: '2px' }}>Nombre, email, contraseña e índice (opcional)</div>
            </div>
          </div>
          <span style={{ color: theme.textMuted, fontSize: '14px', transition: 'transform 200ms', transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)', display: 'inline-block' }}>▾</span>
        </button>

        {/* Accordion content */}
        <div style={{ overflow: 'hidden', maxHeight: isOpen ? '600px' : '0', transition: 'max-height 350ms ease' }}>
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px', padding: '20px 2px 2px' }}>

            {/* Name */}
            <div>
              <label style={labelStyle}>Nombre completo</label>
              <input type="text" placeholder="Tu nombre y apellido" required value={name} onChange={(e) => setName(e.target.value)}
                style={inputStyle('name')}
                onFocus={(e) => { e.currentTarget.style.borderColor = theme.gold; e.currentTarget.style.boxShadow = '0 0 0 3px rgba(196,153,42,0.12)' }}
                onBlur={(e) => { e.currentTarget.style.borderColor = fieldError('name') ? theme.danger : theme.border; e.currentTarget.style.boxShadow = 'none' }} />
            </div>

            {/* Email */}
            <div>
              <label style={labelStyle}>Email</label>
              <input type="email" placeholder="tu@email.com" required value={email} onChange={(e) => setEmail(e.target.value)}
                style={inputStyle('email')}
                onFocus={(e) => { e.currentTarget.style.borderColor = theme.gold; e.currentTarget.style.boxShadow = '0 0 0 3px rgba(196,153,42,0.12)' }}
                onBlur={(e) => { e.currentTarget.style.borderColor = fieldError('email') ? theme.danger : theme.border; e.currentTarget.style.boxShadow = 'none' }} />
              <FieldErr msg={fieldError('email')} />
            </div>

            {/* Password */}
            <div>
              <label style={labelStyle}>Contraseña</label>
              <div style={{ position: 'relative' }}>
                <input
                  type={showPwd ? 'text' : 'password'}
                  placeholder="Mínimo 6 caracteres"
                  required
                  value={password}
                  onChange={(e) => { setPassword(e.target.value); if (fieldError('password')) clearAll() }}
                  style={{ ...inputStyle('password'), paddingRight: '44px' }}
                  onFocus={(e) => { e.currentTarget.style.borderColor = theme.gold; e.currentTarget.style.boxShadow = '0 0 0 3px rgba(196,153,42,0.12)' }}
                  onBlur={(e) => { e.currentTarget.style.borderColor = fieldError('password') ? theme.danger : theme.border; e.currentTarget.style.boxShadow = 'none' }}
                />
                <button type="button" onClick={() => setShowPwd(!showPwd)} style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: theme.textMuted, padding: '2px', display: 'flex', alignItems: 'center' }}>
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
              <label style={labelStyle}>Índice de hándicap <span style={{ textTransform: 'none', letterSpacing: 0, fontWeight: 400, color: theme.textFaint }}>(opcional)</span></label>
              <input type="text" inputMode="decimal" pattern="[0-9]*[.,]?[0-9]*" placeholder="ej: 12.4 — si no lo sabes, déjalo vacío" value={indice} onChange={(e) => setIndice(e.target.value)}
                style={{ ...baseInput, border: `1px solid ${theme.border}` }}
                onFocus={(e) => { e.currentTarget.style.borderColor = theme.gold; e.currentTarget.style.boxShadow = '0 0 0 3px rgba(196,153,42,0.12)' }}
                onBlur={(e) => { e.currentTarget.style.borderColor = theme.border; e.currentTarget.style.boxShadow = 'none'; const v = e.target.value.replace(',', '.'); const n = parseFloat(v); if (!isNaN(n) && n >= 0 && n <= 54) setIndice(String(n)) }} />
            </div>

            {/* Aceptación de términos */}
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', margin: '6px 0 2px' }}>
              <input
                type="checkbox"
                id="acepta-terminos"
                required
                style={{ marginTop: '2px', flexShrink: 0, width: '16px', height: '16px', accentColor: theme.gold, cursor: 'pointer' }}
              />
              <label htmlFor="acepta-terminos" style={{
                fontSize: '12px', color: theme.textMuted, lineHeight: 1.5, cursor: 'pointer',
              }}>
                Acepto los{' '}
                <a href="/terminos" target="_blank" rel="noopener" style={{ color: theme.gold, textDecoration: 'underline', fontWeight: 500 }}>
                  Términos
                </a>{' '}y la{' '}
                <a href="/privacidad" target="_blank" rel="noopener" style={{ color: theme.gold, textDecoration: 'underline', fontWeight: 500 }}>
                  Política de Privacidad
                </a>
              </label>
            </div>

            {/* Submit */}
            <button
              type="submit"
              disabled={loading}
              style={{ background: theme.gold, color: '#ffffff', fontWeight: 600, fontSize: '15px', width: '100%', borderRadius: '12px', padding: '14px', border: 'none', cursor: loading ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', opacity: loading ? 0.8 : 1, transition: 'filter 200ms, box-shadow 200ms', marginTop: '6px', boxShadow: '0 2px 10px rgba(196,153,42,0.25)' }}
              onMouseEnter={(e) => { if (!loading) { (e.currentTarget as HTMLButtonElement).style.filter = 'brightness(1.05)'; (e.currentTarget as HTMLButtonElement).style.boxShadow = '0 4px 14px rgba(196,153,42,0.35)' } }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.filter = 'brightness(1)'; (e.currentTarget as HTMLButtonElement).style.boxShadow = '0 2px 10px rgba(196,153,42,0.25)' }}
            >
              {loading && <Spinner />}
              {loading ? 'Creando cuenta...' : 'Crear mi cuenta →'}
            </button>
            <p style={{ fontSize: '11px', color: theme.textFaint, textAlign: 'center', margin: '6px 0 0', fontFamily: '"DM Mono", ui-monospace, monospace', letterSpacing: '0.05em' }}>
              <Check size={11} strokeWidth={2.5} style={{ display: 'inline', verticalAlign: 'middle' }} /> GRATIS &nbsp;·&nbsp; <Check size={11} strokeWidth={2.5} style={{ display: 'inline', verticalAlign: 'middle' }} /> SIN TARJETA &nbsp;·&nbsp; <Check size={11} strokeWidth={2.5} style={{ display: 'inline', verticalAlign: 'middle' }} /> SIN SPAM
            </p>
          </form>
        </div>

        <p style={{ textAlign: 'center', fontSize: '14px', color: theme.textMuted, marginTop: '28px' }}>
          ¿Ya tienes cuenta?{' '}
          <Link href={`/login${redirectTo !== '/dashboard' ? `?next=${encodeURIComponent(redirectTo)}` : ''}`} style={{ color: theme.gold, textDecoration: 'none', fontWeight: 600 }}>Inicia sesión →</Link>
        </p>
      </div>
    </div>
  )
}

export default function RegisterPage() {
  return (
    <Suspense fallback={<div style={{ background: '#ffffff', minHeight: '100vh' }} />}>
      <RegisterContent />
    </Suspense>
  )
}
