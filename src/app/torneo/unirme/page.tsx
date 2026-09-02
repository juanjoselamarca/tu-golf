'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function UnirmePage() {
  const router = useRouter()
  const [code, setCode] = useState('')
  const [error, setError] = useState('')

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const trimmed = code.trim()
    if (!trimmed) {
      setError('Ingresa el código del torneo')
      return
    }
    setError('')
    router.push(`/torneo/${trimmed.toLowerCase()}/unirse`)
  }

  return (
    <main
      style={{
        minHeight: '100dvh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '1.5rem',
        backgroundColor: 'var(--bg)',
        color: 'var(--text)',
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '420px',
          display: 'flex',
          flexDirection: 'column',
          gap: '1.5rem',
        }}
      >
        <div>
          <h1
            style={{
              fontFamily: 'var(--font-display)',
              fontSize: '1.5rem',
              fontWeight: 700,
              marginBottom: '0.5rem',
              color: 'var(--text)',
              textAlign: 'center',
            }}
          >
            Unirme a un torneo
          </h1>
          <p
            style={{
              fontSize: '0.9rem',
              color: 'var(--text-2)',
              lineHeight: 1.5,
            }}
          >
            Ingresa el código de 6 caracteres que te compartió el organizador
          </p>
        </div>

        <form
          onSubmit={handleSubmit}
          style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            <input
              type="text"
              value={code}
              onChange={(e) => {
                setCode(e.target.value.toUpperCase())
                if (error) setError('')
              }}
              placeholder="Ej: ABC123"
              autoFocus
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="characters"
              spellCheck={false}
              style={{
                width: '100%',
                padding: '0.875rem 1rem',
                borderRadius: '0.5rem',
                border: `1px solid ${error ? 'var(--error, #ef4444)' : 'var(--border)'}`,
                backgroundColor: 'var(--bg-surface)',
                color: 'var(--text)',
                fontSize: '1.25rem',
                fontWeight: 700,
                letterSpacing: '0.15em',
                textAlign: 'center',
                textTransform: 'uppercase',
                outline: 'none',
                boxSizing: 'border-box',
              }}
            />
            {error && (
              <p
                role="alert"
                style={{
                  fontSize: '0.8rem',
                  color: 'var(--error, #ef4444)',
                  textAlign: 'center',
                }}
              >
                {error}
              </p>
            )}
          </div>

          <button
            type="submit"
            style={{
              width: '100%',
              padding: '0.875rem 1rem',
              borderRadius: '0.5rem',
              border: 'none',
              backgroundColor: 'var(--brand)',
              color: '#fff',
              fontSize: '1rem',
              fontWeight: 600,
              cursor: 'pointer',
              letterSpacing: '0.01em',
            }}
          >
            Buscar torneo
          </button>
        </form>

        <div
          style={{
            textAlign: 'center',
            padding: '1rem',
            borderTop: '1px solid var(--border)',
            marginTop: '0.5rem',
          }}
        >
          <p
            style={{
              fontSize: '0.8rem',
              color: 'var(--text-3)',
              lineHeight: 1.5,
            }}
          >
            ¿No tienes código? Pide el QR al organizador de tu torneo
          </p>
        </div>
      </div>
    </main>
  )
}
