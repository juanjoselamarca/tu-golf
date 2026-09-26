'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'

export default function UnirmePage() {
  const router = useRouter()
  const [code, setCode] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const trimmed = code.trim().toUpperCase()
    if (!trimmed) {
      setError('Ingresa el código del torneo')
      return
    }
    setError('')
    setLoading(true)

    try {
      const supabase = createClient()
      const { data, error: dbError } = await supabase
        .from('tournaments')
        .select('slug')
        .eq('codigo', trimmed)
        .single()

      if (dbError || !data?.slug) {
        setError('No se encontró un torneo con ese código. Revisa e intenta de nuevo.')
        setLoading(false)
        return
      }

      router.push(`/torneo/${data.slug}/unirse`)
    } catch {
      setError('Error al buscar el torneo. Intenta de nuevo.')
      setLoading(false)
    }
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
              fontFamily: 'var(--font-display, "Playfair Display", serif)',
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
                border: `1px solid ${error ? 'var(--error)' : 'var(--border)'}`,
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
                  color: 'var(--error)',
                  textAlign: 'center',
                }}
              >
                {error}
              </p>
            )}
          </div>

          <button
            type="submit"
            disabled={loading}
            style={{
              width: '100%',
              padding: '0.875rem 1rem',
              borderRadius: '0.5rem',
              border: 'none',
              backgroundColor: 'var(--brand)',
              color: 'var(--brand-dark)',
              fontSize: '1rem',
              fontWeight: 600,
              cursor: loading ? 'wait' : 'pointer',
              letterSpacing: '0.01em',
              opacity: loading ? 0.7 : 1,
            }}
          >
            {loading ? 'Buscando...' : 'Buscar torneo'}
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
