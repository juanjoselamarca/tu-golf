import { chromium, type FullConfig } from '@playwright/test'
import { loginViaUI, saveAuthState, hasValidAuthState } from './helpers/auth'

/**
 * Global setup: corre UNA vez antes de todos los tests de Playwright.
 *
 * Si hay credenciales de test user (E2E_TEST_USER_EMAIL/PASSWORD):
 * - Si hay un storageState válido reciente, no hace nada (reusa)
 * - Si no, hace login vía UI una sola vez y guarda el storageState
 *
 * Los tests que requieren auth cargan el storageState desde
 * `playwright.config.ts` → `projects[].use.storageState`.
 *
 * Si NO hay credenciales configuradas, los tests autenticados se skipean
 * (ver beforeEach en authenticated-flow.spec.ts).
 */
export default async function globalSetup(config: FullConfig) {
  if (!process.env.E2E_TEST_USER_EMAIL || !process.env.E2E_TEST_USER_PASSWORD) {
    console.log('[e2e-setup] E2E_TEST_USER_EMAIL/PASSWORD no configuradas — skipping login setup')
    return
  }

  if (hasValidAuthState()) {
    console.log('[e2e-setup] Reusando storageState (menos de 1h de antigüedad)')
    return
  }

  const baseURL = config.projects[0]?.use?.baseURL
    ?? process.env.PLAYWRIGHT_BASE_URL
    ?? 'https://golfersplus.vercel.app'

  console.log(`[e2e-setup] Login vía UI contra ${baseURL}...`)
  const browser = await chromium.launch()
  const context = await browser.newContext({ baseURL })
  const page = await context.newPage()

  try {
    await loginViaUI(page)
    await saveAuthState(context)
    console.log('[e2e-setup] ✅ Login OK, storageState guardado')
  } finally {
    await browser.close()
  }
}
