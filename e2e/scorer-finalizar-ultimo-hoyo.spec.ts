import { test, expect, type Page, type Route } from '@playwright/test'
import {
  adminClient,
  createRondaFixture,
  cleanupRondaFixture,
  getTestUserId,
} from './helpers/ronda-fixture'
import { exigirBaseDePruebas } from './helpers/base-de-pruebas'

/**
 * Scorer individual: "Finalizar" espera que el ÚLTIMO hoyo llegue a la base antes de cerrar la ronda (PR #577,
 * hunter 17-oct-2026).
 *
 * Antes el último golpe salía con el debounce de 500 ms y Finalizar seguía sin esperarlo: con mala señal el cierre
 * leía la tarjeta sin el último hoyo (la ronda no se cerraba para todos) o la cerraba antes de que llegara (P0002 y
 * el golpe quedaba fuera de la tarjeta compartida). Ahora `guardarAhora` espera la RPC; sin servidor avisa
 * (`AVISO_FINALIZAR_SIN_SERVIDOR`) y deja reintentar.
 *
 * Cómo se prueba: ronda de 9 hoyos con 8 ya anotados en la base → el scorer abre en el último → "+" (bogey) →
 * Finalizar → Confirmar. La RPC de guardado se intercepta para hacerla lenta o tumbarla; el cierre
 * (`finalizar_ronda_libre`) se registra para comprobar el ORDEN. Todo lo demás va a la base real.
 *
 * SOLO base de pruebas (`node --env-file=.env.local scripts/test-db/e2e-local.mjs -- scorer-finalizar-ultimo-hoyo.spec.ts
 * --project=mobile-chromium-auth`): finalizar escribe en el historial del usuario E2E y recalcula su índice. Al
 * terminar se borra la ronda y la fila del historial, y se recalcula el índice para dejarlo como estaba.
 */

const RPC_GUARDAR = '**/rest/v1/rpc/upsert_ronda_libre_scores'
const RPC_CERRAR = '**/rest/v1/rpc/finalizar_ronda_libre'
const DEMORA_MS = 4_000
// Copy canónico: src/components/ronda/finalizar-copy.ts (AVISO_FINALIZAR_SIN_SERVIDOR).
const AVISO_SIN_SERVIDOR = 'No se pudo finalizar todavía'

interface Ronda { id: string; codigo: string; jugadorId: string; hoyos: number[]; par: Record<number, number> }

let testUserId = ''
const creadas: Ronda[] = []

async function parDeLaCancha(courseId: string): Promise<Record<number, number>> {
  const { data, error } = await adminClient().from('course_holes').select('numero, par').eq('course_id', courseId).order('numero')
  if (error || !data || data.length < 18) throw new Error(`course_holes de ${courseId}: ${error?.message ?? `${data?.length ?? 0} hoyos`}`)
  return Object.fromEntries(data.map(h => [h.numero as number, h.par as number]))
}

/**
 * Ronda de 9 hoyos desde `hoyoInicio` con todos los hoyos menos el último ya anotados (par en todos), así el scorer
 * abre directo en el último (primer hoyo vacío).
 */
async function rondaConUltimoHoyoPendiente(hoyoInicio: 1 | 10): Promise<Ronda> {
  const admin = adminClient()
  const f = await createRondaFixture({ creadorUserId: testUserId, holes: 9 })
  const hoyos = Array.from({ length: 9 }, (_, i) => hoyoInicio + i)
  const par = await parDeLaCancha(f.course_id)
  const previos = Object.fromEntries(hoyos.slice(0, 8).map(h => [String(h), par[h]]))
  const { data: jug, error: e1 } = await admin.from('ronda_libre_jugadores').update({ scores: previos }).eq('ronda_id', f.id).select('id').single()
  if (e1 || !jug) throw new Error(`scores previos: ${e1?.message}`)
  if (hoyoInicio !== 1) {
    const { error: e2 } = await admin.from('rondas_libres').update({ hoyo_inicio: hoyoInicio }).eq('id', f.id)
    if (e2) throw new Error(`hoyo_inicio: ${e2.message}`)
  }
  const r = { id: f.id, codigo: f.codigo, jugadorId: jug.id as string, hoyos, par }
  creadas.push(r)
  return r
}

async function estadoEnBase(r: Ronda) {
  const admin = adminClient()
  const { data: ronda } = await admin.from('rondas_libres').select('estado').eq('id', r.id).single()
  const { data: jug } = await admin.from('ronda_libre_jugadores').select('scores').eq('id', r.jugadorId).single()
  const { data: hist } = await admin
    .from('historical_rounds')
    .select('id, total_gross, holes_played, scores')
    .eq('metadata->>ronda_libre_jugador_id', r.jugadorId)
  return {
    estado: ronda?.estado as string | undefined,
    scores: (jug?.scores ?? {}) as Record<string, number>,
    historial: (hist ?? []) as Array<{ id: string; total_gross: number; holes_played: number; scores: Array<number | null> }>,
  }
}

/** Total bruto de la ronda: par en los 8 primeros hoyos y par + `sobrePar` en el último. */
function totalDe(r: Ronda, sobrePar: number): number {
  return r.hoyos.reduce((s, h) => s + r.par[h], 0) + sobrePar
}

/** Abre el scorer y confirma que quedó parado en el último hoyo de la ronda, sin golpe todavía. */
async function abrirEnElUltimoHoyo(page: Page, r: Ronda) {
  await page.goto(`/ronda-libre/${r.codigo}/score`)
  expect(page.url(), 'el scorer no manda al login').not.toContain('/login')
  await expect(page.getByRole('button', { name: 'Aumentar score' })).toBeVisible({ timeout: 20_000 })
  // Último hoyo: no hay "Siguiente", Finalizar es el botón principal.
  await expect(page.getByRole('button', { name: 'Siguiente hoyo' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Finalizar ronda' })).toBeVisible()
}

/**
 * "+" `sobrePar` veces (sin golpe → par+1, par+2…) y Finalizar → Confirmar, sin pausa: el último golpe sale con el
 * debounce aún corriendo. Cada test usa un `sobrePar` distinto para que los totales no coincidan (ver el test.fail).
 */
async function anotarYFinalizar(page: Page, sobrePar: number) {
  for (let i = 0; i < sobrePar; i++) await page.getByRole('button', { name: 'Aumentar score' }).click()
  await page.getByRole('button', { name: 'Finalizar ronda' }).click()
  await page.getByRole('button', { name: 'Confirmar finalizacion' }).click()
}

function deltaDe(route: Route): Record<string, number> {
  return (route.request().postDataJSON()?.p_delta ?? {}) as Record<string, number>
}

test.describe.configure({ mode: 'serial' })

test.describe('Scorer: Finalizar espera el guardado del último hoyo', () => {
  test.beforeAll(async () => {
    exigirBaseDePruebas('scorer-finalizar-ultimo-hoyo.spec.ts')
    testUserId = await getTestUserId()
    // Restos de una corrida cortada antes del afterAll: con el mismo total y el mismo día chocarían con el índice
    // único del historial (ver el test.fail del final). Sólo filas de ronda libre de hoy del usuario E2E, en la base de pruebas.
    await adminClient().from('historical_rounds').delete()
      .eq('user_id', testUserId).eq('played_at', new Date().toISOString().slice(0, 10))
      .not('metadata->>ronda_libre_jugador_id', 'is', null)
  })

  test.afterAll(async () => {
    const admin = adminClient()
    for (const r of creadas) {
      await admin.from('historical_rounds').delete().eq('metadata->>ronda_libre_jugador_id', r.jugadorId)
      await cleanupRondaFixture(r.id)
    }
    // Finalizar recalculó el índice con la ronda de prueba adentro: se recalcula sin ella.
    if (creadas.length > 0 && testUserId) await admin.rpc('calcular_indice_golfers', { p_user_id: testUserId })
  })

  for (const [hoyoInicio, sobrePar] of [[1, 1], [10, 2]] as const) {
    test(`red lenta (9 hoyos desde el ${hoyoInicio}): la ronda no se cierra hasta que el último golpe llega`, async ({ page }) => {
      const r = await rondaConUltimoHoyoPendiente(hoyoInicio)
      const ultimo = r.hoyos[8]
      const golpeUltimo = r.par[ultimo] + sobrePar

      // Cada guardado tarda DEMORA_MS; se anota cuándo le llega la respuesta al teléfono.
      const respuestas: Array<{ delta: Record<string, number>; status: number; en: number }> = []
      let avisarLlegada: () => void = () => {}
      const guardadoDelUltimoSalio = new Promise<void>(res => { avisarLlegada = res })
      await page.route(RPC_GUARDAR, async route => {
        const delta = deltaDe(route)
        if (delta[String(ultimo)] != null) avisarLlegada()
        await new Promise(res => setTimeout(res, DEMORA_MS))
        const resp = await route.fetch()
        await route.fulfill({ response: resp })
        respuestas.push({ delta, status: resp.status(), en: Date.now() })
      })
      const cierres: number[] = []
      await page.route(RPC_CERRAR, async route => { cierres.push(Date.now()); await route.continue() })


      await abrirEnElUltimoHoyo(page, r)
      await anotarYFinalizar(page, sobrePar)

      // Mientras el último golpe está en camino: el botón avisa y no acepta otro toque, y nada se cerró todavía.
      await guardadoDelUltimoSalio
      const enCurso = page.getByRole('button', { name: 'Finalizando ronda' })
      await expect(enCurso).toBeVisible()
      await expect(enCurso).toBeDisabled()
      await expect(enCurso).toHaveText('Finalizando...')
      const durante = await estadoEnBase(r)
      expect(durante.estado, 'la ronda sigue en curso mientras el último hoyo no llega').toBe('en_curso')
      expect(durante.historial, 'sin historial antes de que llegue el último hoyo').toHaveLength(0)
      expect(cierres, 'no se pidió cerrar la ronda con el último hoyo en camino').toHaveLength(0)

      // Termina: pantalla final con el total real (8 pares + el último hoyo).
      const totalEsperado = totalDe(r, sobrePar)
      await expect(page.getByText('Ronda completada')).toBeVisible({ timeout: 45_000 })
      await expect(page.getByText(String(totalEsperado), { exact: true }).first()).toBeVisible()

      // Orden: el cierre se pidió DESPUÉS de que la respuesta del guardado con el último hoyo llegó al teléfono.
      const conUltimo = respuestas.filter(x => x.delta[String(ultimo)] === golpeUltimo)
      expect(conUltimo.length, 'algún guardado llevó el golpe final del último hoyo').toBeGreaterThan(0)
      expect(conUltimo.every(x => x.status < 300), 'los guardados del último hoyo respondieron OK').toBe(true)
      expect(cierres, 'se pidió cerrar la ronda una sola vez').toHaveLength(1)
      expect(cierres[0], 'el cierre va después de la respuesta del último hoyo').toBeGreaterThan(Math.min(...conUltimo.map(x => x.en)))
      // Ningún guardado posterior al cierre (habría chocado con P0002).
      expect(respuestas.every(x => x.en <= cierres[0]), 'ningún guardado llegó después del cierre').toBe(true)

      // Base: cerrada, tarjeta compartida con los 9 hoyos (y sólo esos) y una fila de historial con el mismo total.
      await expect.poll(async () => (await estadoEnBase(r)).estado, { timeout: 15_000 }).toBe('finalizada')
      const final = await estadoEnBase(r)
      expect(final.scores[String(ultimo)], 'el último golpe está en la tarjeta compartida').toBe(golpeUltimo)
      expect(Object.keys(final.scores).map(Number).sort((a, b) => a - b), 'sólo los hoyos de esta ronda').toEqual(r.hoyos)
      expect(final.historial, 'una sola fila de historial').toHaveLength(1)
      expect(final.historial[0].holes_played).toBe(9)
      expect(final.historial[0].total_gross, 'el historial cuenta el último hoyo').toBe(totalEsperado)
      // Posicional en orden de juego: el último del arreglo es el último hoyo jugado.
      expect(final.historial[0].scores[8]).toBe(golpeUltimo)
    })
  }

  test('sin servidor: avisa, no cierra nada, y al volver la señal Finalizar guarda el último hoyo', async ({ page }) => {
    const r = await rondaConUltimoHoyoPendiente(1)
    const ultimo = r.hoyos[8]
    const sobrePar = 3
    const golpeUltimo = r.par[ultimo] + sobrePar

    let intentosCaidos = 0
    await page.route(RPC_GUARDAR, async route => { intentosCaidos++; await route.abort('internetdisconnected') })
    const cierres: number[] = []
    await page.route(RPC_CERRAR, async route => { cierres.push(Date.now()); await route.continue() })

    await abrirEnElUltimoHoyo(page, r)
    await anotarYFinalizar(page, sobrePar)

    // Aviso canónico, y el botón vuelve a estar disponible para reintentar.
    await expect(page.getByRole('alert').filter({ hasText: AVISO_SIN_SERVIDOR })).toBeVisible({ timeout: 30_000 })
    const finalizar = page.getByRole('button', { name: 'Finalizar ronda' })
    await expect(finalizar).toBeEnabled()
    await expect(page.getByText('Ronda completada')).toHaveCount(0)
    expect(intentosCaidos, 'reintentó el guardado antes de rendirse').toBeGreaterThanOrEqual(3)
    expect(cierres, 'sin servidor no se pide cerrar la ronda').toHaveLength(0)

    const caido = await estadoEnBase(r)
    expect(caido.estado).toBe('en_curso')
    expect(caido.scores[String(ultimo)], 'el último golpe no llegó (servidor caído)').toBeUndefined()
    expect(caido.historial, 'sin historial a medias').toHaveLength(0)

    // Vuelve la señal: el mismo botón termina el trabajo, con el golpe que se anotó sin señal.
    await page.unroute(RPC_GUARDAR)
    await finalizar.click()
    await page.getByRole('button', { name: 'Confirmar finalizacion' }).click()
    const totalEsperado = totalDe(r, sobrePar)
    await expect(page.getByText('Ronda completada')).toBeVisible({ timeout: 45_000 })
    await expect(page.getByText(String(totalEsperado), { exact: true }).first()).toBeVisible()

    await expect.poll(async () => (await estadoEnBase(r)).estado, { timeout: 15_000 }).toBe('finalizada')
    const final = await estadoEnBase(r)
    expect(final.scores[String(ultimo)], 'el golpe anotado sin señal llegó al reintentar').toBe(golpeUltimo)
    expect(final.historial).toHaveLength(1)
    expect(final.historial[0].total_gross).toBe(totalEsperado)
    expect(cierres, 'cerró una sola vez').toHaveLength(1)
  })

  /**
   * BUG (17-oct, zona crítica, sin arreglar): el índice único `uq_historical_user_date_course_gross`
   * (user_id, played_at, course_id, total_gross) trata como duplicada una ronda DISTINTA del mismo día, cancha y total
   * bruto. `guardarTarjetaEnHistorial` lee el 23505 como "ya estaba guardada": la pantalla dice "Ronda completada",
   * pero la segunda ronda nunca entra al historial ni al índice. Pasa en un campeonato de 36 hoyos en un día o con ida
   * y vuelta de 9 hoyos con el mismo total. La clave real de una tarjeta de ronda libre es
   * `metadata.ronda_libre_jugador_id` (índice `ux_historical_rounds_ronda_libre_jugador`).
   * `test.fail()`: se pone rojo cuando se arregle → quitar el `test.fail()`.
   */
  test('dos rondas distintas el mismo día con el mismo total entran las dos al historial', async ({ page }) => {
    test.fail(true, 'uq_historical_user_date_course_gross descarta la 2.ª ronda con el mismo total (pendientes-e2e 17-oct)')
    const ida = await rondaConUltimoHoyoPendiente(1)
    const vuelta = await rondaConUltimoHoyoPendiente(10)
    // Mismo total en las dos (Los Leones: 36 en la ida y 36 en la vuelta, +4 en el último hoyo).
    const sobrePar = 4
    expect(totalDe(ida, sobrePar), 'el escenario necesita el mismo total en las dos rondas').toBe(totalDe(vuelta, sobrePar))

    for (const r of [ida, vuelta]) {
      await abrirEnElUltimoHoyo(page, r)
      await anotarYFinalizar(page, sobrePar)
      await expect(page.getByText('Ronda completada')).toBeVisible({ timeout: 45_000 })
      await expect.poll(async () => (await estadoEnBase(r)).estado, { timeout: 15_000 }).toBe('finalizada')
    }
    expect((await estadoEnBase(ida)).historial, 'la ida está en el historial').toHaveLength(1)
    expect((await estadoEnBase(vuelta)).historial, 'la vuelta también').toHaveLength(1)
  })
})
