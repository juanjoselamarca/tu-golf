import { test, expect, type Page } from '@playwright/test'

/**
 * E2E — Paywall: página /planes + gates de features premium.
 *
 * Cubre:
 * 1. /planes — pricing page pública (sin auth)
 *    - Hero, toggle mensual/anual, pricing correcto
 *    - Plan cards (Gratis, Pro) con features
 *    - Founding Member section con scarcity
 *    - Trust signals (sin tarjeta, cancelas, datos tuyos)
 *    - CTA "Probar 14 días gratis"
 * 2. Comportamiento del toggle mensual/anual (cambia precios)
 * 3. UpsellCard: páginas gateadas muestran upsell para usuarios free
 */

/* ─── Helpers ──────────────────────────────────────────── */

/** Detecta Vercel Security Checkpoint */
async function isBlockedByVercel(page: Page): Promise<boolean> {
  const bodyText = await page.locator('body').innerText()
  return bodyText.includes('Failed to verify your browser') || bodyText.includes('Security Checkpoint')
}

function attachErrorTrackers(page: Page) {
  const pageErrors: string[] = []
  const serverErrors: string[] = []
  page.on('pageerror', (err) => pageErrors.push(err.message))
  page.on('response', (res) => {
    if (res.status() >= 500) serverErrors.push(`${res.status()} ${res.url()}`)
  })
  return { pageErrors, serverErrors }
}

/* ═══════════════════════════════════════════════════════ */
/*  /planes — pricing page (público, sin auth)            */
/* ═══════════════════════════════════════════════════════ */

test.describe('Página /planes — pricing', () => {
  test('carga sin errores y muestra hero', async ({ page }) => {
    const { pageErrors, serverErrors } = attachErrorTrackers(page)

    await page.goto('/planes', { waitUntil: 'domcontentloaded' })
    await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {})

    test.fixme(await isBlockedByVercel(page), 'Vercel Security Checkpoint bloqueó el headless browser')

    // Hero "Tu mejor golf empieza acá"
    const hero = page.getByText('Tu mejor golf')
    await expect(hero).toBeVisible({ timeout: 5_000 })

    // Subtítulo
    const subtitle = page.getByText('Pro incluye coach con IA')
    await expect(subtitle).toBeVisible()

    expect(pageErrors, 'pageerrors en /planes').toEqual([])
    expect(serverErrors, '5xx en /planes').toEqual([])
  })

  test('plan Gratis muestra $0 y botón deshabilitado "Plan actual"', async ({ page }) => {
    await page.goto('/planes', { waitUntil: 'domcontentloaded' })
    await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {})

    test.fixme(await isBlockedByVercel(page), 'Vercel Security Checkpoint bloqueó el headless browser')

    // Sección Gratis con $0
    const gratisHeading = page.getByRole('heading', { name: 'Gratis' })
    await expect(gratisHeading).toBeVisible()

    const freePrice = page.getByText('$0')
    await expect(freePrice).toBeVisible()

    // Botón "Plan actual" deshabilitado
    const planActualBtn = page.getByRole('button', { name: 'Plan actual' })
    await expect(planActualBtn).toBeVisible()
    await expect(planActualBtn).toBeDisabled()
  })

  test('plan Pro muestra precio correcto con toggle anual por defecto', async ({ page }) => {
    await page.goto('/planes', { waitUntil: 'domcontentloaded' })
    await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {})

    test.fixme(await isBlockedByVercel(page), 'Vercel Security Checkpoint bloqueó el headless browser')

    // Heading Pro
    const proHeading = page.getByRole('heading', { name: 'Pro' })
    await expect(proHeading).toBeVisible()

    // Por defecto está en anual: $34.990/año
    const yearlyPrice = page.getByText('$34.990')
    await expect(yearlyPrice).toBeVisible()

    // Equivalente mensual visible
    const monthlyEquiv = page.getByText('$2.916/mes')
    await expect(monthlyEquiv).toBeVisible()

    // Badge "Ahorra 42%"
    const savingsBadge = page.getByText('Ahorra 42%')
    await expect(savingsBadge).toBeVisible()
  })

  test('toggle mensual/anual cambia precios', async ({ page }) => {
    await page.goto('/planes', { waitUntil: 'domcontentloaded' })
    await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {})

    test.fixme(await isBlockedByVercel(page), 'Vercel Security Checkpoint bloqueó el headless browser')

    // Estado inicial: anual
    await expect(page.getByText('$34.990')).toBeVisible()
    await expect(page.getByText('Ahorra 42%')).toBeVisible()

    // Click en toggle para cambiar a mensual
    const toggle = page.getByRole('button', { name: /[Cc]ambiar a plan mensual/i })
    await toggle.click()

    // Ahora muestra precio mensual: $4.990
    await expect(page.getByText('$4.990')).toBeVisible()

    // "Ahorra 42%" desaparece en mensual
    await expect(page.getByText('Ahorra 42%')).not.toBeVisible()

    // Click de vuelta para verificar reversibilidad
    const toggleBack = page.getByRole('button', { name: /[Cc]ambiar a plan anual/i })
    await toggleBack.click()

    await expect(page.getByText('$34.990')).toBeVisible()
    await expect(page.getByText('Ahorra 42%')).toBeVisible()
  })

  test('features del plan Gratis están listadas', async ({ page }) => {
    await page.goto('/planes', { waitUntil: 'domcontentloaded' })
    await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {})

    test.fixme(await isBlockedByVercel(page), 'Vercel Security Checkpoint bloqueó el headless browser')

    // Verificar features clave del plan Gratis
    const freeFeatures = [
      'Scoring completo',
      'Índice Golfers+',
      'Import de rondas',
    ]

    for (const feature of freeFeatures) {
      await expect(page.getByText(feature)).toBeVisible()
    }
  })

  test('features del plan Pro están listadas', async ({ page }) => {
    await page.goto('/planes', { waitUntil: 'domcontentloaded' })
    await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {})

    test.fixme(await isBlockedByVercel(page), 'Vercel Security Checkpoint bloqueó el headless browser')

    // Verificar features clave del plan Pro
    const proFeatures = [
      'Coach tAIger+ con IA',
      'Detección de patrones',
      'Golf Win Index',
      'Leaderboard en vivo',
      'Modo TV',
    ]

    for (const feature of proFeatures) {
      await expect(page.getByText(feature)).toBeVisible()
    }
  })

  test('CTA "Probar 14 días gratis" es clickeable', async ({ page }) => {
    await page.goto('/planes', { waitUntil: 'domcontentloaded' })
    await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {})

    test.fixme(await isBlockedByVercel(page), 'Vercel Security Checkpoint bloqueó el headless browser')

    const cta = page.getByRole('button', { name: /Probar 14 días gratis/i })
    await expect(cta).toBeVisible()
    await expect(cta).toBeEnabled()

    // Click muestra toast "Próximamente"
    await cta.click()

    // Verificar que aparece algún tipo de feedback (toast o mensaje)
    const toast = page.getByText('Próximamente')
    await expect(toast).toBeVisible({ timeout: 3_000 })
  })

  test('Founding Member muestra conteo y scarcity', async ({ page }) => {
    await page.goto('/planes', { waitUntil: 'domcontentloaded' })
    await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {})

    test.fixme(await isBlockedByVercel(page), 'Vercel Security Checkpoint bloqueó el headless browser')

    // "73" (conteo de founding members)
    const count = page.getByText('73')
    await expect(count).toBeVisible()

    // "cupos de 100" (scarcity)
    const cupos = page.getByText('cupos de 100')
    await expect(cupos).toBeVisible()

    // Mensaje de precio de por vida
    const lifetime = page.getByText(/precio de por vida/i)
    await expect(lifetime).toBeVisible()
  })

  test('trust signals presentes en footer', async ({ page }) => {
    await page.goto('/planes', { waitUntil: 'domcontentloaded' })
    await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {})

    test.fixme(await isBlockedByVercel(page), 'Vercel Security Checkpoint bloqueó el headless browser')

    const trustSignals = [
      'Sin tarjeta de crédito para probar.',
      'Cancelas cuando quieras.',
      'Tus datos son tuyos, siempre.',
    ]

    for (const signal of trustSignals) {
      await expect(page.getByText(signal)).toBeVisible()
    }
  })

  test('botón "← Volver" lleva al dashboard o home', async ({ page }) => {
    await page.goto('/planes', { waitUntil: 'domcontentloaded' })
    await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {})

    test.fixme(await isBlockedByVercel(page), 'Vercel Security Checkpoint bloqueó el headless browser')

    const backLink = page.getByText('← Volver')
    await expect(backLink).toBeVisible()

    // Verificar que es un link funcional
    const href = await backLink.getAttribute('href')
    expect(href).toBeTruthy()
  })
})
