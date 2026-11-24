import { test, expect, devices } from '@playwright/test'
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  adminClient,
  cleanupRondaFixture,
  createEphemeralUserConCredenciales,
  deleteEphemeralUser,
  getTestUserId,
  sinError,
} from './helpers/ronda-fixture'
import { marcarAvisoNoMolestarVisto } from './helpers/aviso-no-molestar'
import {
  clienteConSesion,
  clienteDelUsuarioE2E,
  crearScrambleDeClub as crearScrambleDeClubConCreador,
  entrarComo,
  equiposDe,
  golpeDelEquipo,
  nombreDePerfil,
  tarjetaDeEquipo,
} from './helpers/scramble-club-fixture'
import { REINTENTO_CARGA_MS } from '../src/lib/data/ronda-libre-scorer'

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
let creadorDb: SupabaseClient | null = null

/** Crea la ronda con la sesión de `request` (la del usuario e2e) y la anota para la limpieza. */
async function crearScrambleDeClub(request: Parameters<typeof crearScrambleDeClubConCreador>[0], equipos: string[]) {
  const ronda = await crearScrambleDeClubConCreador(request, { id: testUserId, nombre: nombreCreador }, equipos)
  rondasCreadas.push(ronda.id)
  return ronda
}

test.describe.configure({ mode: 'serial' })

test.describe('Scramble rápido — un celular por equipo', () => {
  test.beforeAll(async () => {
    testUserId = await getTestUserId()
    nombreCreador = await nombreDePerfil(testUserId)

    pedro = await createEphemeralUserConCredenciales('e2e-scramble-celular')
    await sinError('nombre de Pedro', adminClient().from('profiles').update({ name: NOMBRE_PEDRO }).eq('id', pedro.id).select('id'))
    pedroDb = await clienteConSesion(pedro.email, pedro.password)
    creadorDb = await clienteDelUsuarioE2E()
  })

  test.afterAll(async () => {
    // Se junta cada error y se sigue: una ronda que no se borra no deja viva la cuenta efímera ni las demás rondas.
    const errs: string[] = []
    for (const id of rondasCreadas) {
      try { await cleanupRondaFixture(id) } catch (e) { errs.push((e as Error).message) }
    }
    if (pedro) errs.push(...await deleteEphemeralUser(pedro.id))
    if (errs.length > 0) throw new Error(`Limpieza incompleta: ${errs.join(' · ')}`)
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

    // La regla del servidor (20261123200000), con las sesiones reales de los dos celulares: un equipo con anotador
    // lo escribe SOLO ese anotador. Ni el creador pisa el hoyo de Las Águilas ni Pedro el de Los Cóndores.
    const creadorPisa = await creadorDb!.rpc('upsert_ronda_equipos_scores', { p_equipo_id: equipos['Las Águilas'].id, p_codigo: codigo, p_delta: { '9': 7 } })
    expect(creadorPisa.error?.code, 'el creador no escribe el equipo que anota Pedro').toBe('P0003')
    expect(creadorPisa.error?.details).toBe('equipo_de_otro_anotador')
    const pedroPisa = await pedroDb!.rpc('upsert_ronda_equipos_scores', { p_equipo_id: equipos['Los Cóndores'].id, p_codigo: codigo, p_delta: { '9': 7 } })
    expect(pedroPisa.error?.code, 'Pedro no escribe un equipo ajeno (regla general: no es jugador ni anotador)').toBe('P0003')
    expect(await golpeDelEquipo(id, 'Las Águilas', 9)).toBeNull()
    expect(await golpeDelEquipo(id, 'Los Cóndores', 9)).toBeNull()

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
    expect(await golpeDelEquipo(id, 'Las Águilas', 1), 'el par automático no toca el equipo de otro celular').toBeNull()

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
        .finally(() => creadorCtx.close())
      let equipos = await equiposDe(id)
      expect(equipos['Los Cóndores'].anotador_user_id, 'el equipo 1 lo anota el creador desde ya').toBe(testUserId)

      await entrarComo(page, pedro!)

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

      // Carrera: Pedro abre la confirmación de Los Zorzales y, mientras confirma, el otro celular suelta Los Cóndores
      // y toma Los Zorzales. La base se mueve con el modal YA abierto (guarda su equipo en estado propio): la relectura
      // automática de la lista no puede esconder el botón antes del clic.
      // service_role: el guard ANOTADOR_AJENO es para anon/authenticated (el reclamo real lo cubre el test 1).
      await libres.getByRole('button', { name: /Los Zorzales/ }).click()
      const confirmar = page.getByRole('dialog').filter({ hasText: '¿Anotar Los Zorzales desde este celular?' })
      await expect(confirmar).toBeVisible()
      await sinError('soltar Cóndores', adminClient().from('ronda_equipos').update({ anotador_user_id: null }).eq('id', equipos['Los Cóndores'].id).select('id'))
      await sinError('tomar Zorzales', adminClient().from('ronda_equipos').update({ anotador_user_id: testUserId }).eq('id', equipos['Los Zorzales'].id).select('id'))
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
      await expect(libres.getByRole('button', { name: /Las Águilas/ })).toBeVisible()
      equipos = await equiposDe(id)
      expect(equipos['Las Águilas'].anotador_user_id).toBeNull()
      expect(equipos['Las Águilas'].scores?.['1'], 'lo que subió queda guardado').toBe(golpe)
      // Dejarlo a propósito no avisa «Ya no anotas»: se espera una relectura automática completa antes de afirmarlo.
      await page.waitForTimeout(REINTENTO_CARGA_MS + 1_000)
      await expect(page.getByText('Ya no anotas este equipo.')).toHaveCount(0)
      await expect(page.getByRole('heading', { name: 'Elige tu equipo' })).toBeVisible()

      expect(pageErrors).toEqual([])
    } finally {
      await ctx.close()
    }
  })
})
