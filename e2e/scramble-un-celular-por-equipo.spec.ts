import { test, expect, devices, type APIRequestContext, type Page } from '@playwright/test'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import {
  adminClient,
  cleanupRondaFixture,
  createEphemeralUserConCredenciales,
  deleteEphemeralUser,
  getTestUserId,
  sinError,
  DEFAULT_COURSE_ID,
  DEFAULT_COURSE_NAME,
} from './helpers/ronda-fixture'
import { marcarAvisoNoMolestarVisto } from './helpers/aviso-no-molestar'

/**
 * Scramble rápido «un celular por equipo» — /ronda-libre/[codigo]/score-grupo (#857–#862).
 *
 * Ningún E2E cubría el flujo nuevo: equipos con el hándicap del club (sin jugadores), `quien_anota: 'cada_equipo'`
 * → la API deja la ronda con `admin_mode` false y cada equipo lo reclama un celular con `reclamar_equipo_de_ronda`.
 * Dos actores reales, cada uno con su sesión:
 *  - el usuario e2e (creador, por la API real del wizard);
 *  - «Pedro», una cuenta efímera que reclama por la RPC con SU sesión, o entra con su propio navegador.
 *
 * Lo que se afirma son DATOS del servidor (ronda_equipos.scores / anotador_*), no solo que la pantalla cargue:
 *  1. Creador: el equipo que tomó otro celular sale en la franja «lo anota Pedro…» y no tiene botones; el «+» del
 *     equipo propio escribe SOLO ese equipo; «Liberar» lo devuelve al creador (anotador NULL en la base).
 *  2. Jugador que no creó la ronda: «Elige tu equipo» con libres y tomados; carrera perdida → aviso «Ese equipo ya lo
 *     anota …» y la lista al día; reclamar → el scorer abre SOLO su equipo; «Dejar este equipo» lo suelta y lo
 *     anotado queda guardado.
 *
 * Corre contra la app local + base de pruebas (`e2e-local.mjs`); borra sus rondas y la cuenta efímera en afterAll.
 */

const NOMBRE_PEDRO = 'Pedro Efímero'
const rondasCreadas: string[] = []
let testUserId = ''
let nombreCreador = ''
let pedro: { id: string; email: string; password: string } | null = null
let pedroDb: SupabaseClient | null = null

type FilaEquipo = { id: string; nombre: string; handicap_origen: string; anotador_user_id: string | null; anotador_nombre: string | null; scores: Record<string, number> | null }

/** Ronda scramble gross de 9 hoyos con equipos del club, por la API real del wizard (sesión del usuario e2e). */
async function crearScrambleDeClub(request: APIRequestContext, equipos: string[]): Promise<{ id: string; codigo: string }> {
  const res = await request.post('/api/ronda-libre/create', {
    data: {
      course_id: DEFAULT_COURSE_ID,
      course_name: DEFAULT_COURSE_NAME,
      tees: 'blanco',
      holes: 9,
      fecha: new Date().toISOString().slice(0, 10),
      hoyo_inicio: 1,
      formato_juego: 'scramble',
      modo_juego: 'gross',
      admin_mode: true, // lo decide el servidor con equipos de club: debe quedar en false con 'cada_equipo'
      jugadores: [{ nombre: nombreCreador, user_id: testUserId, handicap: null, tees: 'blanco' }],
      equipos_de_club: { equipos: equipos.map(nombre => ({ nombre, handicap: null })), quien_anota: 'cada_equipo' },
    },
  })
  const body = await res.json()
  expect(res.status(), `create scramble de club: ${JSON.stringify(body)}`).toBe(200)
  rondasCreadas.push(body.ronda_id)
  return { id: body.ronda_id, codigo: body.codigo }
}

async function equiposDe(rondaId: string): Promise<Record<string, FilaEquipo>> {
  const filas = await sinError(
    'equipos de la ronda',
    adminClient().from('ronda_equipos').select('id, nombre, handicap_origen, anotador_user_id, anotador_nombre, scores').eq('ronda_id', rondaId),
  )
  return Object.fromEntries((filas as FilaEquipo[]).map(f => [f.nombre, f]))
}

/** Golpes de un equipo en un hoyo, leídos del servidor (lo que ve la tabla en vivo). */
async function golpeDelEquipo(rondaId: string, nombre: string, hoyo: number): Promise<number | null> {
  return (await equiposDe(rondaId))[nombre]?.scores?.[String(hoyo)] ?? null
}

/**
 * Tarjeta de un equipo en el scorer: el bloque más interno con su nombre y el botón «+». Se excluyen los contenedores
 * que envuelven la franja de otro celular: si no, la página entera «tiene» el nombre (en la franja) y un «+» ajeno.
 */
function tarjetaDeEquipo(page: Page, nombre: string) {
  return page
    .locator('div')
    .filter({ has: page.getByText(nombre, { exact: true }) })
    .filter({ has: page.getByRole('button', { name: '+', exact: true }) })
    .filter({ hasNot: page.getByRole('region', { name: 'Equipos que anota otro celular' }) })
    .last()
}

test.describe.configure({ mode: 'serial' })

test.describe('Scramble rápido — un celular por equipo', () => {
  test.beforeAll(async () => {
    testUserId = await getTestUserId()
    const perfil = await sinError('perfil del usuario e2e', adminClient().from('profiles').select('name').eq('id', testUserId).single())
    nombreCreador = (perfil as { name: string | null }).name?.trim() || 'E2E'

    pedro = await createEphemeralUserConCredenciales('e2e-scramble-celular')
    await sinError('nombre de Pedro', adminClient().from('profiles').update({ name: NOMBRE_PEDRO }).eq('id', pedro.id).select('id'))
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    if (!url || !anon) throw new Error('Faltan NEXT_PUBLIC_SUPABASE_URL o NEXT_PUBLIC_SUPABASE_ANON_KEY')
    pedroDb = createClient(url, anon, { auth: { autoRefreshToken: false, persistSession: false } })
    const { error } = await pedroDb.auth.signInWithPassword({ email: pedro.email, password: pedro.password })
    if (error) throw new Error(`login de Pedro: ${error.message}`)
  })

  test.afterAll(async () => {
    for (const id of rondasCreadas) await cleanupRondaFixture(id)
    if (pedro) {
      const errs = await deleteEphemeralUser(pedro.id)
      if (errs.length > 0) throw new Error(`Limpieza incompleta: ${errs.join(' · ')}`)
    }
  })

  test('creador: el equipo de otro celular sale en la franja, el «+» escribe solo el propio y «Liberar» lo devuelve', async ({ page }) => {
    const pageErrors: string[] = []
    page.on('pageerror', err => pageErrors.push(err.message))

    const { id, codigo } = await crearScrambleDeClub(page.request, ['Los Cóndores', 'Las Águilas'])

    // La API decide admin_mode con equipos de club: 'cada_equipo' con 2 equipos → un celular por equipo.
    const ronda = await sinError('ronda', adminClient().from('rondas_libres').select('admin_mode, formato_juego, estado').eq('id', id).single())
    expect(ronda).toEqual({ admin_mode: false, formato_juego: 'scramble', estado: 'en_curso' })
    let equipos = await equiposDe(id)
    expect(Object.keys(equipos).sort()).toEqual(['Las Águilas', 'Los Cóndores'])
    for (const e of Object.values(equipos)) expect(e.handicap_origen, `${e.nombre} con el hándicap del club`).toBe('club')
    // El equipo 1 lo anota el creador desde ya (plan §1); los demás nacen libres.
    expect(equipos['Los Cóndores'].anotador_user_id).toBe(testUserId)
    expect(equipos['Los Cóndores'].anotador_nombre).toBe(nombreCreador)
    expect(equipos['Las Águilas'].anotador_user_id).toBeNull()

    // Pedro (RPC real, SU sesión): el equipo del creador está tomado; Las Águilas, libre. El nombre lo pone el trigger.
    const tomado = await pedroDb!.rpc('reclamar_equipo_de_ronda', { p_codigo: codigo, p_equipo_id: equipos['Los Cóndores'].id })
    expect(tomado.data).toEqual({ estado: 'tomado', anotador_nombre: nombreCreador })
    const reclamo = await pedroDb!.rpc('reclamar_equipo_de_ronda', { p_codigo: codigo, p_equipo_id: equipos['Las Águilas'].id })
    expect(reclamo.error, JSON.stringify(reclamo.error)).toBeNull()
    expect(reclamo.data).toEqual({ estado: 'ok' })
    equipos = await equiposDe(id)
    expect(equipos['Las Águilas'].anotador_user_id).toBe(pedro!.id)
    expect(equipos['Las Águilas'].anotador_nombre).toBe(NOMBRE_PEDRO)
    expect(equipos['Los Cóndores'].anotador_user_id, 'reclamar uno no toca el otro').toBe(testUserId)

    await marcarAvisoNoMolestarVisto(page, codigo)
    await page.goto(`/ronda-libre/${codigo}/score-grupo`, { waitUntil: 'domcontentloaded' })

    // El creador anota SOLO Los Cóndores; Las Águilas va en la franja, sin − ni +.
    const franja = page.getByRole('region', { name: 'Equipos que anota otro celular' })
    await expect(franja).toBeVisible({ timeout: 20_000 })
    await expect(franja).toContainText('Las Águilas')
    await expect(franja).toContainText(`lo anota ${NOMBRE_PEDRO}`)
    await expect(franja).not.toContainText('Los Cóndores')
    await expect(tarjetaDeEquipo(page, 'Los Cóndores')).toBeVisible()
    await expect(tarjetaDeEquipo(page, 'Las Águilas')).toHaveCount(0)
    await expect(page.getByRole('button', { name: '+', exact: true })).toHaveCount(1)

    // «+» sobre Los Cóndores en el hoyo 1 → llega al servidor SOLO para ese equipo.
    await tarjetaDeEquipo(page, 'Los Cóndores').getByRole('button', { name: '+', exact: true }).click()
    await expect.poll(() => golpeDelEquipo(id, 'Los Cóndores', 1), { timeout: 15_000, message: 'golpe de Los Cóndores en el servidor' }).not.toBeNull()
    const golpe = await golpeDelEquipo(id, 'Los Cóndores', 1)
    expect(golpe).toBeGreaterThanOrEqual(1)
    expect(await golpeDelEquipo(id, 'Las Águilas', 1), 'el creador no escribe el equipo de otro celular').toBeNull()

    // «Liberar» con confirmación → el equipo vuelve al creador: anotador NULL en la base y ya anota los dos.
    await franja.getByRole('button', { name: 'Liberar' }).click()
    const modal = page.getByRole('dialog').filter({ hasText: '¿Liberar Las Águilas?' })
    await expect(modal).toBeVisible()
    await expect(modal).toContainText(`${NOMBRE_PEDRO} ya no puede anotarlo`)
    await modal.getByRole('button', { name: 'Liberar' }).click()
    await expect(page.getByText('Las Águilas queda en tu celular')).toBeVisible({ timeout: 15_000 })
    await expect.poll(async () => (await equiposDe(id))['Las Águilas'].anotador_user_id, { timeout: 10_000 }).toBeNull()
    expect((await equiposDe(id))['Las Águilas'].anotador_nombre, 'sin anotador no queda nombre').toBeNull()
    await expect(franja).toHaveCount(0)
    await expect(tarjetaDeEquipo(page, 'Las Águilas')).toBeVisible()
    await expect(page.getByRole('button', { name: '+', exact: true })).toHaveCount(2)

    expect(await golpeDelEquipo(id, 'Los Cóndores', 1), 'liberar no toca lo anotado').toBe(golpe)
    expect(pageErrors).toEqual([])
  })

  test('jugador que no creó la ronda: elige equipo, pierde una carrera con aviso, anota solo el suyo y lo deja', async ({ browser }, testInfo) => {
    const ctx = await browser.newContext({
      ...devices['Pixel 5'],
      baseURL: testInfo.project.use.baseURL,
      storageState: { cookies: [], origins: [] },
    })
    try {
      const page = await ctx.newPage()
      const pageErrors: string[] = []
      page.on('pageerror', err => pageErrors.push(err.message))

      // La crea el usuario e2e (request de su sesión). Pedro entra con su propio navegador.
      const creadorCtx = await browser.newContext({ baseURL: testInfo.project.use.baseURL, storageState: testInfo.project.use.storageState as string })
      const { id, codigo } = await crearScrambleDeClub(creadorCtx.request, ['Los Cóndores', 'Las Águilas', 'Los Zorzales'])
      await creadorCtx.close()
      let equipos = await equiposDe(id)
      expect(equipos['Los Cóndores'].anotador_user_id, 'el equipo 1 lo anota el creador desde ya').toBe(testUserId)

      await page.goto('/login')
      await page.locator('input[type="email"]').first().fill(pedro!.email)
      await page.locator('input[placeholder="Tu contraseña"]').first().fill(pedro!.password)
      await page.locator('form button[type="submit"]').first().click()
      await page.waitForURL(u => !u.pathname.startsWith('/login'), { timeout: 45_000 })

      await marcarAvisoNoMolestarVisto(page, codigo)
      await page.goto(`/ronda-libre/${codigo}/score-grupo`, { waitUntil: 'domcontentloaded' })

      await expect(page.getByRole('heading', { name: 'Elige tu equipo' })).toBeVisible({ timeout: 20_000 })
      const libres = page.getByRole('list', { name: 'Equipos libres' })
      const tomados = page.getByRole('region', { name: 'Equipos que ya se anotan' })
      await expect(libres.getByRole('button')).toHaveCount(2)
      await expect(libres.getByRole('button', { name: /Las Águilas/ })).toBeVisible()
      await expect(libres.getByRole('button', { name: /Los Zorzales/ })).toBeVisible()
      await expect(tomados).toContainText('Los Cóndores')
      await expect(tomados).toContainText(`lo anota ${nombreCreador}`)
      await expect(page.getByRole('link', { name: 'Ver tabla en vivo' })).toHaveAttribute('href', `/ronda-libre/${codigo}`)

      // Carrera: mientras Pedro mira la lista, el otro celular suelta Los Cóndores y toma Los Zorzales.
      // service_role: el guard ANOTADOR_AJENO es para anon/authenticated (el reclamo real lo cubre el test 1).
      await sinError('soltar Cóndores', adminClient().from('ronda_equipos').update({ anotador_user_id: null }).eq('id', equipos['Los Cóndores'].id).select('id'))
      await sinError('tomar Zorzales', adminClient().from('ronda_equipos').update({ anotador_user_id: testUserId }).eq('id', equipos['Los Zorzales'].id).select('id'))
      await libres.getByRole('button', { name: /Los Zorzales/ }).click()
      const confirmar = page.getByRole('dialog').filter({ hasText: '¿Anotar Los Zorzales desde este celular?' })
      await expect(confirmar).toBeVisible()
      await confirmar.getByRole('button', { name: 'Anotar' }).click()
      await expect(page.getByRole('alert').filter({ hasText: 'Ese equipo ya lo anota' })).toHaveText(`Ese equipo ya lo anota ${nombreCreador}. Elige otro.`, { timeout: 15_000 })
      // La lista se relee del servidor: Zorzales pasa a tomados y Cóndores a libres.
      await expect(tomados).toContainText('Los Zorzales')
      await expect(libres.getByRole('button', { name: /Los Cóndores/ })).toBeVisible()
      await expect(libres.getByRole('button', { name: /Los Zorzales/ })).toHaveCount(0)
      expect((await equiposDe(id))['Los Zorzales'].anotador_user_id, 'la carrera la ganó el otro celular').toBe(testUserId)

      // Reclamar Las Águilas → el scorer abre SOLO ese equipo.
      await libres.getByRole('button', { name: /Las Águilas/ }).click()
      await page.getByRole('dialog').filter({ hasText: '¿Anotar Las Águilas desde este celular?' }).getByRole('button', { name: 'Anotar' }).click()
      await expect(tarjetaDeEquipo(page, 'Las Águilas')).toBeVisible({ timeout: 20_000 })
      equipos = await equiposDe(id)
      expect(equipos['Las Águilas'].anotador_user_id).toBe(pedro!.id)
      expect(equipos['Las Águilas'].anotador_nombre).toBe(NOMBRE_PEDRO)
      await expect(page.getByRole('button', { name: '+', exact: true }), 'Pedro anota un solo equipo').toHaveCount(1)
      const franja = page.getByRole('region', { name: 'Equipos que anota otro celular' })
      await expect(franja).toContainText('Los Zorzales')
      await expect(franja).toContainText('Los Cóndores') // sin reclamar: lo anota el creador
      await expect(franja).toContainText(`lo anota ${nombreCreador}`)
      await expect(franja.getByRole('button', { name: 'Liberar' }), 'solo el creador libera').toHaveCount(0)

      await tarjetaDeEquipo(page, 'Las Águilas').getByRole('button', { name: '+', exact: true }).click()
      await expect.poll(() => golpeDelEquipo(id, 'Las Águilas', 1), { timeout: 15_000, message: 'golpe de Pedro en el servidor' }).not.toBeNull()
      const golpe = await golpeDelEquipo(id, 'Las Águilas', 1)
      expect(await golpeDelEquipo(id, 'Los Zorzales', 1), 'Pedro no escribe un equipo ajeno').toBeNull()
      expect(await golpeDelEquipo(id, 'Los Cóndores', 1), 'Pedro no escribe el equipo sin reclamar').toBeNull()

      // «Dejar este equipo» → confirma → vuelve a «Elige tu equipo»; lo anotado queda guardado en el servidor.
      await page.getByRole('button', { name: 'Dejar este equipo' }).click()
      await page.getByRole('dialog').filter({ hasText: '¿Dejar Las Águilas?' }).getByRole('button', { name: 'Dejar', exact: true }).click()
      await expect(page.getByText('Dejaste Las Águilas')).toBeVisible({ timeout: 15_000 })
      await expect(page.getByRole('heading', { name: 'Elige tu equipo' })).toBeVisible()
      await expect(page.getByText('Ya no anotas este equipo.'), 'dejarlo a propósito no avisa «Ya no anotas»').toHaveCount(0)
      await expect(libres.getByRole('button', { name: /Las Águilas/ })).toBeVisible()
      equipos = await equiposDe(id)
      expect(equipos['Las Águilas'].anotador_user_id).toBeNull()
      expect(equipos['Las Águilas'].scores?.['1'], 'lo que subió queda guardado').toBe(golpe)

      expect(pageErrors).toEqual([])
    } finally {
      await ctx.close()
    }
  })
})
