// @vitest-environment node
/**
 * Las rutas en vivo con sesión (`/api/torneo/[slug]/neto`, `/api/ronda-libre/[codigo]/hcp`)
 * salen ANTES del bloque de sesión del middleware (src/proxy.ts): son su propia
 * frontera. Eso sólo es seguro si la ruta, por sí sola, mantiene viva una sesión
 * larga: con el access token VENCIDO, `getClaims()` (vía `getSession`) tiene que
 * refrescarlo con el refresh token y `@supabase/ssr` tiene que escribir la cookie
 * nueva en la respuesta del route handler. Si no, quien mira el torneo 2 horas
 * quedaría deslogueado a la hora.
 *
 * Supabase real (@supabase/ssr + auth-js), sólo `fetch` y `cookies()` son falsos;
 * los JWT se firman acá con ES256 (como prod: in_use ES256), así que getClaims los
 * verifica en local contra la JWKS (sin pedir /user).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const URL_SB = 'https://qaref.supabase.co'
process.env.NEXT_PUBLIC_SUPABASE_URL = URL_SB
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon-key-de-prueba'

// ── cookies() de Next: un store en memoria que registra cada set ──────────────
const jar = new Map<string, string>()
const seteadas: Array<{ name: string; value: string }> = []
vi.mock('next/headers', () => ({
  cookies: async () => ({
    getAll: () => [...jar.entries()].map(([name, value]) => ({ name, value })),
    get: (name: string) => (jar.has(name) ? { name, value: jar.get(name)! } : undefined),
    set: (name: string, value: string) => { seteadas.push({ name, value }); jar.set(name, value) },
  }),
}))
vi.mock('@/lib/error-tracking', () => ({ captureError: vi.fn() }))
vi.mock('next/cache', () => ({ unstable_cache: (fn: () => unknown) => fn }))
const armar = vi.fn(async () => ({ tournament: { id: 't1' }, players: [], teams: [], categories: [], groups: [] }))
vi.mock('@/lib/data/tournaments/en-vivo-servidor', () => ({
  SLUG_TORNEO_VALIDO: /^[a-z0-9][a-z0-9-]{0,119}$/,
  armarTorneoEnVivoParaRuta: (...a: unknown[]) => armar(...(a as [])),
}))

// ── JWT ES256 firmados acá ───────────────────────────────────────────────────
const b64url = (b: ArrayBuffer | Uint8Array | string) =>
  Buffer.from(typeof b === 'string' ? b : b instanceof ArrayBuffer ? new Uint8Array(b) : b).toString('base64url')
let llaves: CryptoKeyPair
let jwkPublica: JsonWebKey & { kid: string; alg: string; use: string }
async function firmar(payload: Record<string, unknown>) {
  const header = b64url(JSON.stringify({ alg: 'ES256', typ: 'JWT', kid: 'kid-qa' }))
  const body = b64url(JSON.stringify(payload))
  const firma = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, llaves.privateKey, new TextEncoder().encode(`${header}.${body}`))
  return `${header}.${body}.${b64url(firma)}`
}
const ahoraS = () => Math.floor(Date.now() / 1000)
const sesion = async (accessExpS: number, refresh: string) => ({
  access_token: await firmar({ sub: 'u-largo', role: 'authenticated', aud: 'authenticated', exp: accessExpS, iat: accessExpS - 3600 }),
  refresh_token: refresh,
  token_type: 'bearer',
  expires_in: accessExpS - ahoraS(),
  expires_at: accessExpS,
  user: { id: 'u-largo', aud: 'authenticated', role: 'authenticated', email: 'largo@qa.local', app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' },
})

const llamadas: string[] = []
let respuestaRefresh: unknown
beforeEach(async () => {
  jar.clear()
  seteadas.length = 0
  llamadas.length = 0
  armar.mockClear()
  llaves = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']) as CryptoKeyPair
  jwkPublica = { ...(await crypto.subtle.exportKey('jwk', llaves.publicKey)), kid: 'kid-qa', alg: 'ES256', use: 'sig' }
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input)
    llamadas.push(url.replace(URL_SB, ''))
    if (url.includes('/auth/v1/.well-known/jwks.json')) return new Response(JSON.stringify({ keys: [jwkPublica] }), { status: 200 })
    if (url.includes('/auth/v1/token?grant_type=refresh_token')) return new Response(JSON.stringify(respuestaRefresh), { status: 200 })
    if (url.includes('/auth/v1/token?grant_type=password')) return new Response(JSON.stringify(respuestaRefresh), { status: 200 })
    return new Response('{}', { status: 404 })
  }))
})
afterEach(() => { vi.unstubAllGlobals() })

/** Deja en el jar la cookie de sesión TAL COMO la escribe @supabase/ssr, con el access token ya vencido. */
async function sembrarSesionVencida() {
  const { createClient } = await import('@/utils/supabase/server')
  respuestaRefresh = await sesion(ahoraS() - 120, 'rt-viejo') // venció hace 2 min
  const sb = await createClient()
  const { error } = await sb.auth.signInWithPassword({ email: 'largo@qa.local', password: 'x' })
  expect(error).toBeNull()
  expect(seteadas.length).toBeGreaterThan(0)
  seteadas.length = 0
  llamadas.length = 0
}

describe('rutas en vivo fuera del middleware: la sesión larga no caduca', () => {
  it('/neto con access token vencido: getClaims refresca, verifica ES256 en local y @supabase/ssr escribe la cookie nueva', async () => {
    await sembrarSesionVencida()
    respuestaRefresh = await sesion(ahoraS() + 3600, 'rt-nuevo')
    const { GET } = await import('@/app/api/torneo/[slug]/neto/route')
    const res = await GET(new Request('http://localhost/api/torneo/copa-qa/neto'), { params: Promise.resolve({ slug: 'copa-qa' }) })

    expect(res.status).toBe(200)
    expect(llamadas.some(u => u.includes('grant_type=refresh_token'))).toBe(true) // refrescó
    expect(llamadas.some(u => u.includes('/auth/v1/user'))).toBe(false) // verificó en local (ES256), sin /user
    const escrita = seteadas.map(c => c.value).join('')
    expect(seteadas.length).toBeGreaterThan(0) // cookie nueva en la respuesta
    const decod = escrita.startsWith('base64-') ? Buffer.from(escrita.slice(7), 'base64url').toString() : escrita
    expect(decod).toContain('rt-nuevo')
    expect(armar).toHaveBeenCalledTimes(1)
  })

  it('/hcp con access token vencido: también refresca y escribe la cookie (sin /user)', async () => {
    await sembrarSesionVencida()
    respuestaRefresh = await sesion(ahoraS() + 3600, 'rt-nuevo-hcp')
    const { GET } = await import('@/app/api/ronda-libre/[codigo]/hcp/route')
    await GET(new Request('http://localhost/api/ronda-libre/ABC123/hcp'), { params: Promise.resolve({ codigo: 'ABC123' }) })
    expect(llamadas.some(u => u.includes('grant_type=refresh_token'))).toBe(true)
    expect(llamadas.some(u => u.includes('/auth/v1/user'))).toBe(false)
    const escrita = seteadas.map(c => c.value).join('')
    const decod = escrita.startsWith('base64-') ? Buffer.from(escrita.slice(7), 'base64url').toString() : escrita
    expect(decod).toContain('rt-nuevo-hcp')
  })

  it('/neto sin cookies → 401 sin pedir nada a Auth', async () => {
    const { GET } = await import('@/app/api/torneo/[slug]/neto/route')
    const res = await GET(new Request('http://localhost/api/torneo/copa-qa/neto'), { params: Promise.resolve({ slug: 'copa-qa' }) })
    expect(res.status).toBe(401)
    expect(llamadas).toEqual([])
  })
})
