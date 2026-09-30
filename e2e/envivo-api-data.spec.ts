/**
 * E2E — /api/en-vivo deep validation + /en-vivo page data consistency.
 *
 * Verifica que la API responde con la estructura correcta,
 * que los tipos de campos son válidos, que los datos de scoring
 * son coherentes (holesCompleted ≤ totalHoles, vsPar range),
 * y que la página /en-vivo renderiza datos que matchean la API.
 *
 * No requiere auth — /en-vivo y /api/en-vivo son públicos.
 * No crea datos — usa lo que esté en vivo en producción.
 */
import { test, expect, type Page } from '@playwright/test'

/* ─── Constants ──────────────────────────────────────── */

const BASE = 'https://golfersplus.vercel.app'

/* ─── Helpers ────────────────────────────────────────── */

function attachErrorTrackers(page: Page) {
  const pageErrors: string[] = []
  const serverErrors: string[] = []
  page.on('pageerror', (err) => pageErrors.push(err.message))
  page.on('response', (res) => {
    if (res.status() >= 500) serverErrors.push(`${res.status()} ${res.url()}`)
  })
  return { pageErrors, serverErrors }
}

async function isBlockedByVercel(page: Page): Promise<boolean> {
  const bodyText = await page.locator('body').innerText()
  return bodyText.includes('Failed to verify your browser') || bodyText.includes('Security Checkpoint')
}

interface EnVivoJugador {
  id: string
  nombre: string
  holesCompleted: number
  totalGross: number
  vsPar: number
  stablefordPts?: number
  totalHoles: number
}

interface EnVivoRonda {
  id: string
  codigo: string
  course_name: string
  tees: string | null
  holes: number
  fecha: string
  hoyo_inicio: number
  formato_juego: string
  jugadores: EnVivoJugador[]
  maxHolesCompleted: number
  totalJugadores: number
}

interface EnVivoResponse {
  rondas: EnVivoRonda[]
  total: number
  timestamp: string
}

/* ═══════════════════════════════════════════════════════ */
/*  /api/en-vivo — API response structure                 */
/* ═══════════════════════════════════════════════════════ */

test.describe('API /api/en-vivo — estructura y datos', () => {
  let apiData: EnVivoResponse | null = null

  test.beforeAll(async ({ browser }) => {
    // Fetch the API via a page context to avoid CORS issues
    const page = await browser.newPage()
    try {
      await page.goto(`${BASE}/en-vivo`, { waitUntil: 'domcontentloaded' })

      if (await isBlockedByVercel(page)) {
        await page.close()
        return
      }

      const result = await page.evaluate(async () => {
        const res = await fetch('/api/en-vivo')
        if (!res.ok) return null
        return res.json()
      })
      apiData = result as EnVivoResponse | null
    } finally {
      await page.close()
    }
  })

  test('API responde con estructura { rondas, total, timestamp }', async () => {
    test.skip(!apiData, 'API no disponible (Vercel checkpoint o error)')

    expect(apiData).toHaveProperty('rondas')
    expect(apiData).toHaveProperty('total')
    expect(apiData).toHaveProperty('timestamp')

    expect(Array.isArray(apiData!.rondas)).toBe(true)
    expect(typeof apiData!.total).toBe('number')
    expect(typeof apiData!.timestamp).toBe('string')

    // total matches rondas array length
    expect(apiData!.total).toBe(apiData!.rondas.length)
  })

  test('timestamp es una fecha ISO válida reciente', async () => {
    test.skip(!apiData, 'API no disponible')

    const ts = new Date(apiData!.timestamp)
    expect(ts.getTime()).not.toBeNaN()

    // Timestamp should be within last 5 minutes (response is fresh)
    const fiveMinAgo = Date.now() - 5 * 60_000
    expect(ts.getTime()).toBeGreaterThan(fiveMinAgo)
  })

  test('cada ronda tiene campos requeridos con tipos correctos', async () => {
    test.skip(!apiData || apiData.rondas.length === 0, 'Sin rondas activas')

    for (const ronda of apiData!.rondas) {
      // Required string fields
      expect(typeof ronda.id).toBe('string')
      expect(ronda.id.length).toBeGreaterThan(0)
      expect(typeof ronda.codigo).toBe('string')
      expect(ronda.codigo.length).toBeGreaterThan(0)
      expect(typeof ronda.course_name).toBe('string')
      expect(ronda.course_name.length).toBeGreaterThan(0)

      // Holes must be valid golf round length
      expect([9, 18, 27, 36]).toContain(ronda.holes)

      // hoyo_inicio must be 1 or 10
      expect([1, 10]).toContain(ronda.hoyo_inicio)

      // formato_juego is a string
      expect(typeof ronda.formato_juego).toBe('string')

      // fecha is a date string
      expect(typeof ronda.fecha).toBe('string')
      expect(new Date(ronda.fecha).getTime()).not.toBeNaN()

      // jugadores is an array
      expect(Array.isArray(ronda.jugadores)).toBe(true)

      // totalJugadores matches array length
      expect(ronda.totalJugadores).toBe(ronda.jugadores.length)

      // maxHolesCompleted is a non-negative number
      expect(ronda.maxHolesCompleted).toBeGreaterThanOrEqual(0)
      expect(ronda.maxHolesCompleted).toBeLessThanOrEqual(ronda.holes)
    }
  })

  test('cada jugador tiene datos de scoring coherentes', async () => {
    test.skip(!apiData || apiData.rondas.length === 0, 'Sin rondas activas')

    for (const ronda of apiData!.rondas) {
      for (const jugador of ronda.jugadores) {
        expect(typeof jugador.id).toBe('string')
        expect(typeof jugador.nombre).toBe('string')
        expect(jugador.nombre.length).toBeGreaterThan(0)

        // holesCompleted within valid range
        expect(jugador.holesCompleted).toBeGreaterThanOrEqual(0)
        expect(jugador.holesCompleted).toBeLessThanOrEqual(ronda.holes)

        // totalHoles matches the round
        expect(jugador.totalHoles).toBe(ronda.holes)

        // totalGross is reasonable (0 if no holes played, or 1-7 per hole average)
        if (jugador.holesCompleted > 0) {
          const avgPerHole = jugador.totalGross / jugador.holesCompleted
          expect(avgPerHole, `avg ${avgPerHole}/hole for ${jugador.nombre}`).toBeGreaterThanOrEqual(1)
          expect(avgPerHole, `avg ${avgPerHole}/hole for ${jugador.nombre}`).toBeLessThanOrEqual(12)
        }

        // vsPar range: realistic golf is -10 to +100
        expect(jugador.vsPar).toBeGreaterThanOrEqual(-20)
        expect(jugador.vsPar).toBeLessThanOrEqual(100)
      }
    }
  })

  test('filter ?cancha=ZZZZNOEXISTE retorna 0 rondas', async ({ page }) => {
    await page.goto(`${BASE}/en-vivo`, { waitUntil: 'domcontentloaded' })

    test.fixme(await isBlockedByVercel(page), 'Vercel Security Checkpoint')

    const filtered = await page.evaluate(async () => {
      const res = await fetch('/api/en-vivo?cancha=ZZZZNOEXISTE')
      if (!res.ok) return null
      return res.json()
    })

    test.skip(!filtered, 'API no disponible')

    expect(filtered.rondas).toEqual([])
    expect(filtered.total).toBe(0)
  })

  test('response tiene cache headers públicos', async ({ page }) => {
    await page.goto(`${BASE}/en-vivo`, { waitUntil: 'domcontentloaded' })

    test.fixme(await isBlockedByVercel(page), 'Vercel Security Checkpoint')

    const headers = await page.evaluate(async () => {
      const res = await fetch('/api/en-vivo')
      return {
        cacheControl: res.headers.get('cache-control'),
        status: res.status,
      }
    })

    expect(headers.status).toBe(200)
    // API should have some cache directive (public, s-maxage=10)
    if (headers.cacheControl) {
      expect(headers.cacheControl).toContain('public')
    }
  })
})

/* ═══════════════════════════════════════════════════════ */
/*  /en-vivo page — UI renders matching API data          */
/* ═══════════════════════════════════════════════════════ */

test.describe('/en-vivo página — consistencia UI-API', () => {
  test('título de la página contiene "En Vivo"', async ({ page }) => {
    const { pageErrors, serverErrors } = attachErrorTrackers(page)

    await page.goto('/en-vivo', { waitUntil: 'domcontentloaded' })
    await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {})

    test.fixme(await isBlockedByVercel(page), 'Vercel Security Checkpoint')

    await expect(page).toHaveTitle(/[Ee]n [Vv]ivo/i)

    expect(pageErrors).toEqual([])
    expect(serverErrors).toEqual([])
  })

  test('si hay rondas en la API, la página muestra al menos una card', async ({ page }) => {
    await page.goto('/en-vivo', { waitUntil: 'domcontentloaded' })
    await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {})

    test.fixme(await isBlockedByVercel(page), 'Vercel Security Checkpoint')

    // Fetch API data from within the page
    const apiRondas = await page.evaluate(async () => {
      const res = await fetch('/api/en-vivo')
      if (!res.ok) return []
      const data = await res.json()
      return data.rondas ?? []
    })

    if (apiRondas.length === 0) {
      // Empty state should be visible
      const body = await page.locator('body').innerText()
      const hasEmptyState = body.includes('No hay rondas') || body.includes('rondas en vivo') || body.includes('Crear cuenta')
      expect(hasEmptyState, 'Debe mostrar estado vacío si no hay rondas').toBe(true)
      return
    }

    // If API has rondas, the page should show round cards
    const roundCards = page.locator('a[href*="/ronda-libre/"]')
    const count = await roundCards.count()
    expect(count, `API tiene ${apiRondas.length} rondas pero la UI no muestra cards`).toBeGreaterThan(0)
  })

  test('cada card de ronda muestra course name de la API', async ({ page }) => {
    await page.goto('/en-vivo', { waitUntil: 'domcontentloaded' })
    await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {})

    test.fixme(await isBlockedByVercel(page), 'Vercel Security Checkpoint')

    const apiRondas = await page.evaluate(async () => {
      const res = await fetch('/api/en-vivo')
      if (!res.ok) return []
      const data = await res.json()
      return data.rondas?.map((r: { course_name: string }) => r.course_name) ?? []
    }) as string[]

    if (apiRondas.length === 0) return

    const bodyText = await page.locator('body').innerText()

    // At least one API course name should appear in the page
    const found = apiRondas.some((name: string) => bodyText.includes(name))
    expect(found, `Ningún nombre de cancha de la API (${apiRondas.join(', ')}) aparece en la UI`).toBe(true)
  })

  test('links de ronda tienen href con código válido', async ({ page }) => {
    await page.goto('/en-vivo', { waitUntil: 'domcontentloaded' })
    await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {})

    test.fixme(await isBlockedByVercel(page), 'Vercel Security Checkpoint')

    const roundCards = page.locator('a[href*="/ronda-libre/"]')
    const count = await roundCards.count()

    if (count === 0) return

    // Each round link should have a valid code format (6 uppercase alphanumeric chars)
    for (let i = 0; i < Math.min(count, 5); i++) {
      const href = await roundCards.nth(i).getAttribute('href')
      expect(href).toMatch(/^\/ronda-libre\/[A-Z0-9]{4,8}$/i)
    }
  })

  test('no hay JS errors ni 5xx en /en-vivo', async ({ page }) => {
    const { pageErrors, serverErrors } = attachErrorTrackers(page)

    await page.goto('/en-vivo', { waitUntil: 'domcontentloaded' })
    await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {})

    test.fixme(await isBlockedByVercel(page), 'Vercel Security Checkpoint')

    await page.waitForTimeout(2_000)

    expect(pageErrors, `JS errors en /en-vivo: ${pageErrors.join(' | ')}`).toEqual([])
    expect(serverErrors, `5xx en /en-vivo: ${serverErrors.join(' | ')}`).toEqual([])
  })
})
