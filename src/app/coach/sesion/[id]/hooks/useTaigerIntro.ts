'use client'

import { useEffect, useState } from 'react'

interface UseTaigerIntroResult {
  opener: string | null
  /** setter expuesto para limpiar el opener al materializarlo en el primer turno. */
  setOpener: React.Dispatch<React.SetStateAction<string | null>>
  openerLoading: boolean
}

/**
 * Opener proactivo: cuando la sesión está vacía, trae un saludo personalizado
 * desde /api/taiger/intro. No persiste en BD — si el usuario responde, se
 * materializa como primer turno dentro de handleSend (ver useTaigerChat).
 *
 * Comportamiento idéntico al useEffect original (page.tsx:90-100): fallback
 * silencioso si falla; no se dispara si ya hay mensajes o ya se cargó.
 */
export function useTaigerIntro(loadingSession: boolean, messagesLength: number): UseTaigerIntroResult {
  const [opener, setOpener] = useState<string | null>(null)
  const [openerLoading, setOpenerLoading] = useState(false)

  useEffect(() => {
    if (loadingSession) return
    if (messagesLength > 0) return
    if (opener || openerLoading) return
    setOpenerLoading(true)
    fetch('/api/taiger/intro', { credentials: 'include' })
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d?.opener) setOpener(d.opener) })
      .catch(() => { /* fallback silencioso: queda el espacio vacio */ })
      .finally(() => setOpenerLoading(false))
  }, [loadingSession, messagesLength, opener, openerLoading])

  return { opener, setOpener, openerLoading }
}
