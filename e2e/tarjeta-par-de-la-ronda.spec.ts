/**
 * Tarjeta guardada — el par lo manda la RONDA, no el catálogo (protege #583)
 *
 * `/perfil/historial/[id]` (dueño) y `/tarjeta/[id]` (link público) pintaban los pares
 * SOLO del catálogo de la cancha e ignoraban el `par_per_hole` de la ronda. En prod le
 * pasó a 4 rondas reales: el nueve de vuelta de Los Leones guardado como hoyos 1..9 se
 * pintaba con los pares del nueve de ida (birdies y bogeys inventados) y la lista del
 * historial decía otra cosa que el detalle.
 *
 * Este spec deja fijo, con datos que discriminan el camino viejo del nuevo:
 *  1. Nueve de vuelta guardado 1..9: pares, conteo de birdies/bogeys, vs-par, "9 hoyos"
 *     y SIN fila IN — iguales en la lista, el detalle del dueño, el link con sesión y el
 *     link anónimo.
 *  2. 18 hoyos con par de la ronda 71 (la cancha dice 72): vs-par +9, no +8.
 *  3. Ronda sin `par_per_hole`: rellena con el catálogo (par 72).
 *  4. Red caída ≠ "no existe": falla la ronda o el catálogo → "No pudimos cargar…" con
 *     Reintentar, que vuelve a cargar la tarjeta correcta. Un id inexistente sigue
 *     diciendo "No se encontró la ronda" / "Tarjeta no encontrada".
 *  5. Una ronda privada no se ve por el link para un visitante anónimo.
 *
 * Fixture: rondas del usuario E2E en `historical_rounds` (privadas salvo la del link
 * público), borradas en afterAll. No toca datos de jugadores reales.
 */
import { test, expect, type Page } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
import { getTestUserId } from './helpers/ronda-fixture'

const COURSE_NAME = 'Los Leones'
const COURSE_ID = 'b1b6ba60-18f0-48a8-97c2-ef10e25fbe26'
const NOTA = 'E2E par de la ronda — no borrar a mano'

/** Catálogo real de Los Leones (course_holes), verificado el 17-oct-2026. El spec lo relee en beforeAll. */
const PARES_IDA = [4, 4, 3, 5, 4, 3, 4, 4, 5]
const PARES_VUELTA = [4, 3, 4, 4, 3, 4, 4, 5, 5]

function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY')
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
}

function aParPerHole(pares: number[]): Record<string, number> {
  return Object.fromEntries(pares.map((p, i) => [String(i + 1), p]))
}

function haceDias(n: number): string {
  return new Date(Date.now() - n * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
}

const suma = (xs: number[]) => xs.reduce((a, b) => a + b, 0)

// ─── Rondas de la fixture ───────────────────────────────────────────────────

/**
 * 1. Nueve de vuelta guardado como 1..9 (así lo guardan el scorer y Garmin).
 * Contra los pares de la vuelta: bogey en 1 y 8, birdie en 4 → 1 birdie, 2 bogeys, 6 pares, 37 (+1).
 * Contra los pares de la ida (el bug): 1 eagle, 2 birdies, 3 bogeys, 1 doble → otra tarjeta.
 */
const VUELTA_GOLPES = [5, 3, 4, 3, 3, 4, 4, 6, 5]
/** 2. 18 hoyos; la ronda trae el 18 como par 4 (71). Golpes = par del catálogo + 8 bogeys repartidos. */
const PAR71 = [...PARES_IDA, ...PARES_VUELTA.slice(0, 8), 4]
const PAR71_GOLPES = [5, 5, 3, 6, 5, 3, 5, 4, 5, 5, 3, 5, 4, 3, 5, 4, 5, 5] // 80
/** 3. 18 hoyos sin par de la ronda → manda el catálogo (72). */
const SIN_PAR_GOLPES = [3, 4, 4, 5, 4, 3, 5, 4, 5, 4, 3, 4, 5, 3, 4, 4, 7, 5] // 76: birdie 1, bogeys 3/7/13, doble 17

interface Fixture { vuelta: string; par71: string; sinPar: string; privada: string }

/**
 * Borra TODAS las rondas de esta fixture del usuario E2E (por `notes`, no por ids en memoria): si una
 * corrida anterior murió sin limpiar, sus filas chocarían con `uq_historical_user_date_course_gross`
 * y dejarían el spec rojo todo el día, además de quedar en el historial del usuario de pruebas.
 */
async function borrarFixture(userId: string): Promise<void> {
  const { error } = await adminClient().from('historical_rounds').delete().eq('user_id', userId).eq('notes', NOTA)
  if (error) throw new Error(`[tarjeta-par-de-la-ronda] no se pudo borrar la fixture: ${error.message}`)
}

async function crearFixture(userId: string): Promise<Fixture> {
  const sb = adminClient()
  await borrarFixture(userId)
  const base = {
    user_id: userId,
    course_name: COURSE_NAME,
    course_id: COURSE_ID,
    tee_color: 'blanco',
    formato_juego: 'stroke_play',
    modo_juego: 'gross',
    notes: NOTA,
  }
  const filas: Array<Record<string, unknown>> = [
    {
      ...base, played_at: haceDias(21), holes_played: 9, scores: VUELTA_GOLPES,
      total_gross: suma(VUELTA_GOLPES), par_per_hole: aParPerHole(PARES_VUELTA),
      course_rating: 35.6, slope_rating: 127, privacy: 'public',
    },
    {
      ...base, played_at: haceDias(22), holes_played: 18, scores: PAR71_GOLPES,
      total_gross: suma(PAR71_GOLPES), par_per_hole: aParPerHole(PAR71),
      course_rating: 71.2, slope_rating: 127, privacy: 'private',
    },
    {
      ...base, played_at: haceDias(23), holes_played: 18, scores: SIN_PAR_GOLPES,
      total_gross: suma(SIN_PAR_GOLPES), par_per_hole: null,
      course_rating: 71.2, slope_rating: 127, privacy: 'private',
    },
    {
      ...base, played_at: haceDias(24), holes_played: 9, scores: VUELTA_GOLPES.map(g => g + 1),
      total_gross: suma(VUELTA_GOLPES) + 9, par_per_hole: aParPerHole(PARES_VUELTA),
      course_rating: 35.6, slope_rating: 127, privacy: 'private',
    },
  ]
  const ids: string[] = []
  for (const fila of filas) {
    const { data, error } = await sb.from('historical_rounds').insert(fila).select('id').single()
    if (error || !data) {
      await borrarFixture(userId)
      throw new Error(`crearFixture falló: ${error?.message}`)
    }
    ids.push(data.id)
  }
  return { vuelta: ids[0], par71: ids[1], sinPar: ids[2], privada: ids[3] }
}

// ─── Lectura de la tarjeta ──────────────────────────────────────────────────

interface TarjetaLeida {
  gross: number
  vsPar: string
  /** Pares de la fila PAR, hoyo por hoyo (OUT y, si hay, IN). */
  pares: number[]
  conteo: Record<'Eagles' | 'Birdies' | 'Pares' | 'Bogeys' | 'Doble+', number>
  tieneFilaIn: boolean
}

/**
 * Lee la tarjeta del DOM del `Scorecard` móvil (Pixel 5 < 768 px → `MobileHalf`). El componente
 * no tiene testids: se lee por estructura (filas grid de 10 columnas: 9 hoyos + total).
 */
async function leerTarjeta(page: Page): Promise<TarjetaLeida> {
  const card = page.locator('.scorecard-paper')
  await expect(card).toBeVisible({ timeout: 20_000 })
  return card.evaluate((el) => {
    const filas = Array.from(el.querySelectorAll<HTMLElement>('div')).filter(d => {
      const cols = getComputedStyle(d).gridTemplateColumns
      return getComputedStyle(d).display === 'grid' && cols.split(' ').length === 10
    })
    const textos = filas.map(f => Array.from(f.children).map(c => (c as HTMLElement).innerText.trim()))
    // Cada mitad: [HOYO…, OUT|IN], [PAR…, total], [golpes…, total+vs-par]
    const pares: number[] = []
    let tieneFilaIn = false
    for (let i = 0; i < textos.length; i++) {
      const label = textos[i][9]
      if (label === 'OUT' || label === 'IN') {
        if (label === 'IN') tieneFilaIn = true
        for (const t of textos[i + 1].slice(0, 9)) pares.push(Number(t))
      }
    }
    const conteo: Record<string, number> = {}
    for (const span of Array.from(el.querySelectorAll('span'))) {
      const l = span.textContent?.trim() ?? ''
      const m = /^(Eagles|Birdies|Pares|Bogeys|Doble\+)\*?$/.exec(l)
      if (m) conteo[m[1]] = Number(span.previousElementSibling?.textContent ?? NaN)
    }
    // Cabecera: span "<gross>" seguido del span "<vs-par>" (fmtOu: E / +n / -n). Se buscan los dos
    // spans hermanos, no un regex sobre el texto: la inicial del jugador también puede ser "E".
    let gross = NaN
    let vsPar = ''
    const header = el.firstElementChild as HTMLElement
    for (const span of Array.from(header.querySelectorAll('span'))) {
      const sig = span.nextElementSibling
      if (/^\d{2,3}$/.test(span.textContent ?? '') && sig?.tagName === 'SPAN' && /^(E|[+-]\d+)$/.test(sig.textContent ?? '')) {
        gross = Number(span.textContent)
        vsPar = sig.textContent ?? ''
      }
    }
    return {
      gross,
      vsPar,
      pares,
      conteo: conteo as TarjetaLeida['conteo'],
      tieneFilaIn,
    }
  })
}

const ESPERADO_VUELTA = {
  gross: 37,
  vsPar: '+1',
  pares: PARES_VUELTA,
  conteo: { Eagles: 0, Birdies: 1, Pares: 6, Bogeys: 2, 'Doble+': 0 },
  tieneFilaIn: false,
}

/**
 * Los tests de red caída provocan errores a propósito: la app los reporta con `captureError` (inserta en
 * `error_logs` de prod y manda a PostHog). Se interceptan para no ensuciar el monitoreo con fallas falsas,
 * y se guardan sus `source` para comprobar que la carga de la tarjeta SÍ reportó su error (no otro componente).
 */
async function silenciarReporteDeErrores(page: Page): Promise<{ fuentes: () => string[] }> {
  const fuentes: string[] = []
  await page.route(/\/rest\/v1\/error_logs/, route => {
    let body: { source?: string } | Array<{ source?: string }> | null = null
    try { body = route.request().postDataJSON() } catch { /* cuerpo no JSON: se cuenta como fuente desconocida */ }
    for (const fila of Array.isArray(body) ? body : [body]) fuentes.push(String(fila?.source))
    return route.fulfill({ status: 201, body: '' })
  })
  await page.route(/posthog\.com/, route => route.fulfill({ status: 200, contentType: 'application/json', body: '{}' }))
  return { fuentes: () => fuentes }
}

// ─── Tests ──────────────────────────────────────────────────────────────────

test.describe('Tarjeta guardada — el par lo manda la ronda (#583)', () => {
  let fx: Fixture
  let userId: string

  test.beforeAll(async () => {
    test.skip(!process.env.E2E_TEST_USER_EMAIL, 'Sin E2E_TEST_USER_EMAIL')
    // La fixture discrimina sólo si el catálogo sigue siendo el que asume el spec.
    const { data, error } = await adminClient()
      .from('course_holes').select('numero, par').eq('course_id', COURSE_ID).order('numero')
    if (error) throw new Error(`No se pudo leer el catálogo de Los Leones: ${error.message}`)
    expect(data?.map(h => h.par), 'El catálogo de Los Leones cambió: actualizar PARES_IDA/PARES_VUELTA').toEqual([...PARES_IDA, ...PARES_VUELTA])
    userId = await getTestUserId()
    fx = await crearFixture(userId)
  })

  test.afterAll(async () => {
    if (userId) await borrarFixture(userId)
  })

  test('nueve de vuelta guardado 1..9: el detalle del dueño usa los pares de la vuelta', async ({ page }) => {
    await page.goto(`/perfil/historial/${fx.vuelta}`)
    await expect(page.getByRole('heading', { name: COURSE_NAME })).toBeVisible({ timeout: 20_000 })
    await expect(page.getByText('9 hoyos', { exact: true })).toBeVisible()
    expect(await leerTarjeta(page)).toEqual(ESPERADO_VUELTA)
    await expect(page.getByText(NOTA)).toBeVisible()
  })

  test('nueve de vuelta: la lista del historial dice lo mismo que el detalle', async ({ page }) => {
    await page.goto('/perfil/historial')
    const fila = page.locator(`#round-card-${fx.vuelta}`)
    // Una sola fila por ronda. (17-oct: en 2 de ~8 cargas justo después de insertar la fixture se vio la lista
    // entera duplicada por un instante; toHaveCount espera a que quede una, y falla si la copia se queda.)
    await expect(fila).toHaveCount(1, { timeout: 20_000 })
    await expect(fila).toBeVisible()
    await expect(fila.getByText('37', { exact: true })).toBeVisible()
    await expect(fila.getByText('+1', { exact: true })).toBeVisible()
    await fila.click()
    await expect(page).toHaveURL(new RegExp(`/perfil/historial/${fx.vuelta}$`))
    expect(await leerTarjeta(page)).toEqual(ESPERADO_VUELTA)
  })

  test('nueve de vuelta: el link /tarjeta/[id] con sesión pinta la misma tarjeta', async ({ page }) => {
    await page.goto(`/tarjeta/${fx.vuelta}`)
    await expect(page.getByRole('heading', { name: COURSE_NAME })).toBeVisible({ timeout: 20_000 })
    await expect(page.getByText(/·\s*9 hoyos/)).toBeVisible()
    expect(await leerTarjeta(page)).toEqual(ESPERADO_VUELTA)
    await expect(page.getByRole('link', { name: /Mi historial/ })).toBeVisible()
  })

  test('nueve de vuelta: un visitante anónimo ve la misma tarjeta y no ve las notas', async ({ browser }) => {
    const ctx = await browser.newContext({ storageState: { cookies: [], origins: [] } })
    const page = await ctx.newPage()
    try {
      await page.goto(`/tarjeta/${fx.vuelta}`)
      await expect(page.getByRole('heading', { name: COURSE_NAME })).toBeVisible({ timeout: 20_000 })
      expect(await leerTarjeta(page)).toEqual(ESPERADO_VUELTA)
      await expect(page.getByText(NOTA)).toHaveCount(0)
      await expect(page.getByText('Registra tu propio score')).toBeVisible()
    } finally {
      await ctx.close()
    }
  })

  test('18 hoyos con par de la ronda 71: vs-par +9 (no +8 del catálogo) y el 18 es par 4', async ({ page }) => {
    await page.goto(`/perfil/historial/${fx.par71}`)
    const t = await leerTarjeta(page)
    expect(t.pares).toEqual(PAR71)
    expect(t.gross).toBe(80)
    expect(t.vsPar).toBe('+9')
    expect(t.tieneFilaIn).toBe(true)
    // 5 en el 18: bogey contra el par 4 de la ronda (con el catálogo sería par).
    expect(t.conteo).toEqual({ Eagles: 0, Birdies: 0, Pares: 9, Bogeys: 9, 'Doble+': 0 })
    await page.goto('/perfil/historial')
    const fila = page.locator(`#round-card-${fx.par71}`)
    await expect(fila).toHaveCount(1, { timeout: 20_000 })
    await expect(fila.getByText('80', { exact: true })).toBeVisible()
    await expect(fila.getByText('+9', { exact: true })).toBeVisible()
  })

  test('ronda sin par propio: rellena con el catálogo de la cancha (72)', async ({ page }) => {
    await page.goto(`/perfil/historial/${fx.sinPar}`)
    const t = await leerTarjeta(page)
    expect(t.pares).toEqual([...PARES_IDA, ...PARES_VUELTA])
    expect(t.gross).toBe(76)
    expect(t.vsPar).toBe('+4')
    expect(t.conteo).toEqual({ Eagles: 0, Birdies: 1, Pares: 13, Bogeys: 3, 'Doble+': 1 })
  })

  test('falla el catálogo: error reintentable (no una tarjeta sin pares) y Reintentar la carga bien', async ({ page }) => {
    const reporte = await silenciarReporteDeErrores(page)
    let bloquear = true
    await page.route('**/rest/v1/course_holes**', route => (bloquear ? route.abort('internetdisconnected') : route.continue()))
    await page.goto(`/perfil/historial/${fx.vuelta}`)
    await expect(page.getByRole('alert').filter({ hasText: 'No pudimos cargar' })).toContainText('No pudimos cargar la ronda. Revisa tu conexión.', { timeout: 20_000 })
    await expect(page.getByText('No se encontró la ronda')).toHaveCount(0)
    await expect(page.locator('.scorecard-paper')).toHaveCount(0)
    await expect.poll(reporte.fuentes, { message: 'la falla del catálogo debe reportarse' }).toContain('tarjeta-guardada.detalle')
    bloquear = false
    await page.getByRole('button', { name: 'Reintentar' }).click()
    expect(await leerTarjeta(page)).toEqual(ESPERADO_VUELTA)
  })

  test('link público sin red: "No pudimos cargar la tarjeta" con Reintentar, no "Tarjeta no encontrada"', async ({ page }) => {
    const reporte = await silenciarReporteDeErrores(page)
    let bloquear = true
    await page.route('**/rest/v1/historical_rounds**', route => (bloquear ? route.abort('internetdisconnected') : route.continue()))
    await page.goto(`/tarjeta/${fx.vuelta}`)
    await expect(page.getByRole('alert').filter({ hasText: 'No pudimos cargar' })).toContainText('No pudimos cargar la tarjeta. Revisa tu conexión.', { timeout: 20_000 })
    await expect(page.getByText('Tarjeta no encontrada')).toHaveCount(0)
    await expect.poll(() => reporte.fuentes().filter(f => f.startsWith('tarjeta-guardada')), { message: 'la falla de red debe reportarse' }).not.toHaveLength(0)
    bloquear = false
    await page.getByRole('button', { name: 'Reintentar' }).click()
    expect(await leerTarjeta(page)).toEqual(ESPERADO_VUELTA)
  })

  test('id inexistente: "No se encontró la ronda" y "Tarjeta no encontrada" (sin Reintentar)', async ({ page }) => {
    const inexistente = '00000000-0000-4000-8000-000000000583'
    await page.goto(`/perfil/historial/${inexistente}`)
    await expect(page.getByText('No se encontró la ronda')).toBeVisible({ timeout: 20_000 })
    await expect(page.getByRole('button', { name: 'Reintentar' })).toHaveCount(0)
    await page.goto(`/tarjeta/${inexistente}`)
    await expect(page.getByRole('heading', { name: 'Tarjeta no encontrada' })).toBeVisible({ timeout: 20_000 })
    await page.goto('/tarjeta/no-es-un-uuid')
    await expect(page.getByRole('heading', { name: 'Tarjeta no encontrada' })).toBeVisible({ timeout: 20_000 })
  })

  test('ronda privada: el dueño la ve, un anónimo por el link ve "Tarjeta no encontrada"', async ({ page, browser }) => {
    await page.goto(`/tarjeta/${fx.privada}`)
    const t = await leerTarjeta(page)
    expect(t.gross).toBe(46)
    expect(t.vsPar).toBe('+10')
    const ctx = await browser.newContext({ storageState: { cookies: [], origins: [] } })
    const anon = await ctx.newPage()
    try {
      await anon.goto(`/tarjeta/${fx.privada}`)
      await expect(anon.getByRole('heading', { name: 'Tarjeta no encontrada' })).toBeVisible({ timeout: 20_000 })
      await expect(anon.getByText(NOTA)).toHaveCount(0)
    } finally {
      await ctx.close()
    }
  })
})
