/**
 * E2E — /api/gwi/ronda-libre/[codigo]: contrato de privacidad por visor.
 *
 * Protege #501 (GWI calculado en el servidor), #506 (máscara por visor) y la
 * decisión de producto del 08/09-oct (sin sesión no viaja el índice de un
 * jugador con cuenta). Hasta hoy sólo lo cubrían tests unitarios del motor;
 * nada verificaba la RUTA desplegada con sesiones reales.
 *
 * Fixture (se crea y se borra aquí, nada queda en prod):
 *   - ronda libre en Los Leones (18h, stroke play gross) creada por el usuario de test
 *   - "yo"       = usuario de test (cuenta, índice del perfil)
 *   - "rival"    = usuario efímero con 12 rondas de 18h en Los Leones (historial real)
 *   - "invitado" = sin cuenta, índice 14 tipeado en la tarjeta
 *   - los tres con 6 hoyos jugados
 *
 * Por qué discrimina: el visor "rival" ve SU fila con el historial usado
 * (historico.usado / cancha.usado = true). Si la máscara se rompiera, el usuario
 * de test o un anónimo verían esos mismos `true` en la fila del rival.
 */
import { test, expect, devices, type Browser, type BrowserContext } from '@playwright/test'
import { createServerClient } from '@supabase/ssr'
import {
  adminClient,
  cleanupRondaFixture,
  createRondaFixture,
  deleteEphemeralUser,
  getTestUserId,
  type RondaFixture,
} from './helpers/ronda-fixture'

const BASE = process.env.PLAYWRIGHT_BASE_URL ?? 'https://golfersplus.vercel.app'
const HAS_ADMIN = !!(process.env.SUPABASE_SERVICE_ROLE_KEY && process.env.NEXT_PUBLIC_SUPABASE_URL)
const HAS_USER = !!(process.env.E2E_TEST_USER_EMAIL && process.env.E2E_TEST_USER_PASSWORD)

// Par de Los Leones hoyos 1-6: 4,4,3,5,4,3 (validado contra course_holes 09-oct).
const SCORES = {
  yo: { '1': 5, '2': 5, '3': 4, '4': 6, '5': 5, '6': 4 },
  rival: { '1': 4, '2': 5, '3': 3, '4': 5, '5': 4, '6': 3 },
  invitado: { '1': 6, '2': 5, '3': 4, '4': 7, '5': 5, '6': 4 },
}
const HCP_INVITADO = 14

/** Campos del input privado del GWI que nunca deben salir del servidor. */
const CLAVES_PRIVADAS = [
  'historicalAvg', 'historicalRoundsCount', 'courseAvg', 'courseRoundsCount',
  'patterns', 'back9Collapse', 'postBogeySpiral', 'user_id', 'email', 'scores',
]

interface GWIResultPublico {
  id: string
  nombre: string
  winProbability: number
  tendencia: 'up' | 'down' | 'stable' | null
  volatilidad: 'baja' | 'media' | 'alta' | null
  narrativa: string
  breakdown: {
    historico: { usado: boolean }
    cancha: { usado: boolean }
    patrones: { alerta: boolean }
    handicapInfo: { handicap: number; sigma: number; label: string } | null
  }
}
interface GWIResponse {
  results: GWIResultPublico[]
  jugadores: Array<{ id: string; nombre: string; hoyosCompletados: number }>
  totalHoyos: number
  modoJuego: string
  formatoJuego: string
}

/** Todas las claves (recursivo) de un JSON. */
function clavesDe(x: unknown, out = new Set<string>()): Set<string> {
  if (Array.isArray(x)) x.forEach(v => clavesDe(v, out))
  else if (x && typeof x === 'object') {
    for (const [k, v] of Object.entries(x)) { out.add(k); clavesDe(v, out) }
  }
  return out
}

/**
 * Cookies de sesión de Supabase para `email/password`, codificadas por la MISMA
 * librería que usa la app (@supabase/ssr), sin pasar por el formulario de login
 * (un usuario recién creado caería en el onboarding).
 */
async function cookiesDeSesion(email: string, password: string) {
  const jar = new Map<string, string>()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => [...jar].map(([name, value]) => ({ name, value })),
        setAll: (cs) => cs.forEach(({ name, value }) => (value ? jar.set(name, value) : jar.delete(name))),
      },
    },
  )
  const { error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) throw new Error(`signIn ${email}: ${error.message}`)
  const host = new URL(BASE).hostname
  return [...jar].map(([name, value]) => ({
    name, value, domain: host, path: '/', expires: -1, httpOnly: false, secure: true, sameSite: 'Lax' as const,
  }))
}

/**
 * Contexto de navegador real para un visor. Vercel tiene activo el Security
 * Checkpoint: un request "pelado" (sin navegador) recibe 403. Se abre una
 * página para pasar el desafío y después se usa `context.request`, que comparte
 * las cookies del contexto (desafío + sesión).
 */
async function visor(browser: Browser, cookies: Awaited<ReturnType<typeof cookiesDeSesion>> = []) {
  const ctx = await browser.newContext({ ...devices['Pixel 5'], baseURL: BASE })
  if (cookies.length) await ctx.addCookies(cookies)
  const page = await ctx.newPage()
  const res = await page.goto('/planes', { waitUntil: 'domcontentloaded' })
  const status = res?.status()
  await expect(page.locator('body'), `Security Checkpoint de Vercel (HTTP ${status})`).not.toContainText('Security Checkpoint', { timeout: 30_000 })
  await page.close()
  return ctx
}

async function getGWI(ctx: BrowserContext, codigo: string) {
  const res = await ctx.request.get(`/api/gwi/ronda-libre/${codigo}`)
  const text = await res.text()
  return { res, text, body: (res.ok() ? JSON.parse(text) : null) as GWIResponse | null }
}

test.describe('API /api/gwi/ronda-libre/[codigo] — privacidad por visor', () => {
  test.describe.configure({ mode: 'serial' })
  test.skip(!HAS_ADMIN || !HAS_USER, 'Requiere SUPABASE_SERVICE_ROLE_KEY y credenciales E2E')

  let ronda: RondaFixture | null = null
  let rivalUserId: string | null = null
  let rivalEmail = ''
  const rivalPassword = `Gwi-${Math.random().toString(36).slice(2, 10)}!A1`
  const ids = { yo: '', rival: '', invitado: '' }

  let anon: BrowserContext
  let comoRival: BrowserContext
  let comoYo: BrowserContext

  test.beforeAll(async ({ browser }) => {
    test.setTimeout(120_000)
    // El error de un beforeAll sólo se imprime en el resumen final; si la corrida
    // se corta antes (timeout del job), se pierde. Se imprime en vivo.
    try {
      await prepararFixture(browser)
    } catch (err) {
      console.error('[gwi-api-privacidad] beforeAll falló:', err)
      throw err
    }
  })

  async function prepararFixture(browser: Browser) {
    const admin = adminClient()
    const testUserId = await getTestUserId()

    // 1. Rival efímero con historial (12 rondas de 18h en la misma cancha).
    rivalEmail = `gwi-rival-${Date.now()}-${Math.random().toString(36).slice(2, 6)}@golfersplus-test.local`
    const { data: created, error: userErr } = await admin.auth.admin.createUser({
      email: rivalEmail, password: rivalPassword, email_confirm: true,
    })
    if (userErr || !created.user) throw new Error(`createUser rival: ${userErr?.message}`)
    rivalUserId = created.user.id

    const historial = Array.from({ length: 12 }, (_, i) => {
      const gross = 82 + (i % 4)
      // 18 hoyos que suman `gross` (4 por hoyo + el resto repartido de a 1).
      const scores = Array.from({ length: 18 }, (_, h) => 4 + (h < gross - 72 ? 1 : 0))
      return {
      user_id: rivalUserId,
      course_name: 'Los Leones',
      course_id: 'b1b6ba60-18f0-48a8-97c2-ef10e25fbe26',
      played_at: new Date(Date.now() - (i + 1) * 7 * 86_400_000).toISOString().slice(0, 10),
      total_gross: gross,
      holes_played: 18,
      scores,
      course_rating: 73.3,
      slope_rating: 136,
      import_source: 'manual',
      privacy: 'private',
      }
    })
    const { error: histErr } = await admin.from('historical_rounds').insert(historial)
    if (histErr) throw new Error(`insert historial rival: ${histErr.message}`)

    // 2. Ronda con los tres jugadores.
    ronda = await createRondaFixture({ creadorUserId: testUserId, creadorName: 'E2E Yo' })
    const { data: yo } = await admin
      .from('ronda_libre_jugadores').update({ scores: SCORES.yo })
      .eq('ronda_id', ronda.id).eq('user_id', testUserId).select('id').single()
    const { data: otros, error: insErr } = await admin
      .from('ronda_libre_jugadores')
      .insert([
        { ronda_id: ronda.id, user_id: rivalUserId, nombre: 'E2E Rival', handicap: null, tees: 'blanco', scores: SCORES.rival, is_guest: false },
        { ronda_id: ronda.id, user_id: null, nombre: 'E2E Invitado', handicap: HCP_INVITADO, tees: 'blanco', scores: SCORES.invitado, is_guest: true },
      ])
      .select('id, nombre')
    if (!yo || insErr || !otros || otros.length !== 2) throw new Error(`fixture jugadores: ${insErr?.message}`)
    ids.yo = yo.id
    ids.rival = otros.find(o => o.nombre === 'E2E Rival')!.id
    ids.invitado = otros.find(o => o.nombre === 'E2E Invitado')!.id

    // 3. Tres visores.
    anon = await visor(browser)
    comoRival = await visor(browser, await cookiesDeSesion(rivalEmail, rivalPassword))
    comoYo = await visor(browser, await cookiesDeSesion(process.env.E2E_TEST_USER_EMAIL!, process.env.E2E_TEST_USER_PASSWORD!))
  }

  test.afterAll(async () => {
    test.setTimeout(120_000)
    await Promise.all([anon?.close(), comoRival?.close(), comoYo?.close()])
    if (ronda) await cleanupRondaFixture(ronda.id)
    if (rivalUserId) await deleteEphemeralUser(rivalUserId)
  })

  const fila = (b: GWIResponse, id: string) => {
    const r = b.results.find(x => x.id === id)
    expect(r, `fila ${id} presente`).toBeTruthy()
    return r!
  }

  test('anónimo: 200, no-store, marcador correcto y probabilidades que suman 100', async () => {
    const { res, body } = await getGWI(anon, ronda!.codigo)
    expect(res.status()).toBe(200)
    const cc = res.headers()['cache-control'] ?? ''
    expect(cc).toContain('private')
    expect(cc).toContain('no-store')

    expect(body!.totalHoyos).toBe(18)
    expect(body!.modoJuego).toBe('gross')
    expect(body!.formatoJuego).toBe('stroke_play')
    expect(body!.results).toHaveLength(3)
    expect(body!.jugadores).toHaveLength(3)
    for (const j of body!.jugadores) expect(j.hoyosCompletados, j.nombre).toBe(6)

    const suma = body!.results.reduce((s, r) => s + r.winProbability, 0)
    expect(suma).toBe(100)
    for (const r of body!.results) {
      expect(r.winProbability).toBeGreaterThanOrEqual(1)
      expect(r.winProbability).toBeLessThanOrEqual(98)
    }
    // El rival va 0 sobre par, "yo" +6, invitado +10 (gross): el rival es favorito.
    const p = (id: string) => fila(body!, id).winProbability
    expect(p(ids.rival)).toBeGreaterThan(p(ids.yo))
    expect(p(ids.yo)).toBeGreaterThan(p(ids.invitado))
  })

  test('anónimo: ninguna fila revela historial, y el índice de las cuentas no viaja', async () => {
    const { text, body } = await getGWI(anon, ronda!.codigo)
    const claves = clavesDe(JSON.parse(text))
    for (const k of CLAVES_PRIVADAS) expect(claves.has(k), `clave privada "${k}" en la respuesta`).toBe(false)

    for (const r of body!.results) {
      expect(r.tendencia, r.nombre).toBeNull()
      expect(r.breakdown.historico.usado, r.nombre).toBe(false)
      expect(r.breakdown.cancha.usado, r.nombre).toBe(false)
      expect(r.breakdown.patrones.alerta, r.nombre).toBe(false)
    }
    // Jugadores con cuenta: el índice sale del perfil → oculto sin sesión.
    for (const id of [ids.yo, ids.rival]) {
      const r = fila(body!, id)
      expect(r.breakdown.handicapInfo, r.nombre).toBeNull()
      expect(r.volatilidad, r.nombre).toBeNull()
    }
    // El invitado tipeó su índice en la tarjeta: ése sí se muestra.
    const inv = fila(body!, ids.invitado)
    expect(inv.breakdown.handicapInfo?.handicap).toBe(HCP_INVITADO)
    expect(inv.volatilidad).toBe('media')
  })

  test('el rival ve SU historial usado en su propia fila (el fixture discrimina)', async () => {
    const { res, text, body } = await getGWI(comoRival, ronda!.codigo)
    expect(res.status()).toBe(200)
    expect(res.headers()['cache-control'] ?? '').toContain('no-store')
    const claves = clavesDe(JSON.parse(text))
    for (const k of CLAVES_PRIVADAS) expect(claves.has(k), `clave privada "${k}"`).toBe(false)

    const propia = fila(body!, ids.rival)
    expect(propia.breakdown.historico.usado).toBe(true)
    expect(propia.breakdown.cancha.usado).toBe(true)
    expect(propia.tendencia).not.toBeNull()
    expect(propia.breakdown.handicapInfo).not.toBeNull()

    // Las filas ajenas, enmascaradas también para un participante.
    for (const id of [ids.yo, ids.invitado]) {
      const r = fila(body!, id)
      expect(r.tendencia, r.nombre).toBeNull()
      expect(r.breakdown.historico.usado, r.nombre).toBe(false)
      expect(r.breakdown.cancha.usado, r.nombre).toBe(false)
    }
  })

  test('otro participante NO ve el historial del rival (máscara por visor, #506)', async () => {
    const { res, text, body } = await getGWI(comoYo, ronda!.codigo)
    expect(res.status()).toBe(200)
    const claves = clavesDe(JSON.parse(text))
    for (const k of CLAVES_PRIVADAS) expect(claves.has(k), `clave privada "${k}"`).toBe(false)

    const rival = fila(body!, ids.rival)
    expect(rival.tendencia).toBeNull()
    expect(rival.breakdown.historico.usado).toBe(false)
    expect(rival.breakdown.cancha.usado).toBe(false)
    expect(rival.breakdown.patrones.alerta).toBe(false)
    // Con sesión, el handicap sí viaja (decisión 08-oct sólo oculta al anónimo).
    expect(rival.breakdown.handicapInfo).not.toBeNull()

    expect(fila(body!, ids.yo).tendencia).not.toBeNull()
    expect(body!.results.reduce((s, r) => s + r.winProbability, 0)).toBe(100)
  })

  test('código inexistente → 404 sin caché', async () => {
    const res = await anon.request.get('/api/gwi/ronda-libre/ZZZZZZ-NO-EXISTE')
    expect(res.status()).toBe(404)
    expect(res.headers()['cache-control'] ?? '').toContain('no-store')
    const resT = await anon.request.get('/api/gwi/torneo/e2e-torneo-que-no-existe-gwi')
    expect(resT.status()).toBe(404)
    expect(resT.headers()['cache-control'] ?? '').toContain('no-store')
  })
})
