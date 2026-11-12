import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import type { ChatMessage, TaigerSession } from '@/lib/data/taiger'

const replace = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace, push: vi.fn() }) }))
const signOut = vi.fn(async () => ({ error: null }))
vi.mock('@/lib/supabase', () => ({ createClient: () => ({ auth: { signOut } }) }))

import { useTaigerChat, destinoSinReintento } from './useTaigerChat'
import { loginUrl } from '@/lib/auth/login-url'

const SESSION_ID = '11111111-1111-4111-8111-111111111111'
const session: TaigerSession = {
  id: SESSION_ID,
  user_id: 'u1',
  session_type: 'continuous',
  messages: [],
  created_at: '2026-11-12T00:00:00.000Z',
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

function montar(sessionId = SESSION_ID) {
  let messages: ChatMessage[] = []
  const setMessages = vi.fn((u: React.SetStateAction<ChatMessage[]>) => {
    messages = typeof u === 'function' ? u(messages) : u
  })
  return renderHook(() =>
    useTaigerChat({
      session: { ...session, id: sessionId },
      sessionId,
      messages,
      setMessages,
      opener: null,
      setOpener: vi.fn(),
    }),
  )
}

const fetchMock = vi.fn()
beforeEach(() => {
  replace.mockReset()
  signOut.mockClear()
  fetchMock.mockReset()
  vi.stubGlobal('fetch', fetchMock)
})
afterEach(() => vi.unstubAllGlobals())

describe('destinoSinReintento', () => {
  it('401 → login que vuelve a la misma sesión del coach', () => {
    const destino = destinoSinReintento(401, SESSION_ID)
    expect(destino).toBe(loginUrl(`/coach/sesion/${SESSION_ID}`))
    expect(destino?.startsWith('/login')).toBe(true)
    expect(destino).toContain(encodeURIComponent(`/coach/sesion/${SESSION_ID}`))
  })
  it('403 → /coach (ahí se muestra la puerta de acceso)', () => {
    expect(destinoSinReintento(403, 'nueva')).toBe('/coach')
  })
  it('429, 400, 500 y 503 se pueden reintentar: no redirige', () => {
    for (const s of [400, 429, 500, 503]) expect(destinoSinReintento(s, SESSION_ID)).toBeNull()
  })
})

describe('useTaigerChat — errores que Reintentar no arregla', () => {
  it('sesión vencida (401): manda a iniciar sesión en vez de mostrar Reintentar', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(401, { error: 'Debes iniciar sesión para continuar' }))
    const { result } = montar()
    act(() => result.current.handleSend('¿Cómo vengo con el putter?'))
    await waitFor(() => expect(replace).toHaveBeenCalledTimes(1))
    expect(replace).toHaveBeenCalledWith(destinoSinReintento(401, SESSION_ID))
    expect(result.current.error).toBeNull()
    // Borra la cookie local: si no, el proxy rebota /login a /dashboard.
    expect(signOut).toHaveBeenCalledWith({ scope: 'local' })
    await waitFor(() => expect(result.current.streaming).toBe(false))
  })

  it('401 en una sesión nueva vuelve a /coach/sesion/nueva tras el login', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(401, { error: 'Debes iniciar sesión para continuar' }))
    const { result } = montar('nueva')
    act(() => result.current.handleSend('Hola'))
    await waitFor(() => expect(replace).toHaveBeenCalledWith(loginUrl('/coach/sesion/nueva')))
  })

  it('acceso retirado (403): vuelve a /coach en vez de mostrar Reintentar', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(403, { error: 'Acceso al coach no habilitado' }))
    const { result } = montar('nueva')
    act(() => result.current.handleSend('Hola'))
    await waitFor(() => expect(replace).toHaveBeenCalledWith('/coach'))
    expect(result.current.error).toBeNull()
    expect(signOut).not.toHaveBeenCalled()
  })

  it('429 sigue mostrando el error con Reintentar y no redirige', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(429, { error: 'Demasiados mensajes. Intenta de nuevo en una hora.' }))
    const { result } = montar()
    act(() => result.current.handleSend('Hola'))
    await waitFor(() => expect(result.current.error).toBe('Demasiados mensajes. Intenta de nuevo en una hora.'))
    expect(replace).not.toHaveBeenCalled()
  })
})
