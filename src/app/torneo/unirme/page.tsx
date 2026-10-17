'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { buscarSlugPorCodigo, normalizarCodigoTorneo } from '@/lib/data/tournaments/joinFlow'
import { Input } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'

export default function UnirmePage() {
  const router = useRouter()
  const [code, setCode] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!normalizarCodigoTorneo(code)) {
      setError('Ingresa el código del torneo')
      return
    }
    setError('')
    setLoading(true)

    try {
      const res = await buscarSlugPorCodigo(createClient(), code)
      if (res.ok) {
        router.push(`/torneo/${res.slug}/unirse`)
        return
      }
      setError(res.motivo === 'no_existe'
        ? 'No se encontró un torneo con ese código. Revisa e intenta de nuevo.'
        : 'No pudimos buscar el torneo. Revisa tu señal y vuelve a intentarlo.')
      setLoading(false)
    } catch {
      setError('No pudimos buscar el torneo. Revisa tu señal y vuelve a intentarlo.')
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
              fontFamily: 'var(--font-playfair, "Playfair Display", serif)',
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
              textAlign: 'center',
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
            {/* ui/Input: borde compartido de 2px (más visible que el 1px de antes; el token --input-border aún no da 3:1),
                foco visible y borde rojo con error. Antes el error usaba var(--error),
                que no existe: el borde desaparecía y el mensaje no salía en rojo. */}
            <Input
              type="text"
              error={!!error}
              aria-invalid={!!error || undefined}
              aria-label="Código del torneo"
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
              className="h-14"
              style={{
                width: '100%',
                color: 'var(--text)',
                fontSize: '1.25rem',
                fontWeight: 700,
                fontFamily: 'var(--font-dm-mono), monospace',
                letterSpacing: '0.15em',
                textAlign: 'center',
                textTransform: 'uppercase',
              }}
            />
            {error && (
              <p
                role="alert"
                style={{
                  fontSize: '0.8rem',
                  color: 'var(--error-fg)',
                  textAlign: 'center',
                }}
              >
                {error}
              </p>
            )}
          </div>

          <Button type="submit" variant="commit" size="lg" fullWidth disabled={loading}>
            {loading ? 'Buscando...' : 'Buscar torneo'}
          </Button>
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
