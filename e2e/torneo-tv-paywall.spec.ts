import { test, expect, type Page } from '@playwright/test'
import { createEphemeralUser, deleteEphemeralUser } from './helpers/ronda-fixture'
import { createIndividualTournamentFixture, tarjeta } from './helpers/tournament-individual-fixture'

/**
 * E2E — Torneo TV mode + paywall gate.
 *
 * Cubre:
 * 1. /torneo/[slug]/tv — modo TV (Pro-gated, debe mostrar UpsellCard para free)
 * 2. /torneo/[slug]/en-vivo — sin sesión manda al login (no es PRO desde el 24-nov-2026: basta una cuenta gratis)
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
  // Sin sesión, el en vivo (en curso o cerrado) manda al login y vuelve acá al entrar.
  // Nunca un upsell PRO: el en vivo lo ve cualquier cuenta, gratis incluida.
  for (const caso of [
    { nombre: 'torneo en curso', slug: () => DEMO_SLUG },
    { nombre: 'torneo cerrado', slug: () => CLOSED_SLUG },
  ]) {
    test(`${caso.nombre}: sin sesión manda al login con la vuelta al en vivo`, async ({ page }) => {
      const { pageErrors, serverErrors } = attachErrorTrackers(page)
      const destino = `/torneo/${caso.slug()}/en-vivo`

      await page.goto(destino, { waitUntil: 'domcontentloaded' })

      test.fixme(
        await isBlockedByVercel(page),
        'Vercel Security Checkpoint bloqueó el headless browser',
      )

      await page.waitForURL(/\/login/, { timeout: 15_000 })
      const url = new URL(page.url())
      expect(url.pathname, 'sin sesión el en vivo pide entrar').toBe('/login')
      expect(url.searchParams.get('next'), 'al entrar vuelve al en vivo').toBe(destino)

      expect(pageErrors, `pageerrors en en-vivo (${caso.nombre})`).toEqual([])
      expect(serverErrors, `5xx en en-vivo (${caso.nombre})`).toEqual([])
    })
  }

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
    // 404 antes que login: pedir entrar insinuaría que el torneo existe.
    expect(new URL(page.url()).pathname, 'slug inexistente no pide login').not.toBe('/login')
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
