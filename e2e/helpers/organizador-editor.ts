import { expect, type Page } from '@playwright/test'

/**
 * Señal de que el editor del borrador (TournamentDraftEditor) terminó de cargar: la primera sección del formulario,
 * "Qué torneo", es un <h2> que sólo existe dentro del editor (no en el modal "¿Por dónde empezamos?" ni en
 * "Cargando borrador..."). Fuente única para los specs de organizar campeonato: antes cada uno esperaba el texto
 * "Configuración", que el editor dejó de mostrar, y los 4 se pusieron rojos juntos (#537).
 */
export async function esperarEditorDeBorrador(page: Page): Promise<void> {
  await expect(page.getByRole('heading', { name: /^Qué torneo$/i })).toBeVisible({ timeout: 15_000 })
  await expect(page.getByText(/¿Por dónde empezamos\?/i)).toBeHidden()
}

/** /organizador/nuevo → "+ Empezar desde cero" → editor de un borrador nuevo (POST /api/torneos/draft). */
export async function entrarAlEditorDesdeCero(page: Page): Promise<void> {
  await page.goto('/organizador/nuevo', { waitUntil: 'domcontentloaded' })
  await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {})
  expect(page.url(), 'No debería redirigir a /login con sesión válida').not.toContain('/login')
  await page.getByRole('button', { name: /Empezar desde cero/i }).click()
  await esperarEditorDeBorrador(page)
}

/**
 * ¿El usuario e2e debe ver bloqueadas las funciones Pro del editor (Neto de Match Play, asistente IA)? Se declara por
 * env, no se infiere de lo que muestre la pantalla: E2E_PAYWALL_ENABLED ('true' | 'false', el
 * NEXT_PUBLIC_PAYWALL_ENABLED de la app probada) y E2E_TEST_USER_TIER ('free' | 'pro', el plan del usuario e2e).
 * `e2e-local.mjs` declara ambas. Sin ellas no se sabe qué esperar y el test se salta con el motivo.
 */
export function proBloqueadoEsperado(): { bloqueado: boolean } | { skip: string } {
  const paywall = process.env.E2E_PAYWALL_ENABLED
  const tier = process.env.E2E_TEST_USER_TIER
  if (paywall !== 'true' && paywall !== 'false') {
    return { skip: "E2E_PAYWALL_ENABLED no declarado ('true' | 'false'): no se sabe si lo Pro debe estar bloqueado" }
  }
  if (tier !== 'free' && tier !== 'pro') {
    return { skip: "E2E_TEST_USER_TIER no declarado ('free' | 'pro'): no se sabe el plan del usuario e2e" }
  }
  return { bloqueado: paywall === 'true' && tier === 'free' }
}
