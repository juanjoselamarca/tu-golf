import { test, expect, type Page, type Route } from '@playwright/test'
import {
  adminClient,
  createRondaFixture,
  cleanupRondaFixture,
  getTestUserId,
} from './helpers/ronda-fixture'

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
 * Finalizar → Confirmar. La RPC de guardado se intercepta para retenerla (red lenta: el test decide cuándo llega) o
 * tumbarla; el cierre (`finalizar_ronda_libre`) se registra para comprobar el ORDEN. Todo lo demás va a la base real.
 *
 * SOLO base de pruebas (`node --env-file=.env.local scripts/test-db/e2e-local.mjs -- scorer-finalizar-ultimo-hoyo.spec.ts
 * --project=mobile-chromium-auth`): finalizar escribe en el historial del usuario E2E y recalcula su índice. Al
 * terminar se borra la ronda y la fila del historial, y se recalcula el índice para dejarlo como estaba.
 */

const RPC_GUARDAR = '**/rest/v1/rpc/upsert_ronda_libre_scores'
const RPC_CERRAR = '**/rest/v1/rpc/finalizar_ronda_libre'
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
 * Ronda de 9 hoyos desde `hoyoInicio` con los primeros `anotados` hoyos ya en la base (par en todos). Con 8, el scorer
 * abre directo en el último (primer hoyo vacío).
 */
async function rondaConUltimoHoyoPendiente(hoyoInicio: 1 | 10, anotados = 8): Promise<Ronda> {
  const admin = adminClient()
  const f = await createRondaFixture({ creadorUserId: testUserId, holes: 9 })
  const hoyos = Array.from({ length: 9 }, (_, i) => hoyoInicio + i)
  const par = await parDeLaCancha(f.course_id)
  const previos = Object.fromEntries(hoyos.slice(0, anotados).map(h => [String(h), par[h]]))
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

/** El total grande de la pantalla final (va justo debajo de "Ronda completada"). */
function totalEnPantalla(page: Page) {
  return page.getByText('Ronda completada', { exact: true }).locator('xpath=following-sibling::div[1]')
}

interface Guardado { delta: Record<string, number>; entro: number; antesDeResponder?: number; status?: number }

/**
 * Intercepta la RPC de guardado. De los guardados que llevan `hoyo`, los que elige `retener(n)` (n = 1 para el primero
 * que llega, 2 para el segundo…) quedan retenidos hasta `soltar()` (red lenta, con el reloj en manos del test); los
 * demás pasan sin demora. Se elige por ORDEN de llegada, no por reloj: no depende de cuánto tarde un clic en CI.
 * Registra cuándo entró y cuándo se respondió cada uno, para comprobar el orden contra el cierre.
 */
async function retenerGuardadoDelHoyo(page: Page, hoyo: number, retener: (n: number) => boolean) {
  const guardados: Guardado[] = []
  const retenidos: Guardado[] = []
  let soltar: () => void = () => {}
  const soltado = new Promise<void>(res => { soltar = res })
  let avisarRetenido: () => void = () => {}
  const retenido = new Promise<void>(res => { avisarRetenido = res })
  let conHoyo = 0
  await page.route(RPC_GUARDAR, async route => {
    const g: Guardado = { delta: deltaDe(route), entro: Date.now() }
    guardados.push(g)
    if (g.delta[String(hoyo)] != null && retener(++conHoyo)) {
      retenidos.push(g)
      avisarRetenido()
      await soltado
    }
    // Si el test terminó con el guardado retenido, la página ya se cerró: no hay a quién responderle.
    try {
      const resp = await route.fetch()
      g.status = resp.status()
      g.antesDeResponder = Date.now()
      await route.fulfill({ response: resp })
    } catch (e) {
      if (!page.isClosed()) throw e
    }
  })
  const pendientes = () => guardados.filter(g => g.antesDeResponder == null).length
  /** Cuándo respondió el último de los retenidos (el cierre tiene que ir después). */
  const respondieronLosRetenidos = () => Math.max(...retenidos.map(g => g.antesDeResponder ?? Number.POSITIVE_INFINITY))
  return { guardados, retenidos, soltar, retenido, pendientes, respondieronLosRetenidos }
}

test.describe.configure({ mode: 'serial' })

test.describe('Scorer: Finalizar espera el guardado del último hoyo', () => {
  test.beforeAll(async () => {
    testUserId = await getTestUserId()
    // Restos de una corrida cortada antes del afterAll: con el mismo total y el mismo día chocarían con el índice
    // único del historial (ver el test.fail del final). Sólo filas de ronda libre del usuario E2E, en la base de pruebas,
    // de hoy y de ayer (played_at puede quedar con la fecha de Chile o la UTC).
    const hoy = new Date()
    const fechas = [0, 1].map(d => new Date(hoy.getTime() - d * 86_400_000).toISOString().slice(0, 10))
    const { error } = await adminClient().from('historical_rounds').delete()
      .eq('user_id', testUserId).in('played_at', fechas)
      .not('metadata->>ronda_libre_jugador_id', 'is', null)
    if (error) throw new Error(`Limpieza de restos del historial: ${error.message}`)
    // Cada test que finaliza necesita un total bruto distinto (mismo día y cancha → el índice único lo descarta).
    const ronda = await createRondaFixture({ creadorUserId: testUserId, holes: 9 })
    const par = await parDeLaCancha(ronda.course_id)
    await cleanupRondaFixture(ronda.id)
    const ida = [1, 2, 3, 4, 5, 6, 7, 8, 9].reduce((t, h) => t + par[h], 0)
    const vuelta = [10, 11, 12, 13, 14, 15, 16, 17, 18].reduce((t, h) => t + par[h], 0)
    const totales = [ida + 1, vuelta + 2, ida + 5, ida + 6, ida + 3, ida + 4]
    if (new Set(totales).size !== totales.length) throw new Error(`Los totales de los tests se repiten con esta cancha (ida ${ida}, vuelta ${vuelta}): ajustar los sobre par`)
  })

  test.afterAll(async () => {
    const admin = adminClient()
    for (const r of creadas) {
      await admin.from('historical_rounds').delete().eq('metadata->>ronda_libre_jugador_id', r.jugadorId)
      await cleanupRondaFixture(r.id)
    }
    // Finalizar recalculó el índice con la ronda de prueba adentro: se recalcula sin ella.
    if (creadas.length > 0 && testUserId) {
      const { error } = await admin.rpc('calcular_indice_golfers', { p_user_id: testUserId })
      if (error) throw new Error(`No se pudo recalcular el índice del usuario E2E tras limpiar: ${error.message}`)
    }
  })

  for (const [hoyoInicio, sobrePar] of [[1, 1], [10, 2]] as const) {
    test(`red lenta (9 hoyos desde el ${hoyoInicio}): la ronda no se cierra hasta que el último golpe llega`, async ({ page }) => {
      const r = await rondaConUltimoHoyoPendiente(hoyoInicio)
      const ultimo = r.hoyos[8]
      const golpeUltimo = r.par[ultimo] + sobrePar

      const red = await retenerGuardadoDelHoyo(page, ultimo, () => true)
      const cierres: number[] = []
      await page.route(RPC_CERRAR, async route => { cierres.push(Date.now()); await route.continue() })

      await abrirEnElUltimoHoyo(page, r)
      await anotarYFinalizar(page, sobrePar)

      // Mientras el último golpe está retenido: el botón avisa y no acepta otro toque, y nada se cerró todavía.
      await red.retenido
      const enCurso = page.getByRole('button', { name: 'Finalizando ronda' })
      await expect(enCurso).toBeVisible()
      await expect(enCurso).toBeDisabled()
      await expect(enCurso).toHaveText('Finalizando...')
      const durante = await estadoEnBase(r)
      expect(durante.estado, 'la ronda sigue en curso mientras el último hoyo no llega').toBe('en_curso')
      expect(durante.historial, 'sin historial antes de que llegue el último hoyo').toHaveLength(0)
      expect(cierres, 'no se pidió cerrar la ronda con el último hoyo en camino').toHaveLength(0)
      const soltadoEn = Date.now()
      red.soltar()

      // Llega: pantalla final con el total real (8 pares + el último hoyo).
      const totalEsperado = totalDe(r, sobrePar)
      await expect(page.getByText('Ronda completada', { exact: true })).toBeVisible({ timeout: 45_000 })
      await expect(totalEnPantalla(page)).toHaveText(String(totalEsperado))
      await expect.poll(red.pendientes, { message: 'todos los guardados respondieron' }).toBe(0)

      // Orden: el cierre se pidió DESPUÉS de que el guardado retenido respondiera, y una sola vez.
      const conUltimo = red.guardados.filter(g => g.delta[String(ultimo)] === golpeUltimo)
      expect(conUltimo.length, 'algún guardado llevó el golpe final del último hoyo').toBeGreaterThan(0)
      expect(conUltimo.every(g => (g.status ?? 0) < 300), 'los guardados del último hoyo respondieron OK').toBe(true)
      expect(cierres, 'se pidió cerrar la ronda una sola vez').toHaveLength(1)
      expect(cierres[0], 'el cierre va después de soltar el último hoyo').toBeGreaterThan(soltadoEn)
      expect(cierres[0], 'el cierre va después de la respuesta de los guardados retenidos').toBeGreaterThanOrEqual(red.respondieronLosRetenidos())
      // Ningún guardado entró después del cierre (habría chocado con P0002).
      expect(red.guardados.every(g => g.entro <= cierres[0]), 'ningún guardado entró después del cierre').toBe(true)

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

  /**
   * Penúltimo hoyo con un "+" y "Siguiente"; uno de los guardados de ese hoyo se retiene en la red (`retener`); en el
   * último, "+" `sobreParUltimo` veces y Finalizar → Confirmar con ese guardado todavía en camino. Al tocar
   * "Siguiente" salen DOS guardados del penúltimo, siempre en este orden: el reenvío inmediato del respaldo local
   * (`useOfflineResync`, n = 1) y el normal, 500 ms después (debounce, n = 2). Mientras el primero va en camino
   * `syncInProgressRef` no deja salir otro reenvío.
   */
  async function finalizarConElPenultimoEnVuelo(page: Page, sobreParUltimo: number, retener: (n: number) => boolean) {
    const r = await rondaConUltimoHoyoPendiente(1, 7)
    const [penultimo, ultimo] = [r.hoyos[7], r.hoyos[8]]
    const red = await retenerGuardadoDelHoyo(page, penultimo, retener)
    const cierres: number[] = []
    await page.route(RPC_CERRAR, async route => { cierres.push(Date.now()); await route.continue() })

    await page.goto(`/ronda-libre/${r.codigo}/score`)
    const mas = page.getByRole('button', { name: 'Aumentar score' })
    await expect(mas).toBeVisible({ timeout: 20_000 })
    await mas.click()
    await page.getByRole('button', { name: 'Siguiente hoyo' }).click()
    await red.retenido
    await expect(page.getByRole('button', { name: 'Finalizar ronda' })).toBeVisible()
    return { r, penultimo, ultimo, red, cierres }
  }

  /** Lo que tiene que pasar con el penúltimo en vuelo: Finalizar lo espera, y la tarjeta y el historial quedan completos. */
  async function esperaAlPenultimoYCierraCompleta(page: Page, sobreParUltimo: number, v: Awaited<ReturnType<typeof finalizarConElPenultimoEnVuelo>>) {
    const { r, penultimo, ultimo, red, cierres } = v
    const golpePenultimo = r.par[penultimo] + 1
    const golpeUltimo = r.par[ultimo] + sobreParUltimo
    await anotarYFinalizar(page, sobreParUltimo)
    await expect(page.getByRole('button', { name: 'Finalizando ronda' })).toBeDisabled()
    // Unos segundos con el penúltimo retenido: Finalizar no cierra. (El reenvío del respaldo puede mandar el último
    // hoyo en este rato: sale por su cuenta; lo que importa es el guardado de Finalizar y el cierre.)
    await page.waitForTimeout(2_000)
    expect(cierres, 'no cierra con un guardado en vuelo').toHaveLength(0)
    expect((await estadoEnBase(r)).estado).toBe('en_curso')
    const soltadoEn = Date.now()
    red.soltar()

    const totalEsperado = totalDe(r, 1 + sobreParUltimo)
    await expect(page.getByText('Ronda completada', { exact: true })).toBeVisible({ timeout: 45_000 })
    await expect(totalEnPantalla(page)).toHaveText(String(totalEsperado))
    await expect.poll(red.pendientes, { message: 'todos los guardados respondieron' }).toBe(0)

    // Orden: penúltimo retenido → último (el de Finalizar sale después de soltar) → cierre.
    const conUltimo = red.guardados.filter(g => g.delta[String(ultimo)] === golpeUltimo && g.entro >= soltadoEn)
    expect(conUltimo.length, 'Finalizar mandó el último hoyo después de que respondiera el penúltimo').toBeGreaterThan(0)
    expect(cierres, 'cerró una sola vez').toHaveLength(1)
    expect(cierres[0], 'el cierre va después de la respuesta del penúltimo retenido').toBeGreaterThanOrEqual(red.respondieronLosRetenidos())
    expect(cierres[0], 'el cierre va después del último hoyo').toBeGreaterThanOrEqual(Math.max(...conUltimo.map(g => g.antesDeResponder!)))
    expect(red.guardados.every(g => g.entro <= cierres[0]), 'ningún guardado entró después del cierre').toBe(true)

    await expect.poll(async () => (await estadoEnBase(r)).estado, { timeout: 15_000 }).toBe('finalizada')
    const final = await estadoEnBase(r)
    expect(final.scores[String(penultimo)], 'el penúltimo (el que iba en vuelo) está en la tarjeta').toBe(golpePenultimo)
    expect(final.scores[String(ultimo)], 'el último está en la tarjeta').toBe(golpeUltimo)
    expect(final.historial).toHaveLength(1)
    expect(final.historial[0].total_gross).toBe(totalEsperado)
    expect(final.historial[0].scores.slice(7)).toEqual([golpePenultimo, golpeUltimo])
  }

  /**
   * El caso que #577 arregla: el guardado normal del penúltimo (debounce, el 2.º que lo lleva) sigue en camino al tocar
   * Finalizar. `guardarAhora` lo espera y DESPUÉS manda el último hoyo. +1 y +4 = 41 (total único, ver beforeAll).
   */
  test('guardado en vuelo: Finalizar espera el del hoyo anterior y la tarjeta queda completa', async ({ page }) => {
    const v = await finalizarConElPenultimoEnVuelo(page, 4, n => n === 2)
    try {
      await esperaAlPenultimoYCierraCompleta(page, 4, v)
    } finally {
      v.red.soltar()
    }
  })

  /**
   * BUG (17-oct, sin arreglar): el reenvío del respaldo local (`useOfflineResync`, hooks/useOfflineResync.ts:42) corre
   * en CADA render (`useScoreSync` devuelve un objeto nuevo y es dependencia del efecto) y guarda por fuera de
   * `enVueloRef`, así que `guardarAhora` no lo espera: Finalizar cierra la ronda con ese guardado en camino
   * (comprobado: entra el último hoyo ~400 ms después y se cierra). Hoy la tarjeta queda bien (Finalizar manda la
   * tarjeta entera), pero un reenvío viejo que llega tarde puede pisar un hoyo recién corregido en la tarjeta
   * compartida (merge `scores || delta`), al finalizar o en cualquier "Siguiente".
   * `test.fail()`: se pone rojo cuando se arregle → quitar el `test.fail()`. +1 y +5 = 42 (total único, ver beforeAll).
   */
  test('reenvío del respaldo en vuelo: Finalizar también lo espera', async ({ page }) => {
    const v = await finalizarConElPenultimoEnVuelo(page, 5, n => n === 1)
    try {
      // Precondición (fuera del fail): lo retenido es el reenvío inmediato; el del debounce sale ~500 ms después, pasa
      // y responde, así que lo único en vuelo al finalizar es el reenvío. Se mide entre los dos, no contra el clic.
      const delPenultimo = () => v.red.guardados.filter(g => g.delta[String(v.penultimo)] != null)
      await expect.poll(() => delPenultimo().filter(g => g.antesDeResponder != null).length, { message: 'salió y respondió el guardado del debounce' }).toBe(1)
      const [reenvio, debounce] = delPenultimo()
      expect(debounce.entro - reenvio.entro, 'el retenido salió antes que el del debounce').toBeGreaterThanOrEqual(300)
      test.fail(true, 'useOfflineResync guarda por fuera de enVueloRef y Finalizar no lo espera (pendientes-e2e 17-oct)')
      await esperaAlPenultimoYCierraCompleta(page, 5, v)
    } finally {
      v.red.soltar()
    }
  })

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
    await expect(page.getByText('Ronda completada', { exact: true })).toBeVisible({ timeout: 45_000 })
    await expect(totalEnPantalla(page)).toHaveText(String(totalEsperado))

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
    const ida = await rondaConUltimoHoyoPendiente(1)
    const vuelta = await rondaConUltimoHoyoPendiente(10)
    // Mismo total en las dos (Los Leones: 36 en la ida y 36 en la vuelta, +4 en el último hoyo). Si la cancha cambia
    // y los totales no coinciden, el escenario no existe: se salta (no puede contar como "falla esperada").
    const sobrePar = 4
    test.skip(totalDe(ida, sobrePar) !== totalDe(vuelta, sobrePar), 'la ida y la vuelta de la cancha ya no suman lo mismo')
    test.fail(true, 'uq_historical_user_date_course_gross descarta la 2.ª ronda con el mismo total (pendientes-e2e 17-oct)')

    for (const r of [ida, vuelta]) {
      await abrirEnElUltimoHoyo(page, r)
      await anotarYFinalizar(page, sobrePar)
      await expect(page.getByText('Ronda completada', { exact: true })).toBeVisible({ timeout: 45_000 })
      await expect.poll(async () => (await estadoEnBase(r)).estado, { timeout: 15_000 }).toBe('finalizada')
    }
    expect((await estadoEnBase(ida)).historial, 'la ida está en el historial').toHaveLength(1)
    expect((await estadoEnBase(vuelta)).historial, 'la vuelta también').toHaveLength(1)
  })
})
