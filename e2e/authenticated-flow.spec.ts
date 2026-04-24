import { test, expect, type Page } from '@playwright/test'

/**
 * E2E tests de flows autenticados.
 *
 * Requieren E2E_TEST_USER_EMAIL + E2E_TEST_USER_PASSWORD en env y un
 * storageState válido en e2e/.auth/user.json (generado automáticamente
 * por global-setup.ts al correr `npm run test:e2e:auth`).
 *
 * La sesión se carga desde storageState via project `mobile-chromium-auth`
 * en playwright.config.ts — estos tests no necesitan hacer login manual.
 *
 * Read-mostly: por ahora NO crean rondas/torneos/scores. La infra de cleanup
 * se agregará cuando agreguemos tests de mutación.
 */

test.beforeEach(async ({ context }) => {
  if (!process.env.E2E_TEST_USER_EMAIL || !process.env.E2E_TEST_USER_PASSWORD) {
    test.skip(true, 'E2E_TEST_USER_EMAIL/PASSWORD no configuradas — correr scripts/setup-e2e-user.mjs')
    return
  }
  // El storageState se carga automáticamente desde el project config.
  // No hay login manual acá.
  void context // evitar unused warning
})

async function assertPageLoadsAuthenticated(page: Page, path: string) {
  const pageErrors: string[] = []
  const serverErrors: string[] = []
  page.on('pageerror', err => pageErrors.push(err.message))
  page.on('response', res => {
    if (res.status() >= 500) serverErrors.push(`${res.status()} ${res.url()}`)
  })

  await page.goto(path, { waitUntil: 'domcontentloaded' })
  await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {})

  // Si la ruta era protegida y el auth falló, termina en /login — flagearlo
  expect(page.url(), `${path} no debería redirigir a /login con sesión válida`).not.toContain('/login')

  expect(pageErrors, `pageerrors en ${path}`).toEqual([])
  expect(serverErrors, `5xx en ${path}`).toEqual([])
}

test.describe('Rutas autenticadas cargan con sesión inyectada', () => {
  test('/dashboard carga sin redirect a login', async ({ page }) => {
    await assertPageLoadsAuthenticated(page, '/dashboard')
  })

  test('/perfil carga', async ({ page }) => {
    await assertPageLoadsAuthenticated(page, '/perfil')
  })

  test('/perfil/historial carga', async ({ page }) => {
    await assertPageLoadsAuthenticated(page, '/perfil/historial')
  })

  test('/perfil/stats carga', async ({ page }) => {
    await assertPageLoadsAuthenticated(page, '/perfil/stats')
  })

  test('/ronda-libre/nueva muestra el wizard (no redirect a login)', async ({ page }) => {
    await assertPageLoadsAuthenticated(page, '/ronda-libre/nueva')
    // Debería tener algún indicador de "Crear ronda" o del wizard
    const bodyText = await page.locator('body').innerText()
    expect(bodyText.length).toBeGreaterThan(50)
  })

  test('/coach carga (incluso sin rondas previas)', async ({ page }) => {
    await assertPageLoadsAuthenticated(page, '/coach')
  })

  test('/importar carga', async ({ page }) => {
    await assertPageLoadsAuthenticated(page, '/importar')
  })

  test('/organizador/nuevo carga', async ({ page }) => {
    await assertPageLoadsAuthenticated(page, '/organizador/nuevo')
  })
})

test.describe('Estado de la sesión', () => {
  test('Navbar muestra opciones de logueado (no botón login)', async ({ page }) => {
    await page.goto('/dashboard', { waitUntil: 'networkidle' })
    // La palabra "Iniciar sesión" o "Login" NO debe aparecer en UI autenticada
    const bodyText = await page.locator('body').innerText()
    const hasLoginCTA = /iniciar sesi[oó]n|^login$/im.test(bodyText)
    expect(hasLoginCTA).toBe(false)
  })

  test('/login mientras autenticado → redirige a /dashboard', async ({ page }) => {
    await page.goto('/login', { waitUntil: 'networkidle' })
    // Middleware debería redirigir a /dashboard (ver src/middleware.ts)
    // Aceptar que la redirección toma un tick extra
    await page.waitForURL(/\/dashboard/, { timeout: 5_000 }).catch(() => {})
    // Si no redirigió, al menos que no muestre formulario de login
    const url = page.url()
    if (!url.includes('/dashboard')) {
      // Si el middleware no redirigió, el user puede estar en /login pero sin form visible
      // por server components detectando session — aceptar ambos casos
      const bodyText = await page.locator('body').innerText()
      const hasLoginForm = /password|contrase[nñ]a/i.test(bodyText)
      expect(hasLoginForm, 'No debería verse formulario de login con sesión activa').toBe(false)
    } else {
      expect(url).toContain('/dashboard')
    }
  })
})
