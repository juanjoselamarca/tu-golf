import { chromium, type FullConfig } from '@playwright/test'
import { loginViaUI, saveAuthState, hasValidAuthState } from './helpers/auth'
import { exigirBaseDePruebas } from './helpers/base-de-pruebas'

/**
 * Global setup: corre UNA vez antes de todos los tests de Playwright.
 *
 * 1. Aborta si la app o la base son las de prod (ver exigirBaseDePruebas).
 * 2. Si hay un storageState reciente de la misma app, base y usuario, lo reusa; si no, hace login vía UI una sola
 *    vez y lo guarda.
 *
 * `config.projects` trae TODOS los proyectos aunque se filtre con --project (verificado en Playwright 1.63), así que
 * el login corre siempre: e2e-local.mjs siempre pasa las credenciales del usuario de pruebas.
 */
export default async function globalSetup(config: FullConfig) {
  exigirBaseDePruebas(config.projects.map(p => p.use.baseURL), process.env.NEXT_PUBLIC_SUPABASE_URL)

  const baseURL = config.projects[0].use.baseURL
  const authKey = [baseURL, process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.E2E_TEST_USER_EMAIL].join(' ')
  if (hasValidAuthState(authKey)) {
    console.log('[e2e-setup] Reusando storageState (misma app, base y usuario; menos de 1h de antigüedad)')
    return
  }

  console.log(`[e2e-setup] Login vía UI contra ${baseURL}...`)
  const browser = await chromium.launch()
  const context = await browser.newContext({ baseURL })
  const page = await context.newPage()

  try {
    await loginViaUI(page)
    await saveAuthState(context, authKey)
    console.log('[e2e-setup] ✅ Login OK, storageState guardado')
  } finally {
    await browser.close()
  }
}
