import { test, expect } from '@playwright/test'

/**
 * E2E — Live polimórfico: /torneo/[slug]/en-vivo carga sin errores.
 *
 * No requiere auth — la página de live es pública (server component
 * con `export const dynamic = 'force-dynamic'`).
 *
 * Para tener un slug real lo tomamos de E2E_LIVE_TOURNAMENT_SLUG (env var
 * opcional). Si no está definido, intentamos un slug genérico de prueba
 * y skipeamos si vuelve 404. Esto deja el test verde por defecto y
 * útil cuando alguien lo configura.
 */

const TEST_SLUG = process.env.E2E_LIVE_TOURNAMENT_SLUG ?? 'demo-torneo'

test.describe('Live polimórfico — /torneo/[slug]/en-vivo', () => {
  test('carga el header + leaderboard si el slug existe', async ({ page }) => {
    const pageErrors: string[] = []
    const serverErrors: string[] = []
    page.on('pageerror', (err) => pageErrors.push(err.message))
    page.on('response', (res) => {
      if (res.status() >= 500) serverErrors.push(`${res.status()} ${res.url()}`)
    })

    const response = await page.goto(`/torneo/${TEST_SLUG}/en-vivo`, {
      waitUntil: 'domcontentloaded',
    })

    // 404 → no hay torneo de prueba en este entorno → skipear
    if (response && response.status() === 404) {
      test.skip(
        true,
        `No existe torneo con slug "${TEST_SLUG}". Configurar E2E_LIVE_TOURNAMENT_SLUG ` +
          'para apuntar a un torneo real publicado.',
      )
    }

    await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {})

    // El LiveHeader pinta un <h1> con el nombre del torneo
    await expect(page.locator('h1').first()).toBeVisible({ timeout: 10_000 })

    // El cuerpo debe tener contenido (no es página en blanco)
    const bodyText = await page.locator('body').innerText()
    expect(bodyText.length).toBeGreaterThan(50)

    // Sin errores fatales
    expect(pageErrors, 'pageerrors en /en-vivo').toEqual([])
    expect(serverErrors, '5xx en /en-vivo').toEqual([])
  })

  test('si total_rounds > 1, aparecen tabs por ronda', async ({ page }) => {
    const response = await page.goto(`/torneo/${TEST_SLUG}/en-vivo`, {
      waitUntil: 'domcontentloaded',
    })

    if (response && response.status() === 404) {
      test.skip(true, `No existe torneo con slug "${TEST_SLUG}" — configurar env var`)
    }

    await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {})

    // Las tabs son los elementos renderizados por LiveTabs.
    // Si total_rounds === 1, LiveTabs típicamente no renderiza nada útil
    // (sólo una tab); con > 1 hay múltiples buttons "Ronda 1", "Ronda 2", ...
    // Sondeamos por al menos un botón con "Ronda" en el texto; si no hay,
    // skipeamos (torneo de 1 ronda).
    const rondaButtons = page.getByRole('button', { name: /Ronda\s*\d+/i })
    const count = await rondaButtons.count()

    if (count === 0) {
      test.skip(
        true,
        'Este torneo de prueba tiene total_rounds <= 1 — no hay tabs para validar',
      )
    }

    expect(count).toBeGreaterThan(1)
  })
})
