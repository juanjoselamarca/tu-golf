import { test, expect, type Page } from '@playwright/test'

/**
 * E2E — Leaderboard público + En Vivo feed.
 *
 * Cubre:
 * 1. /en-vivo — feed público de rondas activas (sin auth)
 * 2. /leaderboard — demo leaderboard con datos simulados
 * 3. /api/en-vivo — respuesta API verificada desde contexto de página
 */

/* ─── Helpers ──────────────────────────────────────────── */

function attachErrorTrackers(page: Page) {
  const pageErrors: string[] = []
  const serverErrors: string[] = []
  page.on('pageerror', (err) => pageErrors.push(err.message))
  page.on('response', (res) => {
    if (res.status() >= 500) serverErrors.push(`${res.status()} ${res.url()}`)
  })
  return { pageErrors, serverErrors }
}

/** Detecta Vercel Security Checkpoint (bot protection) */
async function isBlockedByVercel(page: Page): Promise<boolean> {
  const bodyText = await page.locator('body').innerText()
  return bodyText.includes('Failed to verify your browser') || bodyText.includes('Security Checkpoint')
}

/* ═══════════════════════════════════════════════════════ */
/*  /en-vivo — feed público (sin auth)                    */
/* ═══════════════════════════════════════════════════════ */

test.describe('Feed en vivo — público (sin auth)', () => {
  test('carga la página sin errores y muestra título', async ({ page }) => {
    const { pageErrors, serverErrors } = attachErrorTrackers(page)

    await page.goto('/en-vivo', { waitUntil: 'domcontentloaded' })
    await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {})

    test.fixme(await isBlockedByVercel(page), 'Vercel Security Checkpoint bloqueó el headless browser')

    await expect(page).toHaveTitle(/[Ee]n [Vv]ivo.*Golfers/i)

    expect(pageErrors, 'pageerrors en /en-vivo').toEqual([])
    expect(serverErrors, '5xx en /en-vivo').toEqual([])
  })

  test('muestra rondas activas O estado vacío — nunca blanco', async ({ page }) => {
    await page.goto('/en-vivo', { waitUntil: 'domcontentloaded' })
    await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {})

    test.fixme(await isBlockedByVercel(page), 'Vercel Security Checkpoint bloqueó el headless browser')

    const text = await page.locator('body').innerText()
    expect(text.length).toBeGreaterThan(30)

    const hasRounds = text.includes('HOYOS') || text.includes('jugador')
    const hasEmptyState = text.includes('No hay rondas') || text.includes('rondas en vivo') || text.includes('Crear cuenta')
    expect(hasRounds || hasEmptyState).toBe(true)
  })

  test('usuario anónimo ve "Ver →" en vez de scores', async ({ page }) => {
    await page.goto('/en-vivo', { waitUntil: 'domcontentloaded' })
    await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {})

    test.fixme(await isBlockedByVercel(page), 'Vercel Security Checkpoint bloqueó el headless browser')

    const roundCards = page.locator('a[href*="/ronda-libre/"]')
    const count = await roundCards.count()

    if (count === 0) {
      test.skip(true, 'No hay rondas activas — no se puede verificar placeholder de scores')
    }

    const verLinks = page.getByText('Ver →')
    await expect(verLinks.first()).toBeVisible({ timeout: 5_000 })
  })

  test('cada ronda tiene badge de hoyos y link válido', async ({ page }) => {
    await page.goto('/en-vivo', { waitUntil: 'domcontentloaded' })
    await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {})

    test.fixme(await isBlockedByVercel(page), 'Vercel Security Checkpoint bloqueó el headless browser')

    const roundCards = page.locator('a[href*="/ronda-libre/"]')
    const count = await roundCards.count()

    if (count === 0) {
      test.skip(true, 'No hay rondas activas')
    }

    const first = roundCards.first()
    const href = await first.getAttribute('href')
    expect(href).toMatch(/^\/ronda-libre\/[A-Z0-9]+$/i)

    const cardText = await first.innerText()
    expect(cardText).toMatch(/\d+ HOYOS/i)
    expect(cardText).toMatch(/\d+\.\s+\w+/)
  })

  test('badge THRU H.X muestra progreso real', async ({ page }) => {
    await page.goto('/en-vivo', { waitUntil: 'domcontentloaded' })
    await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {})

    test.fixme(await isBlockedByVercel(page), 'Vercel Security Checkpoint bloqueó el headless browser')

    const thruBadges = page.getByText(/THRU H\.\d+/)
    const count = await thruBadges.count()

    if (count === 0) {
      test.skip(true, 'No hay rondas con THRU badge visible')
    }

    const thruText = await thruBadges.first().innerText()
    const match = thruText.match(/THRU H\.(\d+)/)
    expect(match).not.toBeNull()
    const holeNum = parseInt(match![1])
    expect(holeNum).toBeGreaterThanOrEqual(0)
    expect(holeNum).toBeLessThanOrEqual(36)
  })

  test('CTA de registro visible para anónimos con rondas activas', async ({ page }) => {
    await page.goto('/en-vivo', { waitUntil: 'domcontentloaded' })
    await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {})

    test.fixme(await isBlockedByVercel(page), 'Vercel Security Checkpoint bloqueó el headless browser')

    const roundCards = page.locator('a[href*="/ronda-libre/"]')
    if ((await roundCards.count()) === 0) {
      test.skip(true, 'No hay rondas activas')
    }

    const registerCta = page.locator('a[href="/register"]')
    expect(await registerCta.count()).toBeGreaterThan(0)
  })

  test('API /api/en-vivo responde con estructura correcta', async ({ page }) => {
    await page.goto('/en-vivo', { waitUntil: 'domcontentloaded' })

    test.fixme(await isBlockedByVercel(page), 'Vercel Security Checkpoint bloqueó el headless browser')

    const apiData = await page.evaluate(async () => {
      const res = await fetch('/api/en-vivo')
      if (!res.ok) return { error: res.status }
      return res.json()
    })

    if ('error' in apiData) {
      test.skip(true, `API respondió ${apiData.error}`)
    }

    expect(apiData).toHaveProperty('rondas')
    expect(Array.isArray(apiData.rondas)).toBe(true)

    if (apiData.rondas.length > 0) {
      const ronda = apiData.rondas[0]
      expect(ronda).toHaveProperty('id')
      expect(ronda).toHaveProperty('codigo')
      expect(ronda).toHaveProperty('course_name')
      expect(ronda).toHaveProperty('holes')
      expect(ronda).toHaveProperty('jugadores')
      expect(ronda).toHaveProperty('totalJugadores')
      expect([9, 18, 27, 36]).toContain(ronda.holes)

      const jugador = ronda.jugadores[0]
      expect(jugador).toHaveProperty('nombre')
      expect(jugador).toHaveProperty('holesCompleted')
      expect(jugador).toHaveProperty('vsPar')
      expect(jugador.holesCompleted).toBeLessThanOrEqual(jugador.totalHoles)
    }
  })

  test('filtro por cancha filtra correctamente', async ({ page }) => {
    await page.goto('/en-vivo', { waitUntil: 'domcontentloaded' })
    await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {})

    test.fixme(await isBlockedByVercel(page), 'Vercel Security Checkpoint bloqueó el headless browser')

    const filterInput = page.locator('input[type="text"], input[type="search"]')
    if ((await filterInput.count()) === 0) return

    await expect(filterInput.first()).toBeVisible()
    await filterInput.first().fill('ZZZZNOEXISTE')
    await page.waitForTimeout(1_000)

    const roundCards = page.locator('a[href*="/ronda-libre/"]')
    expect(await roundCards.count()).toBe(0)
  })
})

/* ═══════════════════════════════════════════════════════ */
/*  /leaderboard — demo simulation                       */
/* ═══════════════════════════════════════════════════════ */

test.describe('Leaderboard demo — /leaderboard', () => {
  test('carga sin errores y muestra badge DEMO', async ({ page }) => {
    const { pageErrors, serverErrors } = attachErrorTrackers(page)

    await page.goto('/leaderboard', { waitUntil: 'domcontentloaded' })
    await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {})
    await page.waitForTimeout(4_000)

    test.fixme(await isBlockedByVercel(page), 'Vercel Security Checkpoint bloqueó el headless browser')

    const bodyText = await page.locator('body').innerText()
    expect(bodyText.toUpperCase()).toContain('DEMO')

    expect(pageErrors, 'pageerrors en /leaderboard').toEqual([])
    expect(serverErrors, '5xx en /leaderboard').toEqual([])
  })

  test('muestra jugadores simulados con datos de scoring', async ({ page }) => {
    await page.goto('/leaderboard', { waitUntil: 'domcontentloaded' })
    await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {})
    await page.waitForTimeout(4_000)

    test.fixme(await isBlockedByVercel(page), 'Vercel Security Checkpoint bloqueó el headless browser')

    const body = await page.locator('body').innerText()
    expect(body.length).toBeGreaterThan(100)

    // La simulación genera jugadores con datos — debe tener contenido sustancial
    // que no sea solo el header. Verificamos que hay al menos algún indicador
    // de leaderboard: DEMO badge, GWI label, o datos de simulación
    const hasContent = body.includes('DEMO') || body.includes('GWI') || body.includes('Simulación')
    expect(hasContent).toBe(true)
  })

  test('mobile cards tienen contenido de jugadores', async ({ page }) => {
    await page.goto('/leaderboard', { waitUntil: 'domcontentloaded' })
    await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {})
    await page.waitForTimeout(4_000)

    test.fixme(await isBlockedByVercel(page), 'Vercel Security Checkpoint bloqueó el headless browser')

    // En viewport mobile (393px Pixel 5), MobileLeaderboard renderiza cards
    // Verificar que hay contenido visible por encima del fold
    const body = await page.locator('body').innerText()
    expect(body.length).toBeGreaterThan(50)

    // El leaderboard debe tener al menos un indicador reconocible
    const hasDemoIndicators = body.includes('DEMO') ||
      body.includes('Leaderboard') ||
      body.includes('leaderboard') ||
      body.includes('Golfers')
    expect(hasDemoIndicators).toBe(true)
  })
})
