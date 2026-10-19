import { test, expect, devices, type BrowserContext, type Page, type Locator } from '@playwright/test'
import {
  adminClient,
  DEFAULT_COURSE_ID,
  createEphemeralUserConCredenciales,
  deleteEphemeralUser,
  sinError,
} from './helpers/ronda-fixture'
import { exigirBaseDePruebas } from './helpers/base-de-pruebas'

/**
 * Mi Golf (/dashboard): cada ronda libre muestra SU score — "Últimas rondas" y el Hero "Última ronda".
 *
 * Protege #594: el dashboard cruzaba ronda libre ↔ historical_rounds por cancha + fecha (no único). Con dos rondas el
 * mismo día en la misma cancha (prod, usuario E2E: 48 y 36) las dos decían el mismo score y el Hero cargaba la tarjeta
 * de la otra. Hoy el vínculo es `historical_rounds.metadata.ronda_libre_jugador_id` (mi jugador en ESA ronda), y las
 * filas viejas sin vínculo caen a cancha + fecha usando cada fila una sola vez.
 *
 * Discrimina: las filas del historial se insertan en orden INVERSO a las rondas. Con el emparejamiento por cancha +
 * fecha, las dos rondas (y el Hero) muestran el score de la fila más nueva → fallan los toHaveText de la otra.
 *
 * Fixture realista: usuario efímero propio (sin rondas en curso ni torneos que cambien el Hero). SOLO base de pruebas
 * (`node --env-file=.env.local scripts/test-db/e2e-local.mjs -- dashboard-rondas-recientes.spec.ts
 * --project=mobile-chromium-auth`): las rondas en curso se ven en /en-vivo. Todo se borra en afterAll.
 */

const PAR_LOS_LEONES = { '1': 4, '2': 4, '3': 3, '4': 5, '5': 4, '6': 3, '7': 4, '8': 4, '9': 5, '10': 4, '11': 3, '12': 4, '13': 4, '14': 3, '15': 4, '16': 4, '17': 5, '18': 5 }
// Par real de Los Leones (course_holes, 36 + 36): el vs-par del dashboard se compara contra 72/36.
const PARES = Object.values(PAR_LOS_LEONES)

let jugador = { id: '', email: '', password: '' }
let ctx: BrowserContext
let page: Page

/** Fecha de calendario de Santiago (la misma que usa el server para decidir "Hoy" y el Hero). */
function fechaSantiago(diasAtras = 0): string {
  const hoy = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Santiago' })
  if (diasAtras === 0) return hoy
  // Se resta sobre la fecha de calendario (no 24 h): el día del cambio de horario dura 23 o 25 h.
  const [y, m, d] = hoy.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d - diasAtras)).toISOString().slice(0, 10)
}

function codigo(): string {
  const a = 'ACDEFGHJKMNPQRSTVWXYZ2345679'
  let c = ''
  for (let i = 0; i < 6; i++) c += a[Math.floor(Math.random() * a.length)]
  return c
}

/** Tarjeta de `holes` hoyos que suma par + `sobre` (golpes extra, o de menos si es negativo, desde el hoyo 1). */
function tarjeta(holes: 9 | 18, sobre: number): number[] {
  const s = PARES.slice(0, holes).map(p => p)
  for (let i = 0; i < Math.abs(sobre); i++) s[i % holes] += Math.sign(sobre)
  return s
}

interface Ronda { id: string; codigo: string; jugadorId: string }

/** Ronda libre del jugador en Los Leones con su fila de jugador (el creador juega). */
async function crearRonda(opts: { estado: 'en_curso' | 'finalizada'; fecha: string; holes?: 9 | 18; scores?: Record<string, number> }): Promise<Ronda> {
  const sb = adminClient()
  const c = codigo()
  const r = await sinError('insert rondas_libres', sb.from('rondas_libres').insert({
    codigo: c,
    course_id: DEFAULT_COURSE_ID,
    course_name: 'Los Leones',
    tees: 'blanco',
    holes: opts.holes ?? 18,
    fecha: opts.fecha,
    hoyo_inicio: 1,
    formato_juego: 'stroke_play',
    modo_juego: 'gross',
    admin_mode: false,
    estado: opts.estado,
    creador_id: jugador.id,
  }).select('id').single()) as { id: string }
  const j = await sinError('insert ronda_libre_jugadores', sb.from('ronda_libre_jugadores').insert({
    ronda_id: r.id,
    user_id: jugador.id,
    nombre: 'E2E Dashboard',
    handicap: null,
    tees: 'blanco',
    scores: opts.scores ?? {},
    is_guest: false,
  }).select('id').single()) as { id: string }
  return { id: r.id, codigo: c, jugadorId: j.id }
}

/** Fila de historical_rounds de la tarjeta; `vinculo` = jugador de la ronda (metadata.ronda_libre_jugador_id) o null (fila vieja). */
async function crearHistorico(opts: { fecha: string; scores: number[]; vinculo: string | null; cancha?: string }): Promise<string> {
  const holes = opts.scores.length
  const otraCancha = opts.cancha !== undefined
  const row = await sinError('insert historical_rounds', adminClient().from('historical_rounds').insert({
    user_id: jugador.id,
    course_name: opts.cancha ?? 'Los Leones',
    course_id: otraCancha ? null : DEFAULT_COURSE_ID,
    played_at: opts.fecha,
    total_gross: opts.scores.reduce((a, b) => a + b, 0),
    scores: opts.scores,
    holes_played: holes,
    tee_color: 'blanco',
    privacy: 'private',
    formato_juego: 'stroke_play',
    modo_juego: 'gross',
    par_per_hole: Object.fromEntries(Object.entries(PAR_LOS_LEONES).slice(0, holes)),
    metadata: opts.vinculo ? { ronda_libre_jugador_id: opts.vinculo } : {},
  }).select('id').single()) as { id: string }
  return row.id
}

/** Deja al jugador sin rondas ni historial (entre tests: cada uno arma su propio escenario). */
async function vaciar() {
  const sb = adminClient()
  await sinError('delete rondas_libres', sb.from('rondas_libres').delete().eq('creador_id', jugador.id).select('id'))
  await sinError('delete historical_rounds', sb.from('historical_rounds').delete().eq('user_id', jugador.id).select('id'))
}

async function abrirDashboard(fechaDelEscenario: string) {
  const res = await page.goto('/dashboard')
  expect(res?.status(), '/dashboard responde').toBeLessThan(400)
  // "Nueva ronda" vive en el tab Competencia (streamea en su Suspense): siempre está, haya o no rondas terminadas.
  await expect(page.getByRole('link', { name: /Nueva ronda/ }), 'el tab Competencia terminó de cargar').toBeVisible({ timeout: 30_000 })
  // "Hoy"/"Ayer" y el Hero dependen de la fecha de Santiago: si cruzó la medianoche entre sembrar y abrir, el
  // escenario ya no es el que se armó.
  if (fechaSantiago() !== fechaDelEscenario) test.skip(true, 'cruzó la medianoche de Santiago durante el test')
}

/** Fila de "Últimas rondas" de esa ronda (el Hero enlaza al mismo href, por eso se excluye). */
function filaDe(r: Ronda): Locator {
  return page.locator(`a[href="/ronda-libre/${r.codigo}"]`).filter({ hasNotText: 'Última ronda' })
}

function hero(): Locator {
  return page.locator('a').filter({ hasText: 'Última ronda' })
}

test.describe.configure({ mode: 'serial' })

test.describe('Mi Golf: cada ronda libre muestra su propio score', () => {
  test.beforeAll(async ({ browser }, testInfo) => {
    exigirBaseDePruebas('dashboard-rondas-recientes.spec.ts')
    jugador = await createEphemeralUserConCredenciales('e2e-dashboard-rondas')
    ctx = await browser.newContext({
      ...devices['Pixel 5'],
      baseURL: testInfo.project.use.baseURL,
      storageState: { cookies: [], origins: [] },
    })
    page = await ctx.newPage()
    // Una ronda para que /login no lo mande al onboarding de usuario nuevo; cada test arma la suya después.
    await crearRonda({ estado: 'finalizada', fecha: fechaSantiago(20) })
    await page.goto('/login')
    await page.locator('input[type="email"]').first().fill(jugador.email)
    await page.locator('input[placeholder="Tu contraseña"]').first().fill(jugador.password)
    await page.locator('form button[type="submit"]').first().click()
    await page.waitForURL(/\/dashboard/, { timeout: 45_000 })
  })

  test.beforeEach(async () => { await vaciar() })

  test.afterAll(async () => {
    await ctx?.close()
    if (!jugador.id) return
    const errs = await deleteEphemeralUser(jugador.id)
    if (errs.length > 0) throw new Error(`Limpieza incompleta: ${errs.join(' · ')}`)
  })

  test('dos rondas hoy en la misma cancha: cada fila y el Hero con SU tarjeta (vínculo exacto)', async () => {
    const hoy = fechaSantiago()
    // Rondas: A (93) primero, B (81) después → B es la más nueva y la del Hero.
    const a = await crearRonda({ estado: 'finalizada', fecha: hoy })
    const b = await crearRonda({ estado: 'finalizada', fecha: hoy })
    // Historial en orden INVERSO: la fila más nueva es la de A. Emparejar por cancha+fecha le daría 93 a las dos.
    await crearHistorico({ fecha: hoy, scores: tarjeta(18, 9), vinculo: b.jugadorId })
    await crearHistorico({ fecha: hoy, scores: tarjeta(18, 21), vinculo: a.jugadorId })

    await abrirDashboard(hoy)

    const filaA = filaDe(a)
    const filaB = filaDe(b)
    await expect(filaA).toHaveCount(1)
    await expect(filaB).toHaveCount(1)
    await expect(filaA).toContainText('Los Leones')
    await expect(filaA).toContainText('Hoy')
    await expect(filaA.getByText('93', { exact: true }), 'la ronda A muestra SU score').toBeVisible()
    await expect(filaA).toContainText('+21 vs par')
    await expect(filaB.getByText('81', { exact: true }), 'la ronda B muestra SU score').toBeVisible()
    // 81 es la mejor del mes (+9 < +21): la fila lo destaca en vez del vs-par.
    await expect(filaB).toContainText('Tu mejor del mes')
    await expect(filaA).not.toContainText('Tu mejor del mes')

    // Hero "Última ronda" = la más nueva del día (B), con su score, su vs-par y el detalle de SU tarjeta (18 hoyos).
    await expect(hero()).toHaveCount(1)
    await expect(hero()).toHaveAttribute('href', `/ronda-libre/${b.codigo}`)
    await expect(hero()).toContainText('81')
    await expect(hero()).toContainText('+9 vs par')
    await expect(hero()).not.toContainText('93')
    await expect(hero().getByLabel('Actividad por hoyo — 18 segmentos')).toBeVisible()
  })

  test('rondas viejas sin vínculo (cancha + fecha): cada fila del historial se usa una sola vez', async () => {
    const hoy = fechaSantiago()
    const ayer = fechaSantiago(1)
    const a = await crearRonda({ estado: 'finalizada', fecha: ayer })
    const b = await crearRonda({ estado: 'finalizada', fecha: ayer })
    await crearHistorico({ fecha: ayer, scores: tarjeta(18, 12), vinculo: null })
    await crearHistorico({ fecha: ayer, scores: tarjeta(18, 18), vinculo: null })

    await abrirDashboard(hoy)

    // Sin vínculo no se sabe cuál es cuál, pero NUNCA el mismo score dos veces (antes las dos decían el de la primera).
    const scoreA = (await filaDe(a).locator('div').filter({ hasText: /^\d+$/ }).first().innerText()).trim()
    const scoreB = (await filaDe(b).locator('div').filter({ hasText: /^\d+$/ }).first().innerText()).trim()
    expect([scoreA, scoreB].sort(), 'cada ronda con una fila distinta del historial').toEqual(['84', '90'])
    await expect(filaDe(a)).toContainText('Ayer')
    // Ninguna es de hoy → no hay Hero "Última ronda" (sí el de ronda nueva).
    await expect(hero()).toHaveCount(0)
  })

  test('ronda finalizada sin tarjeta en el historial: la fila no inventa un score', async () => {
    const hoy = fechaSantiago()
    const anteayer = fechaSantiago(2)
    const sinTarjeta = await crearRonda({ estado: 'finalizada', fecha: hoy })
    const conTarjeta = await crearRonda({ estado: 'finalizada', fecha: anteayer })
    await crearHistorico({ fecha: anteayer, scores: tarjeta(9, 4), vinculo: conTarjeta.jugadorId })
    // Tarjeta mejor (70 = -2) en otra cancha, sin ronda libre: así el 40 NO es "Tu mejor del mes" y su fila tiene que
    // mostrar el vs-par (si no, la fila mostraría "Tu mejor del mes" y el assert del vs-par no probaría nada).
    await crearHistorico({ fecha: anteayer, scores: tarjeta(18, -2), vinculo: null, cancha: 'Otra cancha E2E' })

    await abrirDashboard(hoy)

    await expect(filaDe(sinTarjeta)).toHaveCount(1)
    await expect(filaDe(sinTarjeta), 'sin fila de historial no hay número ni vs-par').not.toContainText(/\d+\s*$|vs par|mejor del mes/)
    // 9 hoyos: el vs-par es contra 36, no contra 72 (40 = +4, no -32).
    await expect(filaDe(conTarjeta).getByText('40', { exact: true })).toBeVisible()
    await expect(filaDe(conTarjeta)).toContainText('+4 vs par')
    await expect(filaDe(conTarjeta)).not.toContainText('-32')
    // El Hero del día sale igual (la ronda es de hoy) pero sin score ("—"): nunca toma la tarjeta de otra ronda.
    await expect(hero()).toHaveAttribute('href', `/ronda-libre/${sinTarjeta.codigo}`)
    await expect(hero()).toContainText('—')
    await expect(hero()).not.toContainText('40')
  })

  test('ronda en curso: el Hero "En vivo" gana sobre la última ronda y lleva al scorer', async () => {
    const hoy = fechaSantiago()
    const fin = await crearRonda({ estado: 'finalizada', fecha: hoy })
    await crearHistorico({ fecha: hoy, scores: tarjeta(18, 10), vinculo: fin.jugadorId })
    const viva = await crearRonda({ estado: 'en_curso', fecha: hoy, scores: { '1': 4, '2': 3, '3': 6, '4': 4, '5': 3 } })

    await abrirDashboard(hoy)

    const enVivo = page.locator(`a[href="/ronda-libre/${viva.codigo}/score"]`)
    await expect(enVivo).toHaveCount(1)
    await expect(enVivo).toContainText(/En vivo/i)
    await expect(enVivo).toContainText('Los Leones')
    await expect(enVivo).toContainText('Continuar')
    await expect(hero(), 'con una ronda en curso no se muestra "Última ronda"').toHaveCount(0)
    // La en curso no entra a "Últimas rondas"; la finalizada sí, con su score.
    await expect(filaDe(viva)).toHaveCount(0)
    await expect(filaDe(fin).getByText('82', { exact: true })).toBeVisible()
  })

  // Protege el fix del 19-oct: loadActiveRondaScores filtraba por `ronda_libre_id` (no existe; es `ronda_id`) y
  // CompetenciaSection fijaba 18 hoyos, así que el Hero decía siempre "Hoyo 1 de 18".
  // Ahora dice el hoyo de cancha en que abre el scorer y cuántos lleva.
  test('ronda en curso: el Hero dice en qué hoyo vas (18 y 9 hoyos)', async () => {
    const hoy = fechaSantiago()
    const cinco = { '1': 4, '2': 3, '3': 6, '4': 4, '5': 3 }
    const de18 = await crearRonda({ estado: 'en_curso', fecha: hoy, holes: 18, scores: cinco })
    await abrirDashboard(hoy)
    await expect(page.locator(`a[href="/ronda-libre/${de18.codigo}/score"]`)).toContainText('Hoyo 6 · 5 de 18 jugados')

    await vaciar()
    const de9 = await crearRonda({ estado: 'en_curso', fecha: hoy, holes: 9, scores: cinco })
    await abrirDashboard(hoy)
    await expect(page.locator(`a[href="/ronda-libre/${de9.codigo}/score"]`)).toContainText('Hoyo 6 · 5 de 9 jugados')
  })
})
