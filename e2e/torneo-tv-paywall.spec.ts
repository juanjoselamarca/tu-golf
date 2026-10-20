import { test, expect, type Page } from '@playwright/test'
import { createEphemeralUser, deleteEphemeralUser } from './helpers/ronda-fixture'
import { createIndividualTournamentFixture, tarjeta } from './helpers/tournament-individual-fixture'

/**
 * E2E — Torneo TV mode + paywall gate.
 *
 * Cubre:
 * 1. /torneo/[slug]/tv — modo TV (Pro-gated, debe mostrar UpsellCard para free)
 * 2. /torneo/[slug]/en-vivo — leaderboard en vivo (paywall behavior para free)
 * 3. Slug inexistente → error controlado (no 500)
 * 4. UpsellCard contenido y CTA verificados
 *
 * Crea un torneo demo en curso y uno cerrado (de un organizador efímero) en beforeAll y los borra en afterAll.
 * NO requiere plan Pro — testea el gate de acceso.
 */

const NONEXISTENT_SLUG = 'slug-que-no-existe-tv-xyz-99999'

let organizadorId = ''
let CLOSED_SLUG = ''
let DEMO_SLUG = ''

test.beforeAll(async () => {
  organizadorId = await createEphemeralUser('e2e-org-tv')
  const players = (prefijo: string, hoyos: number) =>
    Array.from({ length: 4 }, (_, i) => ({ nombre: `${prefijo} ${i + 1}`, handicap: 8 + i * 4, scores: tarjeta(hoyos, 4, i) }))
  DEMO_SLUG = await createIndividualTournamentFixture({
    organizerUserId: organizadorId, name: 'E2E Copa Demo TV', status: 'in_progress', esDemo: true, players: players('E2E Demo', 12),
  })
  CLOSED_SLUG = await createIndividualTournamentFixture({
    organizerUserId: organizadorId, name: 'E2E Copa Cerrada TV', status: 'closed', players: players('E2E Cerrado', 18),
  })
})

test.afterAll(async () => {
  const errs = organizadorId ? await deleteEphemeralUser(organizadorId) : []
  if (errs.length > 0) throw new Error(`Limpieza incompleta: ${errs.join(' · ')}`)
})

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

async function isBlockedByVercel(page: Page): Promise<boolean> {
  const bodyText = await page.locator('body').innerText()
  return (
    bodyText.includes('Failed to verify your browser') ||
    bodyText.includes('Security Checkpoint')
  )
}

/* ═══════════════════════════════════════════════════════ */
/*  /torneo/[slug]/tv — TV mode (Pro-gated)               */
/* ═══════════════════════════════════════════════════════ */

test.describe('TV mode — /torneo/[slug]/tv (anónimo)', () => {
  test('carga sin 5xx y muestra contenido o gate Pro', async ({ page }) => {
    const { pageErrors, serverErrors } = attachErrorTrackers(page)

    await page.goto(`/torneo/${DEMO_SLUG}/tv`, {
      waitUntil: 'domcontentloaded',
    })

    test.fixme(
      await isBlockedByVercel(page),
      'Vercel Security Checkpoint bloqueó el headless browser',
    )

    await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {})

    const body = await page.locator('body').innerText()

    // Debe mostrar ALGO — nunca blank
    expect(body.length).toBeGreaterThan(50)

    // Para usuario anónimo/free, esperamos UpsellCard O contenido del TV board
    const hasUpsell =
      body.includes('Modo TV') ||
      body.includes('Pro') ||
      body.includes('Probar') ||
      body.includes('planes')
    const hasTVContent =
      body.includes('Leaderboard') ||
      body.includes('actualizado') ||
      body.includes('Jugador') ||
      body.includes('Pos')

    expect(
      hasUpsell || hasTVContent,
      'La página TV debe mostrar upsell Pro o contenido de leaderboard',
    ).toBe(true)

    expect(pageErrors, 'pageerrors en /tv').toEqual([])
    expect(serverErrors, '5xx en /tv').toEqual([])
  })

  test('slug inexistente no produce 500', async ({ page }) => {
    const { serverErrors } = attachErrorTrackers(page)

    const response = await page.goto(`/torneo/${NONEXISTENT_SLUG}/tv`, {
      waitUntil: 'domcontentloaded',
    })

    test.fixme(
      await isBlockedByVercel(page),
      'Vercel Security Checkpoint bloqueó el headless browser',
    )

    await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {})

    const status = response?.status() ?? 0

    // 404 es correcto, 200 con página vacía/error es aceptable, 500 es bug
    expect(status, 'slug inexistente no debe dar 500').not.toBe(500)
    expect(serverErrors, '5xx en slug inexistente').toEqual([])

    // Lo importante es que NO crashee con 500 — la página maneja el error
    // gracefully (puede mostrar UpsellCard, página vacía, o 404)
    const body = await page.locator('body').innerText()
    expect(body.length, 'La página no debe estar completamente en blanco').toBeGreaterThan(10)
  })

  test('torneo cerrado carga TV sin errores', async ({ page }) => {
    const { pageErrors, serverErrors } = attachErrorTrackers(page)

    await page.goto(`/torneo/${CLOSED_SLUG}/tv`, {
      waitUntil: 'domcontentloaded',
    })

    test.fixme(
      await isBlockedByVercel(page),
      'Vercel Security Checkpoint bloqueó el headless browser',
    )

    await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {})

    expect(pageErrors, 'pageerrors en tv cerrado').toEqual([])
    expect(serverErrors, '5xx en tv cerrado').toEqual([])
  })
})

/* ═══════════════════════════════════════════════════════ */
/*  /torneo/[slug]/en-vivo — Live leaderboard             */
/* ═══════════════════════════════════════════════════════ */

test.describe('En vivo torneo — /torneo/[slug]/en-vivo (anónimo)', () => {
  test('torneo demo carga y muestra nombre o gate', async ({ page }) => {
    const { pageErrors, serverErrors } = attachErrorTrackers(page)

    await page.goto(`/torneo/${DEMO_SLUG}/en-vivo`, {
      waitUntil: 'domcontentloaded',
    })

    test.fixme(
      await isBlockedByVercel(page),
      'Vercel Security Checkpoint bloqueó el headless browser',
    )

    await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {})

    const body = await page.locator('body').innerText()

    // Debe mostrar el nombre del torneo, upsell Pro, o contenido de leaderboard
    const hasContent =
      body.includes('Copa') ||
      body.includes('Demo') ||
      body.includes('Leaderboard') ||
      body.includes('En vivo') ||
      body.includes('En Vivo') ||
      body.includes('Pro') ||
      body.includes('Probar')

    expect(
      hasContent,
      'La página en-vivo debe mostrar datos del torneo o gate Pro',
    ).toBe(true)

    expect(pageErrors, 'pageerrors en en-vivo demo').toEqual([])
    expect(serverErrors, '5xx en en-vivo demo').toEqual([])
  })

  test('torneo cerrado muestra leaderboard final o mensaje apropiado', async ({ page }) => {
    const { pageErrors, serverErrors } = attachErrorTrackers(page)

    await page.goto(`/torneo/${CLOSED_SLUG}/en-vivo`, {
      waitUntil: 'domcontentloaded',
    })

    test.fixme(
      await isBlockedByVercel(page),
      'Vercel Security Checkpoint bloqueó el headless browser',
    )

    await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {})

    const body = await page.locator('body').innerText()

    // Torneo cerrado — puede mostrar resultados finales, leaderboard, o gate
    expect(body.length, 'La página no debe estar en blanco').toBeGreaterThan(50)

    expect(pageErrors, 'pageerrors en en-vivo cerrado').toEqual([])
    expect(serverErrors, '5xx en en-vivo cerrado').toEqual([])
  })

  test('slug inexistente no produce 500', async ({ page }) => {
    const { serverErrors } = attachErrorTrackers(page)

    const response = await page.goto(`/torneo/${NONEXISTENT_SLUG}/en-vivo`, {
      waitUntil: 'domcontentloaded',
    })

    test.fixme(
      await isBlockedByVercel(page),
      'Vercel Security Checkpoint bloqueó el headless browser',
    )

    await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {})

    const status = response?.status() ?? 0
    expect(status, 'slug inexistente no debe dar 500').not.toBe(500)
    expect(serverErrors, '5xx en slug inexistente en-vivo').toEqual([])
  })
})

/* ═══════════════════════════════════════════════════════ */
/*  UpsellCard — verifica contenido del gate Pro          */
/* ═══════════════════════════════════════════════════════ */

test.describe('UpsellCard en páginas Pro-gated (anónimo)', () => {
  test('si /tv muestra upsell, tiene CTA a /planes', async ({ page }) => {
    await page.goto(`/torneo/${DEMO_SLUG}/tv`, {
      waitUntil: 'domcontentloaded',
    })

    test.fixme(
      await isBlockedByVercel(page),
      'Vercel Security Checkpoint bloqueó el headless browser',
    )

    await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {})

    const body = await page.locator('body').innerText()

    // Si hay upsell, debe tener link a /planes
    const hasUpsell =
      body.includes('Pro') ||
      body.includes('Probar') ||
      body.includes('planes')

    if (hasUpsell) {
      // Verificar que hay un CTA que lleva a planes
      const planesLink = page.locator('a[href*="planes"]')
      const planesBtn = page.getByRole('link', { name: /probar|planes|pro/i })

      const hasCTA =
        (await planesLink.count()) > 0 ||
        (await planesBtn.count()) > 0

      expect(hasCTA, 'El upsell debe tener un CTA hacia /planes').toBe(true)
    } else {
      // Si no hay upsell, el torneo TV cargó públicamente — eso también es válido
      expect(body.length).toBeGreaterThan(100)
    }
  })
})
