import { test, expect, devices, type Browser, type BrowserContext, type Page, type TestInfo } from '@playwright/test'
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  cleanupRondaFixture,
  createEphemeralUserConCredenciales,
  deleteEphemeralUser,
  getTestUserId,
  adminClient,
  sinError,
} from './helpers/ronda-fixture'
import { marcarAvisoNoMolestarVisto } from './helpers/aviso-no-molestar'
import {
  clienteConSesion,
  clienteDelUsuarioE2E,
  crearScrambleDeClub,
  entrarComo,
  equiposDe,
  golpeDelEquipo,
  nombreDePerfil,
  tarjetaDeEquipo,
} from './helpers/scramble-club-fixture'
import { REINTENTO_CARGA_MS } from '../src/lib/data/ronda-libre-scorer'
import { MENSAJE_YA_NO_ANOTAS } from '../src/lib/data/ronda-libre-anotador'
import { ID_PENDIENTE_EQUIPO, leerPendientes, type ValorPendiente } from '../src/lib/ronda/score-storage'
import { SAVE_DEBOUNCE_MS } from '../src/app/ronda-libre/[codigo]/score-grupo/hooks/useGrupoScoreSave'

/**
 * Scramble rápido «un celular por equipo»: a Pedro le liberan el equipo MIENTRAS anota (#861, useGrupoScoreSave).
 *
 * Es el caso más delicado en cancha: Pedro anota sin señal, el creador libera su equipo desde otro celular y la señal
 * vuelve. El golpe que quedó en el teléfono de Pedro NO debe llegar al servidor (pisaría al nuevo anotador: el
 * servidor lo rechaza con P0003 y el scorer lo descarta), Pedro debe enterarse («Ya no anotas este equipo.») y volver
 * a «Elige tu equipo», también si recarga la página (la copia local del equipo perdido se borra).
 *
 * Dos actores reales: el usuario e2e (creador, API del wizard + RPC con su sesión) y «Pedro», cuenta efímera con su
 * propio navegador. Se afirma `ronda_equipos` en la base. Corre contra la app local + base de pruebas (`e2e-local.mjs`).
 */

const NOMBRE_PEDRO = 'Pedro Efímero'
const rondasCreadas: string[] = []
let creador = { id: '', nombre: '' }
let creadorDb: SupabaseClient | null = null
let pedro: { id: string; email: string; password: string } | null = null
let pedroDb: SupabaseClient | null = null

/** Ronda con Los Cóndores (del creador) y Las Águilas reclamada por Pedro con SU sesión. */
async function rondaConAguilasDePedro(browser: Browser, testInfo: TestInfo) {
  const creadorCtx = await browser.newContext({ baseURL: testInfo.project.use.baseURL, storageState: testInfo.project.use.storageState as string })
  const ronda = await crearScrambleDeClub(creadorCtx.request, creador, ['Los Cóndores', 'Las Águilas']).finally(() => creadorCtx.close())
  rondasCreadas.push(ronda.id)
  const equipos = await equiposDe(ronda.id)
  const reclamo = await pedroDb!.rpc('reclamar_equipo_de_ronda', { p_codigo: ronda.codigo, p_equipo_id: equipos['Las Águilas'].id })
  expect(reclamo.data, JSON.stringify(reclamo.error)).toEqual({ estado: 'ok' })
  return { ...ronda, aguilasId: equipos['Las Águilas'].id }
}

/** El navegador de Pedro, con su sesión, abierto en su scorer: SOLO Las Águilas. */
async function abrirScorerDePedro(browser: Browser, testInfo: TestInfo, codigo: string): Promise<{ ctx: BrowserContext; page: Page; pageErrors: string[] }> {
  const ctx = await browser.newContext({ ...devices['Pixel 5'], baseURL: testInfo.project.use.baseURL, storageState: { cookies: [], origins: [] } })
  const page = await ctx.newPage()
  const pageErrors: string[] = []
  page.on('pageerror', err => pageErrors.push(err.message))
  await entrarComo(page, pedro!)
  await marcarAvisoNoMolestarVisto(page, codigo)
  await page.goto(`/ronda-libre/${codigo}/score-grupo`, { waitUntil: 'domcontentloaded' })
  await expect(tarjetaDeEquipo(page, 'Las Águilas')).toBeVisible({ timeout: 20_000 })
  await expect(page.getByRole('button', { name: '+', exact: true }), 'Pedro anota un solo equipo').toHaveCount(1)
  return { ctx, page, pageErrors }
}

/**
 * Los golpes de un equipo que el teléfono de Pedro tiene pendientes de subir, o null si no hay. Se copia su
 * localStorage y se lee con `leerPendientes` (la cola canónica del scorer), sin repetir acá su clave ni su forma.
 */
async function pendientesDeEquipo(page: Page, codigo: string, equipoId: string): Promise<Record<string, ValorPendiente> | null> {
  const almacen: Record<string, string> = await page.evaluate(() => Object.fromEntries(Object.entries(localStorage)))
  const previo = Object.getOwnPropertyDescriptor(globalThis, 'localStorage')
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: { getItem: (k: string) => almacen[k] ?? null } })
  try {
    return leerPendientes(codigo)[ID_PENDIENTE_EQUIPO(equipoId)] ?? null
  } finally {
    if (previo) Object.defineProperty(globalThis, 'localStorage', previo)
    else delete (globalThis as { localStorage?: unknown }).localStorage
  }
}

async function liberarComoCreador(codigo: string, equipoId: string): Promise<void> {
  const r = await creadorDb!.rpc('liberar_equipo_de_ronda', { p_codigo: codigo, p_equipo_id: equipoId })
  expect(r.error, JSON.stringify(r.error)).toBeNull()
}

test.describe.configure({ mode: 'serial' })

test.describe('Scramble rápido — a Pedro le liberan el equipo mientras anota', () => {
  test.beforeAll(async () => {
    const id = await getTestUserId()
    creador = { id, nombre: await nombreDePerfil(id) }
    creadorDb = await clienteDelUsuarioE2E()
    pedro = await createEphemeralUserConCredenciales('e2e-scramble-liberado')
    await sinError('nombre de Pedro', adminClient().from('profiles').update({ name: NOMBRE_PEDRO }).eq('id', pedro.id).select('id'))
    pedroDb = await clienteConSesion(pedro.email, pedro.password)
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

  test('sin señal: el golpe que quedó en el teléfono no pisa al servidor, avisa «Ya no anotas» y vuelve a elegir', async ({ browser }, testInfo) => {
    const { id, codigo, aguilasId } = await rondaConAguilasDePedro(browser, testInfo)
    const { ctx, page, pageErrors } = await abrirScorerDePedro(browser, testInfo, codigo)
    try {
      // Pedro pierde la señal y anota el hoyo 1: el golpe queda pendiente en el teléfono.
      await ctx.setOffline(true)
      await tarjetaDeEquipo(page, 'Las Águilas').getByRole('button', { name: '+', exact: true }).click()
      await expect
        .poll(() => pendientesDeEquipo(page, codigo, aguilasId), { message: 'el golpe del hoyo 1 queda pendiente en el teléfono' })
        .toHaveProperty('1')
      expect(await golpeDelEquipo(id, 'Las Águilas', 1), 'sin señal no llega al servidor').toBeNull()

      // Mientras tanto, el creador libera Las Águilas desde su celular.
      await liberarComoCreador(codigo, aguilasId)
      expect((await equiposDe(id))['Las Águilas'].anotador_user_id).toBeNull()

      // Vuelve la señal: el pendiente se descarta, Pedro se entera y vuelve a «Elige tu equipo».
      await ctx.setOffline(false)
      await expect(page.getByText(MENSAJE_YA_NO_ANOTAS)).toBeVisible({ timeout: REINTENTO_CARGA_MS + 10_000 })
      await expect(page.getByRole('heading', { name: 'Elige tu equipo' })).toBeVisible()
      const libres = page.getByRole('list', { name: 'Equipos libres' })
      await expect(libres.getByRole('button', { name: /Las Águilas/ }), 'el equipo liberado vuelve a estar libre').toBeVisible()

      // El golpe nunca llega: ni ahora ni en la siguiente relectura automática (el pendiente no se reintenta).
      expect(await golpeDelEquipo(id, 'Las Águilas', 1), 'el golpe sin señal no pisa al servidor').toBeNull()
      await page.waitForTimeout(REINTENTO_CARGA_MS + 1_000)
      expect(await golpeDelEquipo(id, 'Las Águilas', 1), 'tampoco en el reintento').toBeNull()

      // Recargar no reabre el equipo perdido desde la copia local.
      await page.reload({ waitUntil: 'domcontentloaded' })
      await expect(page.getByRole('heading', { name: 'Elige tu equipo' })).toBeVisible({ timeout: 20_000 })
      await expect(tarjetaDeEquipo(page, 'Las Águilas')).toHaveCount(0)
      expect(await golpeDelEquipo(id, 'Las Águilas', 1)).toBeNull()
      expect(await pendientesDeEquipo(page, codigo, aguilasId), 'el pendiente del equipo perdido se borró del teléfono').toBeNull()

      // Pedro vuelve a tomar Las Águilas: el golpe viejo no resucita ni sube (se espera más que el debounce del guardado).
      await page.getByRole('list', { name: 'Equipos libres' }).getByRole('button', { name: /Las Águilas/ }).click()
      await page.getByRole('dialog').getByRole('button', { name: 'Anotar', exact: true }).click()
      await expect(tarjetaDeEquipo(page, 'Las Águilas')).toBeVisible({ timeout: 20_000 })
      expect((await equiposDe(id))['Las Águilas'].anotador_user_id, 'Pedro vuelve a anotar Las Águilas').toBe(pedro!.id)
      await page.waitForTimeout(SAVE_DEBOUNCE_MS + 2_500)
      expect(await golpeDelEquipo(id, 'Las Águilas', 1), 'al volver a tomarlo, el golpe viejo no sube').toBeNull()
      expect(await pendientesDeEquipo(page, codigo, aguilasId)).toBeNull()

      expect(pageErrors).toEqual([])
    } finally {
      await ctx.close()
    }
  })

  test('con señal y sin tocar nada: la relectura automática le avisa y lo saca del equipo liberado', async ({ browser }, testInfo) => {
    const { id, codigo, aguilasId } = await rondaConAguilasDePedro(browser, testInfo)
    const { ctx, page, pageErrors } = await abrirScorerDePedro(browser, testInfo, codigo)
    try {
      // Pedro anota el hoyo 1 con señal: llega al servidor.
      await tarjetaDeEquipo(page, 'Las Águilas').getByRole('button', { name: '+', exact: true }).click()
      await expect.poll(() => golpeDelEquipo(id, 'Las Águilas', 1), { timeout: 15_000, message: 'golpe de Pedro en el servidor' }).not.toBeNull()
      const golpe = await golpeDelEquipo(id, 'Las Águilas', 1)

      await liberarComoCreador(codigo, aguilasId)

      // Sin tocar nada: a lo más una relectura (REINTENTO_CARGA_MS) y Pedro ve el aviso y la lista.
      await expect(page.getByText(MENSAJE_YA_NO_ANOTAS)).toBeVisible({ timeout: REINTENTO_CARGA_MS + 10_000 })
      await expect(page.getByRole('heading', { name: 'Elige tu equipo' })).toBeVisible()
      await expect(page.getByRole('list', { name: 'Equipos libres' }).getByRole('button', { name: /Las Águilas/ })).toBeVisible()
      // Lo que Pedro ya subió queda guardado para el creador, que ahora anota el equipo.
      const equipos = await equiposDe(id)
      expect(equipos['Las Águilas'].anotador_user_id).toBeNull()
      expect(equipos['Las Águilas'].scores?.['1'], 'liberar no borra lo anotado').toBe(golpe)

      expect(pageErrors).toEqual([])
    } finally {
      await ctx.close()
    }
  })
})
