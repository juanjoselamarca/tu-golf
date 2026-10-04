// Fija la decisión de Juanjo (02-oct-2026, plan 2026-10-02 ítem 9): crear
// cuenta NO asigna tarjetas de invitado por coincidencia de nombre. Antes el
// callback buscaba en `ronda_libre_jugadores` las tarjetas de invitado con el
// mismo nombre del perfil y les ponía `user_id`: cualquiera llamado "Juan
// Pérez" se quedaba con la tarjeta de otro "Juan Pérez". Hasta el link
// tokenizado por jugador, esas tarjetas quedan sin dueño.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'fs'
import { join, relative, sep } from 'path'

const exchangeCodeForSession = vi.fn()
const verifyOtp = vi.fn()
const getUser = vi.fn()
const sessionFrom = vi.fn()
vi.mock('@/utils/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    auth: { exchangeCodeForSession, verifyOtp, getUser },
    from: sessionFrom,
  })),
}))

const createAdminClient = vi.fn()
vi.mock('@/lib/supabaseAdmin', () => ({ createAdminClient: () => createAdminClient() }))

const captureError = vi.fn()
vi.mock('@/lib/error-tracking', () => ({ captureError: (...a: unknown[]) => captureError(...a) }))

const after = vi.fn()
vi.mock('next/server', async (importOriginal) => {
  const real = await importOriginal<typeof import('next/server')>()
  return { ...real, after: (...a: unknown[]) => after(...a) }
})

import { GET } from '../route'

// Un usuario nuevo con el mismo nombre que un invitado de una ronda finalizada.
const USUARIO_NUEVO = { id: '11111111-1111-4111-8111-111111111111', user_metadata: { name: 'Juan Pérez' } }

beforeEach(() => {
  vi.clearAllMocks()
  exchangeCodeForSession.mockResolvedValue({ error: null })
  verifyOtp.mockResolvedValue({ error: null })
  getUser.mockResolvedValue({ data: { user: USUARIO_NUEVO } })
})

function expectSinReclamo() {
  // Ni cliente service role, ni queries con la sesión, ni trabajo en segundo plano.
  expect(createAdminClient).not.toHaveBeenCalled()
  expect(sessionFrom).not.toHaveBeenCalled()
  expect(after).not.toHaveBeenCalled()
}

describe('GET /auth/callback — sin reclamo de tarjetas por nombre', () => {
  it('PKCE (Google / confirmación de email): crea la sesión y redirige sin tocar tarjetas de invitado', async () => {
    const res = await GET(new Request('https://golfersplus.vercel.app/auth/callback?code=abc&next=/perfil'))
    expect(exchangeCodeForSession).toHaveBeenCalledWith('abc')
    expect(res.status).toBe(307)
    expect(res.headers.get('location')).toBe('https://golfersplus.vercel.app/perfil')
    expectSinReclamo()
  })

  it('OTP (magic link): crea la sesión y redirige sin tocar tarjetas de invitado', async () => {
    const res = await GET(
      new Request('https://golfersplus.vercel.app/auth/callback?token_hash=t&type=email&next=/perfil'),
    )
    expect(verifyOtp).toHaveBeenCalledWith({ token_hash: 't', type: 'email' })
    expect(res.headers.get('location')).toBe('https://golfersplus.vercel.app/perfil')
    expectSinReclamo()
  })

  it('código inválido: va a la página de error y reporta, sin reclamar', async () => {
    exchangeCodeForSession.mockResolvedValue({ error: new Error('bad code') })
    const res = await GET(new Request('https://golfersplus.vercel.app/auth/callback?code=malo'))
    expect(res.headers.get('location')).toBe('https://golfersplus.vercel.app/auth/auth-code-error')
    expect(captureError).toHaveBeenCalledTimes(1)
    expectSinReclamo()
  })
})

// Canario estático: ningún código productivo busca tarjetas de ronda libre por
// nombre con ILIKE (la forma que tenía el reclamo eliminado). Cuando llegue el
// link tokenizado, el reclamo se hace por token, nunca por nombre.
describe('canario — nadie reclama tarjetas de ronda libre por nombre', () => {
  const ROOT = join(__dirname, '..', '..', '..', '..', '..')
  function files(dir: string): string[] {
    return readdirSync(dir).flatMap((f) => {
      const p = join(dir, f)
      if (statSync(p).isDirectory()) return f === '__tests__' ? [] : files(p)
      return /\.(ts|tsx)$/.test(f) && !/\.test\.tsx?$/.test(f) ? [p] : []
    })
  }

  it('ninguna query asigna dueño a una tarjeta de ronda libre filtrando por nombre', () => {
    const ofensores: string[] = []
    // El CONCEPTO, no la sintaxis de ayer: un archivo que BUSCA tarjetas de ronda libre
    // por nombre (ilike/like con cualquier columna, o eq/or/textSearch sobre `nombre`)
    // y ASIGNA user_id a tarjetas de ronda libre, aunque sean dos queries separadas
    // (así lo hacía el módulo borrado: SELECT con ilike y después UPDATE por ids).
    const buscaPorNombre = /\.(ilike|like)\(|\.(eq|or|textSearch)\(\s*['"`][^'"`]*\bnombre(_invitado)?\b/
    const asignaDueno = /\.(update|upsert)\(\s*\{[^}]*\buser_id\b/
    for (const file of files(join(ROOT, 'src'))) {
      const src = readFileSync(file, 'utf-8')
      // Cada query desde su `.from(...)` hasta el próximo `.from(` o fin de archivo.
      const bloques = src.split(/(?=\.from\()/)
        .filter(b => /^\.from\(\s*['"]ronda_libre_jugadores['"]\s*\)/.test(b))
      if (bloques.some(b => buscaPorNombre.test(b)) && bloques.some(b => asignaDueno.test(b))) {
        ofensores.push(relative(ROOT, file).split(sep).join('/'))
      }
    }
    expect(ofensores).toEqual([])
  })

  it('el módulo de reclamo por nombre ya no existe', () => {
    expect(() => statSync(join(ROOT, 'src/lib/data/ronda-libre-guest-claim.ts'))).toThrow()
  })
})
