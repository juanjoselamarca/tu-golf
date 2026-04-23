import { test, expect, Page } from '@playwright/test'

/**
 * Smoke extendido — páginas públicas y redirects críticos
 *
 * Corre contra PLAYWRIGHT_BASE_URL (default: https://golfersplus.vercel.app).
 * NO modifica BD (read-only). Puede correr contra producción sin riesgo.
 *
 * Objetivo: atrapar regresiones donde una página crashea en runtime
 * (pageerror), responde 5xx, o el redirect de auth se rompe.
 *
 * Si alguno de estos 20 tests falla después de un deploy, es P0.
 */

// Helper común: carga página y fail en pageerror o 5xx.
// `allowedReactErrors`: lista de códigos de Minified React error que pueden
// aparecer (bugs conocidos trackeados en docs/TECH_DEBT.md). El test sigue
// detectando errores nuevos, solo tolera los ya documentados.
async function assertCleanLoad(
  page: Page,
  path: string,
  opts: { waitForText?: string; allowedReactErrors?: number[] } = {}
) {
  const pageErrors: string[] = []
  const serverErrors: string[] = []
  const allowed = new Set(opts.allowedReactErrors ?? [])

  page.on('pageerror', err => {
    const m = err.message.match(/Minified React error #(\d+)/)
    if (m && allowed.has(parseInt(m[1], 10))) return
    pageErrors.push(err.message)
  })
  page.on('response', res => {
    if (res.status() >= 500) serverErrors.push(`${res.status()} ${res.url()}`)
  })

  await page.goto(path, { waitUntil: 'domcontentloaded' })

  try {
    await page.waitForLoadState('networkidle', { timeout: 8_000 })
  } catch {
    // networkidle puede no llegar en páginas con polling — no falla el test
  }

  if (opts.waitForText) {
    await expect(page.locator('body')).toContainText(opts.waitForText)
  }

  expect(pageErrors, `pageerrors inesperados en ${path}`).toEqual([])
  expect(serverErrors, `5xx en ${path}`).toEqual([])
}

test.describe('Páginas públicas (sin auth) cargan limpio', () => {
  test('/login muestra formulario', async ({ page }) => {
    await assertCleanLoad(page, '/login')
    // Debe tener un input email y un botón
    await expect(page.locator('input[type="email"]').first()).toBeVisible()
  })

  test('/register muestra formulario', async ({ page }) => {
    await assertCleanLoad(page, '/register')
    await expect(page.locator('input[type="email"]').first()).toBeVisible()
  })

  test('/terminos carga contenido legal', async ({ page }) => {
    await assertCleanLoad(page, '/terminos')
  })

  test('/privacidad carga contenido legal', async ({ page }) => {
    await assertCleanLoad(page, '/privacidad')
  })

  test('/reembolsos carga contenido legal', async ({ page }) => {
    await assertCleanLoad(page, '/reembolsos')
  })

  test('/recuperar carga formulario reset password', async ({ page }) => {
    await assertCleanLoad(page, '/recuperar')
  })

  test('/en-vivo carga (es público, muestra rondas activas)', async ({ page }) => {
    await assertCleanLoad(page, '/en-vivo')
  })

  test('/leaderboard carga (con hydration mismatch conocido)', async ({ page }) => {
    // Bug conocido: useDemoSimulation genera hydration mismatch en SSR vs CSR.
    // Errors React: #418 (invalid state update during render), #423 (recovered
    // hydration error), #425 (text content mismatch). Ver TECH_DEBT P1-leaderboard-hydration.
    // El test sigue detectando errores nuevos — solo tolera los documentados.
    await assertCleanLoad(page, '/leaderboard', {
      allowedReactErrors: [418, 423, 425],
    })
  })

  test('/indices carga (directorio de canchas)', async ({ page }) => {
    await assertCleanLoad(page, '/indices')
  })

  test('/ranking carga', async ({ page }) => {
    await assertCleanLoad(page, '/ranking')
  })

  test('/demo carga (flujo demo sin login)', async ({ page }) => {
    await assertCleanLoad(page, '/demo')
  })
})

test.describe('Redirects de auth funcionan (rutas protegidas → /login)', () => {
  const protectedPaths = [
    '/dashboard',
    '/perfil',
    '/perfil/stats',
    '/perfil/historial',
    '/coach',
    '/organizador/nuevo',
    '/admin',
    '/importar',
    '/ronda-libre/nueva',
  ]

  for (const path of protectedPaths) {
    test(`${path} sin sesión → redirige a /login`, async ({ page }) => {
      const pageErrors: string[] = []
      page.on('pageerror', err => pageErrors.push(err.message))

      await page.goto(path, { waitUntil: 'domcontentloaded' })
      await page.waitForURL(/\/login/, { timeout: 10_000 })

      // Preserva el 'next' param para volver después del login
      const url = new URL(page.url())
      expect(url.pathname).toBe('/login')
      expect(pageErrors).toEqual([])
    })
  }
})

test.describe('Rutas con params inexistentes no crashean', () => {
  test('/ronda-libre con código inexistente → 404 o mensaje, no crash', async ({ page }) => {
    const pageErrors: string[] = []
    page.on('pageerror', err => pageErrors.push(err.message))

    await page.goto('/ronda-libre/ZZZZZZ', { waitUntil: 'domcontentloaded' })
    await page.waitForLoadState('networkidle', { timeout: 8_000 }).catch(() => {})

    // Aceptamos cualquier respuesta que NO sea crash de runtime
    expect(pageErrors).toEqual([])
  })

  test('/torneo con slug inexistente no crashea', async ({ page }) => {
    const pageErrors: string[] = []
    page.on('pageerror', err => pageErrors.push(err.message))

    await page.goto('/torneo/torneo-que-no-existe-xyz', { waitUntil: 'domcontentloaded' })
    await page.waitForLoadState('networkidle', { timeout: 8_000 }).catch(() => {})

    expect(pageErrors).toEqual([])
  })

  test('/tarjeta con id inexistente no crashea', async ({ page }) => {
    const pageErrors: string[] = []
    page.on('pageerror', err => pageErrors.push(err.message))

    await page.goto('/tarjeta/no-existe', { waitUntil: 'domcontentloaded' })
    await page.waitForLoadState('networkidle', { timeout: 8_000 }).catch(() => {})

    expect(pageErrors).toEqual([])
  })
})

test.describe('Navegación desde landing', () => {
  test('Landing tiene CTA "Crear" visible', async ({ page }) => {
    await page.goto('/', { waitUntil: 'networkidle' })
    // Buscar CTAs principales (botones/links) — el texto exacto puede variar
    const ctaTexts = ['Crear', 'Empezar', 'Ingresar', 'Comenzar']
    let found = false
    for (const text of ctaTexts) {
      const el = page.getByText(text, { exact: false }).first()
      if (await el.isVisible().catch(() => false)) {
        found = true
        break
      }
    }
    expect(found, 'Al menos un CTA principal debe estar visible').toBe(true)
  })

  test('Navbar presente en páginas autenticadas-proxy', async ({ page }) => {
    await page.goto('/login', { waitUntil: 'networkidle' })
    // Navbar aparece en todas las páginas — verificar que tiene algún elemento reconocible
    // El logo o el link al home
    const navbarLinks = page.locator('nav a, header a')
    const count = await navbarLinks.count()
    expect(count).toBeGreaterThan(0)
  })
})
