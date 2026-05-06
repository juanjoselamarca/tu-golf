'use client'

/**
 * Playground sandbox del coach — corre tAIger+ contra cualquier usuario
 * sin afectar su sesion real, salvo que el toggle "enviar al usuario" este ON.
 *
 * Spec: docs/superpowers/plans/2026-05-05-cerebro-v2.md §6.3 (D5).
 */

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { adminColors, adminFonts, adminCard } from '@/components/admin/admin-tokens'

interface UserOption {
  id: string
  name: string | null
  email: string | null
  indice: number | null
}

interface ToolCallTrace {
  tool: string
  input: Record<string, unknown>
  output_preview: string
  ok: boolean
  ms: number
}

interface PlaygroundResult {
  profile: { id: string; name: string | null; email: string | null; indice: number | null }
  contextString: string
  systemPrompt: string
  response: string
  toolCalls: ToolCallTrace[]
  usage: { input: number; output: number; cache_read: number; cache_create: number }
  persisted: boolean
  sandbox: boolean
}

interface ConvMsg {
  role: 'user' | 'assistant'
  content: string
}

export default function PlaygroundPage() {
  const [users, setUsers] = useState<UserOption[]>([])
  const [search, setSearch] = useState('')
  const [selectedUserId, setSelectedUserId] = useState<string>('')
  const [message, setMessage] = useState('')
  const [conversation, setConversation] = useState<ConvMsg[]>([])
  const [sendToUser, setSendToUser] = useState(false)
  const [confirmSend, setConfirmSend] = useState(false)
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<PlaygroundResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [showSystem, setShowSystem] = useState(false)
  const [showContext, setShowContext] = useState(false)

  useEffect(() => {
    const ctrl = new AbortController()
    const t = setTimeout(() => {
      const url = `/api/admin/users?limit=20&search=${encodeURIComponent(search)}`
      fetch(url, { signal: ctrl.signal, credentials: 'include' })
        .then(r => r.json())
        .then(j => {
          if (Array.isArray(j.users)) setUsers(j.users as UserOption[])
        })
        .catch(() => {})
    }, 300)
    return () => {
      ctrl.abort()
      clearTimeout(t)
    }
  }, [search])

  async function send() {
    if (!selectedUserId || !message.trim()) return
    if (sendToUser && !confirmSend) {
      setError('Marca "confirmar envio" para mandar el mensaje al usuario real.')
      return
    }
    setLoading(true)
    setError(null)
    setResult(null)
    try {
      const res = await fetch('/api/admin/taiger/playground', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          targetUserId: selectedUserId,
          message,
          conversation,
          sendToUser,
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'fallo desconocido')
      setResult(json)
      // Conversacion local: solo crece en sandbox. Cuando se envia al usuario
      // se persiste en su sesion real, asi que tambien la guardamos local.
      setConversation(prev => [
        ...prev,
        { role: 'user', content: message },
        { role: 'assistant', content: json.response },
      ])
      setMessage('')
      setConfirmSend(false)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'fallo')
    } finally {
      setLoading(false)
    }
  }

  function resetConversation() {
    setConversation([])
    setResult(null)
    setError(null)
  }

  const selectedUser = users.find(u => u.id === selectedUserId)

  return (
    <div style={{ minHeight: '100vh', background: adminColors.bg, color: adminColors.ivory, padding: '32px 24px' }}>
      <div style={{ maxWidth: 1100, margin: '0 auto' }}>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 24 }}>
          <h1 style={{ ...adminFonts.sectionTitle, fontSize: '1.6rem', color: adminColors.gold, margin: 0 }}>
            Playground · tAIger+
          </h1>
          <Link href="/admin/sistema/taiger" style={{ color: adminColors.gray, fontSize: 14, textDecoration: 'none' }}>
            ← volver al cerebro
          </Link>
        </div>

        <div style={{
          ...adminCard,
          padding: 16,
          marginBottom: 16,
          background: sendToUser ? adminColors.redDim : adminCard.background,
          borderColor: sendToUser ? adminColors.red : adminColors.border,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <div style={{ fontSize: 13, color: adminColors.gray, marginBottom: 4 }}>Modo</div>
              <div style={{ fontSize: 16, fontWeight: 600, color: sendToUser ? adminColors.red : adminColors.green }}>
                {sendToUser ? 'ENVIAR AL USUARIO REAL' : 'SANDBOX (no persiste nada)'}
              </div>
            </div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={sendToUser}
                onChange={e => { setSendToUser(e.target.checked); setConfirmSend(false) }}
                aria-label="Enviar al usuario"
              />
              <span style={{ fontSize: 13, color: adminColors.gray }}>enviar al usuario real</span>
            </label>
          </div>
          {sendToUser && (
            <div style={{ marginTop: 12, padding: 12, background: adminColors.bg, borderRadius: 6 }}>
              <div style={{ fontSize: 13, color: adminColors.red, marginBottom: 8, fontWeight: 600 }}>
                ⚠ El proximo mensaje se persistira en la sesion real del usuario, marcado como sent_by_admin=true.
              </div>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: adminColors.ivory, cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={confirmSend}
                  onChange={e => setConfirmSend(e.target.checked)}
                  aria-label="Confirmar envio"
                />
                confirmar envio
              </label>
            </div>
          )}
        </div>

        <div style={{ ...adminCard, padding: 16, marginBottom: 16 }}>
          <div style={{ fontSize: 13, color: adminColors.gray, marginBottom: 8 }}>1. Elegir usuario</div>
          <input
            type="text"
            placeholder="buscar por nombre o email..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{
              width: '100%',
              padding: '8px 12px',
              background: adminColors.bg,
              border: `1px solid ${adminColors.border}`,
              color: adminColors.ivory,
              borderRadius: 6,
              fontSize: 14,
              marginBottom: 8,
            }}
          />
          <select
            value={selectedUserId}
            onChange={e => { setSelectedUserId(e.target.value); resetConversation() }}
            aria-label="Usuario objetivo"
            style={{
              width: '100%',
              padding: '8px 12px',
              background: adminColors.bg,
              border: `1px solid ${adminColors.border}`,
              color: adminColors.ivory,
              borderRadius: 6,
              fontSize: 14,
            }}
          >
            <option value="">— sin seleccionar —</option>
            {users.map(u => (
              <option key={u.id} value={u.id}>
                {u.name ?? '(sin nombre)'} · {u.email ?? 'sin email'} {typeof u.indice === 'number' ? `· hcp ${u.indice}` : ''}
              </option>
            ))}
          </select>
          {selectedUser && (
            <div style={{ marginTop: 8, fontSize: 13, color: adminColors.gray }}>
              <Link href={`/admin/sistema/taiger/${selectedUser.id}`} style={{ color: adminColors.blue, textDecoration: 'none' }}>
                ver cerebro de este usuario →
              </Link>
            </div>
          )}
        </div>

        {selectedUserId && (
          <div style={{ ...adminCard, padding: 16, marginBottom: 16 }}>
            <div style={{ fontSize: 13, color: adminColors.gray, marginBottom: 8 }}>2. Conversacion</div>
            {conversation.length > 0 && (
              <div style={{ marginBottom: 12 }}>
                {conversation.map((m, i) => (
                  <div key={i} style={{ marginBottom: 8 }}>
                    <div style={{ fontSize: 11, color: adminColors.gray, marginBottom: 2 }}>{m.role}</div>
                    <div style={{
                      padding: 10,
                      background: m.role === 'user' ? adminColors.bg : adminColors.cardHover,
                      borderRadius: 6,
                      fontSize: 14,
                      whiteSpace: 'pre-wrap',
                      lineHeight: 1.5,
                    }}>
                      {m.content}
                    </div>
                  </div>
                ))}
                <button
                  onClick={resetConversation}
                  style={{
                    marginTop: 4,
                    padding: '4px 10px',
                    background: 'transparent',
                    color: adminColors.gray,
                    border: `1px solid ${adminColors.border}`,
                    borderRadius: 4,
                    fontSize: 12,
                    cursor: 'pointer',
                  }}
                >
                  reset conversacion
                </button>
              </div>
            )}
            <textarea
              value={message}
              onChange={e => setMessage(e.target.value)}
              placeholder="escribi un mensaje al coach..."
              rows={4}
              aria-label="Mensaje"
              style={{
                width: '100%',
                padding: 12,
                background: adminColors.bg,
                border: `1px solid ${adminColors.border}`,
                color: adminColors.ivory,
                borderRadius: 6,
                fontSize: 14,
                resize: 'vertical',
                marginBottom: 8,
              }}
            />
            <button
              onClick={send}
              disabled={loading || !message.trim()}
              style={{
                padding: '10px 16px',
                background: sendToUser ? adminColors.red : adminColors.gold,
                color: adminColors.bg,
                border: 'none',
                borderRadius: 6,
                fontSize: 14,
                fontWeight: 600,
                cursor: loading || !message.trim() ? 'not-allowed' : 'pointer',
                opacity: loading || !message.trim() ? 0.5 : 1,
              }}
            >
              {loading ? 'pensando...' : sendToUser ? 'enviar al usuario real' : 'probar en sandbox'}
            </button>
            {error && (
              <div style={{ marginTop: 8, padding: 10, background: adminColors.redDim, border: `1px solid ${adminColors.red}`, borderRadius: 6, color: adminColors.red, fontSize: 13 }}>
                {error}
              </div>
            )}
          </div>
        )}

        {result && (
          <div style={{ ...adminCard, padding: 16, marginBottom: 16 }}>
            <div style={{ fontSize: 13, color: adminColors.gray, marginBottom: 8 }}>3. Respuesta del coach</div>

            <div style={{ display: 'flex', gap: 8, marginBottom: 12, fontSize: 12 }}>
              <span style={{ padding: '2px 8px', background: result.persisted ? adminColors.greenDim : adminColors.grayDim, color: result.persisted ? adminColors.green : adminColors.gray, borderRadius: 4 }}>
                {result.persisted ? 'persistido en sesion real' : 'sandbox · no persistido'}
              </span>
              <span style={{ padding: '2px 8px', background: adminColors.blueDim, color: adminColors.blue, borderRadius: 4 }}>
                {result.toolCalls.length} tool calls
              </span>
              <span style={{ padding: '2px 8px', background: adminColors.goldDim, color: adminColors.gold, borderRadius: 4 }}>
                in {result.usage.input}t · out {result.usage.output}t
              </span>
            </div>

            <div style={{ padding: 12, background: adminColors.bg, borderRadius: 6, fontSize: 14, whiteSpace: 'pre-wrap', lineHeight: 1.5, marginBottom: 12 }}>
              {result.response}
            </div>

            {result.toolCalls.length > 0 && (
              <div style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 12, color: adminColors.gray, marginBottom: 6 }}>tool calls</div>
                {result.toolCalls.map((t, i) => (
                  <details key={i} style={{ marginBottom: 6, padding: 8, background: adminColors.bg, borderRadius: 4, fontSize: 12 }}>
                    <summary style={{ cursor: 'pointer', color: t.ok ? adminColors.green : adminColors.red }}>
                      {t.tool} · {t.ms}ms · {t.ok ? 'ok' : 'fail'}
                    </summary>
                    <div style={{ marginTop: 6, fontFamily: 'monospace', fontSize: 11 }}>
                      <div style={{ color: adminColors.gray, marginBottom: 4 }}>input:</div>
                      <pre style={{ margin: 0, color: adminColors.ivory, whiteSpace: 'pre-wrap' }}>{JSON.stringify(t.input, null, 2)}</pre>
                      <div style={{ color: adminColors.gray, marginTop: 6, marginBottom: 4 }}>output (preview):</div>
                      <pre style={{ margin: 0, color: adminColors.ivory, whiteSpace: 'pre-wrap' }}>{t.output_preview}</pre>
                    </div>
                  </details>
                ))}
              </div>
            )}

            <details open={showContext} onToggle={e => setShowContext((e.target as HTMLDetailsElement).open)} style={{ marginBottom: 8 }}>
              <summary style={{ cursor: 'pointer', fontSize: 12, color: adminColors.gray }}>contexto del jugador (PLAYER_CONTEXT)</summary>
              <pre style={{ marginTop: 6, padding: 10, background: adminColors.bg, borderRadius: 4, fontSize: 11, fontFamily: 'monospace', color: adminColors.ivory, whiteSpace: 'pre-wrap', maxHeight: 300, overflow: 'auto' }}>
                {result.contextString}
              </pre>
            </details>

            <details open={showSystem} onToggle={e => setShowSystem((e.target as HTMLDetailsElement).open)}>
              <summary style={{ cursor: 'pointer', fontSize: 12, color: adminColors.gray }}>system prompt completo enviado a Anthropic</summary>
              <pre style={{ marginTop: 6, padding: 10, background: adminColors.bg, borderRadius: 4, fontSize: 11, fontFamily: 'monospace', color: adminColors.ivory, whiteSpace: 'pre-wrap', maxHeight: 400, overflow: 'auto' }}>
                {result.systemPrompt}
              </pre>
            </details>
          </div>
        )}

      </div>
    </div>
  )
}
