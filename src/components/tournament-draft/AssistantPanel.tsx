'use client'

// src/components/tournament-draft/AssistantPanel.tsx
//
// Orquestador del chat con el asistente IA del editor de torneos.
// NOTA: este NO es tAIger+ (el coach de golf). Es un servicio separado con su propio
// endpoint (/api/torneos/draft/[id]/assistant), system prompt específico de extracción
// de configuración de torneos, y sin acceso al historial del coach.
// - Mantiene el historial local de mensajes (no se persiste server-side
//   en este wave; cada sesión es un thread efímero).
// - Hace POST a `/api/torneos/draft/[id]/assistant` con cada mensaje
//   del organizador.
// - Cuando el server responde OK, invoca onChangeApplied con el config
//   completo devuelto por el server (fuente de verdad) y muestra el
//   UndoToast.
// - Mapea errores HTTP (429, 502, 503, 401, 404, 409) a copy en español.
// - Sin emojis. Tipografía DM Sans, acento gold de marca.

import { useEffect, useRef, useState } from 'react'
import AssistantMessages from './AssistantMessages'
import AssistantInput from './AssistantInput'
import { UndoToast } from './UndoToast'
import type {
  AssistantApiError,
  AssistantApiResponse,
  AssistantMessage,
  AssistantPanelProps,
} from './types'

const DEFAULT_GREETING: AssistantMessage = {
  id: 'init-greeting',
  role: 'assistant',
  text: 'Hola. Dime el torneo en una frase y voy llenando la configuración. Tú confirmas lo que falte.',
  timestamp: Date.now(),
}

function makeId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

function endpointUrl(draftId: string, override?: string): string {
  if (override) return override
  return `/api/torneos/draft/${encodeURIComponent(draftId)}/assistant`
}

function errorMessageForStatus(status: number, body: AssistantApiError | null): string {
  if (status === 429) {
    if (body?.error === 'loop_detected') {
      return 'Mensaje repetido varias veces. Espera 10 minutos y prueba de nuevo.'
    }
    return 'Estás enviando muchos mensajes seguidos. Prueba en unos minutos.'
  }
  if (status === 502) return 'El asistente no pudo procesar eso, reformúlalo.'
  if (status === 503) return 'El asistente no está disponible ahora. Edítalo manualmente.'
  if (status === 401) return 'Sesión expirada. Vuelve a entrar.'
  if (status === 404) return 'No encuentro este borrador. Recarga la página.'
  if (status === 409) return 'Otro admin editó este borrador. Recarga la página.'
  return 'Error inesperado. Intenta de nuevo.'
}

export default function AssistantPanel({
  draftId,
  onChangeApplied,
  onUndo,
  initialMessages,
  endpointOverride,
  className,
}: AssistantPanelProps) {
  const [messages, setMessages] = useState<AssistantMessage[]>(
    initialMessages && initialMessages.length > 0 ? initialMessages : [DEFAULT_GREETING],
  )
  const [loading, setLoading] = useState(false)
  const [toast, setToast] = useState<{ id: string; message: string } | null>(null)

  // Evita race conditions si llegan respuestas en orden distinto al envío.
  const inFlightRef = useRef(0)

  // Reset del chat si cambia el draftId (navegación entre borradores).
  useEffect(() => {
    setMessages(
      initialMessages && initialMessages.length > 0 ? initialMessages : [DEFAULT_GREETING],
    )
    setToast(null)
    inFlightRef.current = 0
    // initialMessages se asume estable; si el caller la recrea cada render
    // el reset puede ser ruidoso, pero el caso normal es estable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftId])

  const appendMessage = (msg: AssistantMessage) => {
    setMessages((prev) => [...prev, msg])
  }

  const handleSend = async (text: string) => {
    const userMsg: AssistantMessage = {
      id: makeId('u'),
      role: 'user',
      text,
      timestamp: Date.now(),
    }
    appendMessage(userMsg)

    const reqId = ++inFlightRef.current
    setLoading(true)

    try {
      const res = await fetch(endpointUrl(draftId, endpointOverride), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text }),
      })

      // Si llegó otra respuesta más nueva, descartamos esta.
      if (reqId !== inFlightRef.current) return

      let body: AssistantApiResponse | AssistantApiError | null = null
      try {
        body = (await res.json()) as AssistantApiResponse | AssistantApiError
      } catch {
        body = null
      }

      if (!res.ok) {
        const errBody = (body && 'error' in body ? body : null) as AssistantApiError | null
        const text = errorMessageForStatus(res.status, errBody)
        appendMessage({
          id: makeId('s'),
          role: 'system',
          text,
          timestamp: Date.now(),
          severity: 'error',
        })
        return
      }

      // Success path. Esperamos shape AssistantApiResponse.
      const ok = body as AssistantApiResponse | null
      if (!ok || !ok.draft || !ok.draft.config) {
        appendMessage({
          id: makeId('s'),
          role: 'system',
          text: 'Respuesta inesperada del servidor. Intenta de nuevo.',
          timestamp: Date.now(),
          severity: 'error',
        })
        return
      }

      const nextConfig = ok.draft.config
      const explanation = ok.explanation || 'Listo.'
      const needsConfirmation = ok.needs_confirmation || []

      // El partial "informativo" es el config completo; el editor decide
      // si diffea o resalta todos los campos.
      onChangeApplied(nextConfig, nextConfig, explanation, needsConfirmation)

      appendMessage({
        id: makeId('a'),
        role: 'assistant',
        text: explanation,
        timestamp: Date.now(),
        needsConfirmation: needsConfirmation.length > 0 ? needsConfirmation : undefined,
      })

      // Toast solo si hay onUndo (si el editor no quiere undo, no lo
      // mostramos para no confundir).
      if (onUndo) {
        setToast({ id: makeId('t'), message: 'El asistente aplicó cambios.' })
      }
    } catch (err) {
      // Si llegó otra respuesta más nueva, descartamos esta.
      if (reqId !== inFlightRef.current) return
      // eslint-disable-next-line no-console
      console.error('[AssistantPanel] fetch error:', err)
      appendMessage({
        id: makeId('s'),
        role: 'system',
        text: 'Error de red. Prueba de nuevo.',
        timestamp: Date.now(),
        severity: 'error',
      })
    } finally {
      if (reqId === inFlightRef.current) {
        setLoading(false)
      }
    }
  }

  return (
    <div
      className={className}
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        minHeight: 280,
        maxHeight: 420,
        background: 'transparent',
      }}
    >
      <div
        style={{
          padding: '12px 16px',
          borderBottom: '1px solid var(--border, #e5e7eb)',
          fontFamily: '"DM Sans", sans-serif',
          fontSize: '13px',
          color: 'var(--text-secondary, #6b7280)',
          fontWeight: 600,
          letterSpacing: '0.04em',
          textTransform: 'uppercase',
        }}
      >
        Asistente IA
      </div>
      <AssistantMessages messages={messages} loading={loading} />
      <AssistantInput onSend={handleSend} disabled={loading} />
      {toast && onUndo && (
        <UndoToast
          key={toast.id}
          message={toast.message}
          onUndo={() => {
            onUndo()
          }}
          onDismiss={() => setToast(null)}
          durationMs={5000}
        />
      )}
    </div>
  )
}
