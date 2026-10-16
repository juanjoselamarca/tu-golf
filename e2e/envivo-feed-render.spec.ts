import { test, expect, type Page, type Route } from '@playwright/test'
import { formatThru, THRU_LABEL } from '../src/golf/leaderboard/thru'
import { formatVsPar } from '../src/golf/share/vs-par'
import { formatPuntosStableford } from '../src/golf/leaderboard/formato-score'

/**
 * E2E: /en-vivo pinta BIEN lo que manda /api/en-vivo.
 *
 * Los specs que ya existen (leaderboard-envivo, envivo-api-data) leen el feed real de
 * prod, que casi siempre está vacío: sus aserciones de orden y scores pasan en vacío.
 * Acá /api/en-vivo está mockeado con rondas fijas, así cada regla de la vista se
 * ejercita siempre:
 *   - orden: menor vs par primero, Stableford por puntos, sin hoyos jugados al final
 *   - Stableford neto llega "solo bruto" (decisión 08-oct): nunca se muestran puntos
 *   - chip de hoyos (9 vs 18), Thru, formato, "+N más", agrupado por cancha
 *   - anónimo: sin scores, "Ver →" y CTA de registro
 *   - búsqueda (3+ rondas) manda ?cancha=, error con Reintentar, estado vacío
 *
 * No toca la base: solo se cargan páginas.
 */

interface Jugador {
  id: string
  nombre: string
  holesCompleted: number
  totalGross: number
  vsPar: number
  stablefordPts: number | null
  totalHoles: number
}

const HACE_2H = () => new Date(Date.now() - 2 * 3600_000 - 5 * 60_000).toISOString()

function jugador(id: string, nombre: string, holesCompleted: number, vsPar: number, totalHoles: number, pts: number | null = null): Jugador {
  return { id, nombre, holesCompleted, totalGross: holesCompleted * 4 + vsPar, vsPar, stablefordPts: pts, totalHoles }
}

const CANCHA_A = 'Club De Golf Los Leones'
const CANCHA_B = 'Club de Golf La Dehesa'

function feed() {
  return [
    {
      // Stroke play 18h, 6 jugadores (solo se ven 4), uno sin hoyos jugados.
      id: 'r-e2e-stroke', codigo: 'E2EST1', course_name: CANCHA_A, tees: 'Azules', holes: 18,
      fecha: '2026-10-16', inicio: HACE_2H(), hoyo_inicio: 1, formato_juego: 'stroke_play', muestra_puntos: false,
      jugadores: [
        jugador('j1', 'Ana Pérez', 9, 3, 18),
        jugador('j2', 'Beto Rojas', 12, -1, 18),
        jugador('j3', 'Caro Silva', 0, 0, 18),
        jugador('j4', 'Dani Soto', 12, 0, 18),
        jugador('j5', 'Eli Mora', 11, 7, 18),
        jugador('j6', 'Fran Díaz', 10, 9, 18),
      ],
      maxHolesCompleted: 12, totalJugadores: 6,
    },
    {
      // Stableford gross 9h desde el 10, terminado: ordena por puntos.
      id: 'r-e2e-stab', codigo: 'E2ESB2', course_name: CANCHA_A, tees: 'Blancas', holes: 9,
      fecha: '2026-10-16', inicio: HACE_2H(), hoyo_inicio: 10, formato_juego: 'stableford', muestra_puntos: true,
      jugadores: [
        jugador('k1', 'Gabi Núñez', 9, 4, 9, 15),
        jugador('k2', 'Hugo Vera', 9, 1, 9, 19),
      ],
      maxHolesCompleted: 9, totalJugadores: 2,
    },
    {
      // Stableford NETO: el feed público es solo bruto → sin puntos, orden por vs par.
      id: 'r-e2e-neto', codigo: 'E2ESN3', course_name: CANCHA_B, tees: 'Azules', holes: 18,
      fecha: '2026-10-16', inicio: HACE_2H(), hoyo_inicio: 1, formato_juego: 'stableford', muestra_puntos: false,
      jugadores: [
        jugador('m1', 'Iván Lagos', 5, 4, 18, null),
        jugador('m2', 'Juana Ríos', 5, 2, 18, null),
      ],
      maxHolesCompleted: 5, totalJugadores: 2,
    },
  ]
}

type Rondas = ReturnType<typeof feed>

/** Mockea /api/en-vivo; devuelve la lista de query strings pedidos. */
async function mockFeed(page: Page, responder: (url: URL) => { status: number; rondas?: Rondas }) {
  const pedidos: string[] = []
  await page.route(/\/api\/en-vivo(\?|$)/, async (route: Route) => {
    const url = new URL(route.request().url())
    pedidos.push(url.search)
    const { status, rondas } = responder(url)
    await route.fulfill({
      status,
      contentType: 'application/json',
      body: status === 200
        ? JSON.stringify({ rondas, total: rondas?.length ?? 0, timestamp: new Date().toISOString() })
        : JSON.stringify({ error: 'boom' }),
    })
  })
  return pedidos
}

function tarjeta(page: Page, codigo: string) {
  return page.locator(`a[href="/ronda-libre/${codigo}"]`)
}

/** Nombres de las filas de jugadores de una tarjeta, en el orden en que se ven. */
async function ordenVisible(page: Page, codigo: string): Promise<string[]> {
  const texto = await tarjeta(page, codigo).innerText()
  return [...texto.matchAll(/^\s*\d+\.\s+(.+?)\s*$/gm)].map(m => m[1].split(/\s{2,}|\t/)[0].trim())
}

async function abrir(page: Page) {
  await page.goto('/en-vivo', { waitUntil: 'domcontentloaded' })
  await expect(page.getByRole('heading', { name: 'En Vivo', level: 1 })).toBeVisible({ timeout: 20_000 })
}

test.describe('/en-vivo con sesión — orden y scores del feed', () => {
  test.beforeEach(() => {
    if (!process.env.E2E_TEST_USER_EMAIL || !process.env.E2E_TEST_USER_PASSWORD) {
      test.skip(true, 'E2E_TEST_USER_EMAIL/PASSWORD no configurados')
    }
  })

  test('stroke play: menor vs par primero, sin hoyos al final, máximo 4 filas y "+2 más"', async ({ page }) => {
    const pageErrors: string[] = []
    page.on('pageerror', e => pageErrors.push(e.message))
    await mockFeed(page, () => ({ status: 200, rondas: feed() }))
    await abrir(page)

    const card = tarjeta(page, 'E2EST1')
    await expect(card).toBeVisible()
    // Con sesión se ven los scores: esperar al primero antes de leer el orden.
    await expect(card.getByText(`${formatVsPar(-1)}`, { exact: true })).toBeVisible({ timeout: 15_000 })

    // Beto −1 · Dani E · Ana +3 · Eli +7 · (Fran +9 queda fuera) · Caro sin hoyos al final → fuera del top 4.
    const orden = await ordenVisible(page, 'E2EST1')
    expect(orden).toEqual(['Beto Rojas', 'Dani Soto', 'Ana Pérez', 'Eli Mora'])
    await expect(card.getByText('+2 más')).toBeVisible()
    await expect(card.getByText('Caro Silva')).toHaveCount(0)

    // Score en curso: "vs par" + "en N hoyos".
    await expect(card.getByText(formatVsPar(0), { exact: true })).toBeVisible()
    await expect(card.getByText(formatVsPar(3), { exact: true })).toBeVisible()
    await expect(card.getByText('en 12 hoyos').first()).toBeVisible()
    await expect(card.getByText('en 9 hoyos')).toBeVisible()

    // Cabecera de la tarjeta.
    await expect(card.getByText('18 HOYOS')).toBeVisible()
    await expect(card.getByText(`${THRU_LABEL} ${formatThru(12, 18)}`, { exact: true })).toBeVisible()
    await expect(card.getByText('6 jugadores · Hace 2h')).toBeVisible()

    expect(pageErrors).toEqual([])
  })

  test('Stableford gross de 9 hoyos: ordena por puntos, muestra "pts" y Thru F', async ({ page }) => {
    await mockFeed(page, () => ({ status: 200, rondas: feed() }))
    await abrir(page)

    const card = tarjeta(page, 'E2ESB2')
    await expect(card.getByText(formatPuntosStableford(19, { conUnidad: true }))).toBeVisible({ timeout: 15_000 })
    expect(await ordenVisible(page, 'E2ESB2')).toEqual(['Hugo Vera', 'Gabi Núñez'])
    await expect(card.getByText(formatPuntosStableford(15, { conUnidad: true }))).toBeVisible()
    // Nunca confundir una ronda de 9 con una de 18.
    await expect(card.getByText('9 HOYOS')).toBeVisible()
    await expect(card.getByText(`${THRU_LABEL} ${formatThru(9, 9)}`, { exact: true })).toBeVisible()
    await expect(card.getByText('Stableford', { exact: true })).toBeVisible()
  })

  test('Stableford neto: "solo bruto" — sin puntos, chip "· bruto" y orden por vs par', async ({ page }) => {
    await mockFeed(page, () => ({ status: 200, rondas: feed() }))
    await abrir(page)

    const card = tarjeta(page, 'E2ESN3')
    await expect(card.getByText(formatVsPar(2), { exact: true })).toBeVisible({ timeout: 15_000 })
    await expect(card.getByText('Stableford · bruto')).toBeVisible()
    expect(await ordenVisible(page, 'E2ESN3')).toEqual(['Juana Ríos', 'Iván Lagos'])
    await expect(card.getByText(/\bpts\b/)).toHaveCount(0)
  })

  test('agrupa por cancha: 2 rondas en la misma cancha llevan cabecera y la tarjeta no repite el nombre', async ({ page }) => {
    await mockFeed(page, () => ({ status: 200, rondas: feed() }))
    await abrir(page)

    await expect(page.getByRole('heading', { name: CANCHA_A, level: 2 })).toBeVisible({ timeout: 15_000 })
    await expect(page.getByText('2 rondas', { exact: true })).toBeVisible()
    await expect(tarjeta(page, 'E2EST1').getByText(CANCHA_A)).toHaveCount(0)
    // Cancha con una sola ronda: sin cabecera, el nombre va en la tarjeta.
    await expect(page.getByRole('heading', { name: CANCHA_B, level: 2 })).toHaveCount(0)
    await expect(tarjeta(page, 'E2ESN3').getByText(CANCHA_B)).toBeVisible()
    await expect(page.getByText('3 ACTIVAS')).toBeVisible()

    // A 390 px nada se sale de la pantalla.
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
    expect(overflow).toBeLessThanOrEqual(0)
  })

  test('búsqueda: con 3+ rondas aparece y filtra por cancha con ?cancha=', async ({ page }) => {
    const pedidos = await mockFeed(page, url => {
      const q = (url.searchParams.get('cancha') ?? '').toLowerCase()
      const rondas = feed().filter(r => !q || r.course_name.toLowerCase().includes(q))
      return { status: 200, rondas }
    })
    await abrir(page)
    await expect(tarjeta(page, 'E2ESN3')).toBeVisible({ timeout: 15_000 })

    await page.getByPlaceholder('Buscar cancha...').fill('Dehesa')
    await expect(tarjeta(page, 'E2EST1')).toHaveCount(0, { timeout: 10_000 })
    await expect(tarjeta(page, 'E2ESN3')).toBeVisible()
    expect(pedidos).toContain('?cancha=Dehesa')
    await expect(page.getByText('1 ACTIVA', { exact: true })).toBeVisible()
  })

  test('falla la API: "Sin conexión" y Reintentar recupera el feed', async ({ page }) => {
    let fallar = true
    await mockFeed(page, () => (fallar ? { status: 500 } : { status: 200, rondas: feed() }))
    await abrir(page)

    await expect(page.getByRole('heading', { name: 'Sin conexión' })).toBeVisible({ timeout: 15_000 })
    fallar = false
    await page.getByRole('button', { name: 'Reintentar' }).click()
    await expect(tarjeta(page, 'E2EST1')).toBeVisible({ timeout: 15_000 })
    await expect(page.getByRole('heading', { name: 'Sin conexión' })).toHaveCount(0)
  })

  test('feed vacío con sesión: invita a crear una ronda', async ({ page }) => {
    await mockFeed(page, () => ({ status: 200, rondas: [] }))
    await abrir(page)
    await expect(page.getByRole('heading', { name: 'Nadie jugando ahora' })).toBeVisible({ timeout: 15_000 })
    await expect(page.getByRole('link', { name: /Crea una ronda y empieza a jugar/ })).toHaveAttribute('href', '/ronda-libre/nueva')
  })
})

test.describe('/en-vivo sin sesión — el visitante no ve scores', () => {
  test.use({ storageState: { cookies: [], origins: [] } })

  test('filas con "Ver →" en vez de scores y CTA de registro', async ({ page }) => {
    await mockFeed(page, () => ({ status: 200, rondas: feed() }))
    await abrir(page)

    const card = tarjeta(page, 'E2EST1')
    await expect(card.getByText('1. Beto Rojas')).toBeVisible({ timeout: 15_000 })
    await expect(card.getByText('Ver →')).toHaveCount(4)
    await expect(card.getByText(/en \d+ hoyos?/)).toHaveCount(0)
    await expect(card.getByText(formatVsPar(-1), { exact: true })).toHaveCount(0)
    await expect(tarjeta(page, 'E2ESB2').getByText(/\bpts\b/)).toHaveCount(0)

    await expect(page.getByText('Regístrate para ver scores completos')).toBeVisible()
    await expect(page.getByRole('link', { name: /Crear cuenta — es gratis/ })).toHaveAttribute('href', '/register')
  })

  test('feed vacío sin sesión: invita a crear cuenta', async ({ page }) => {
    await mockFeed(page, () => ({ status: 200, rondas: [] }))
    await abrir(page)
    await expect(page.getByRole('heading', { name: 'Nadie jugando ahora' })).toBeVisible({ timeout: 15_000 })
    await expect(page.getByRole('link', { name: /Crear cuenta — es gratis/ })).toHaveAttribute('href', '/register')
  })
})
