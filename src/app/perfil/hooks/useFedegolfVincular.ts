'use client'
import { useState } from 'react'
import { captureError } from '@/lib/error-tracking'

/**
 * Vincular / desvincular la cuenta FedeGolf del usuario.
 *
 * Habla SIEMPRE con el backend existente (POST/DELETE /api/fedegolf/vincular),
 * que hace el login real en fedegolf.cl, cifra las credenciales y guarda la fila
 * en fedegolf_credentials. Este hook NO toca Supabase directo — solo el endpoint.
 *
 * El estado de vinculación (`FedegolfStatus`) lo trae el server component y lo
 * mantiene PerfilView; este hook informa los cambios vía onLinked / onUnlinked
 * para que la card del índice y el perfil se actualicen sin recargar.
 */

interface Options {
  /** Se llama al vincular OK. `indice` es el índice traído de FedeGolf (o null). */
  onLinked: (indice: number | null) => void
  /** Se llama al desvincular OK. */
  onUnlinked: () => void
}

/** Normaliza el RUT: sin puntos, con guion, cuerpo + dígito verificador en mayúscula. */
export function normalizeRut(raw: string): string {
  const clean = raw.trim().replace(/\./g, '').replace(/\s/g, '').replace(/-/g, '').toUpperCase()
  if (clean.length < 2) return clean
  return `${clean.slice(0, -1)}-${clean.slice(-1)}`
}

export function useFedegolfVincular({ onLinked, onUnlinked }: Options) {
  const [submitting, setSubmitting] = useState(false)
  const [unlinking, setUnlinking] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const clearError = () => setError(null)

  const vincular = async (rut: string, password: string): Promise<boolean> => {
    if (submitting) return false
    setError(null)

    const rutNorm = normalizeRut(rut)
    if (!rutNorm || rutNorm.length < 3 || !password.trim()) {
      setError('Ingresa tu RUT y clave de FedeGolf.')
      return false
    }

    setSubmitting(true)
    try {
      const res = await fetch('/api/fedegolf/vincular', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rut: rutNorm, password }),
      })
      const body = (await res.json().catch(() => null)) as
        | { ok?: boolean; indice?: number | null; error?: string }
        | null

      if (!res.ok || !body?.ok) {
        // El 400 del endpoint significa login rechazado por fedegolf.cl. Mostramos
        // un mensaje limpio en vez del string técnico del backend ("login fallido
        // (status 400)…"). Otros códigos: mostramos el error del server si viene.
        const msg = res.status === 400
          ? 'No pudimos entrar a FedeGolf. Revisa tu RUT y clave, e intenta de nuevo.'
          : (body?.error || 'No se pudo vincular. Intenta de nuevo en un momento.')
        setError(msg)
        return false
      }

      onLinked(body.indice ?? null)
      return true
    } catch (err) {
      captureError(err, { context: 'useFedegolfVincular.vincular' })
      setError('Error de conexión. Intenta de nuevo.')
      return false
    } finally {
      setSubmitting(false)
    }
  }

  const desvincular = async (): Promise<boolean> => {
    if (unlinking) return false
    setError(null)
    setUnlinking(true)
    try {
      const res = await fetch('/api/fedegolf/vincular', { method: 'DELETE' })
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null
        setError(body?.error || 'No se pudo desvincular. Intenta de nuevo.')
        return false
      }
      onUnlinked()
      return true
    } catch (err) {
      captureError(err, { context: 'useFedegolfVincular.desvincular' })
      setError('Error de conexión. Intenta de nuevo.')
      return false
    } finally {
      setUnlinking(false)
    }
  }

  return { vincular, desvincular, submitting, unlinking, error, clearError }
}
