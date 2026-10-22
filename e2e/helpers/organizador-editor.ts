import { expect, type Page } from '@playwright/test'
import { canAccessSimple } from '../../src/golf/billing/entitlements'
import { TIER_RANK, type Feature, type Tier } from '../../src/golf/billing/plans'

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

/**
 * /organizador/nuevo → "+ Empezar desde cero" → editor de un borrador nuevo (POST /api/torneos/draft).
 * El POST tiene rate limit de 10 borradores por hora por usuario (en memoria por proceso) y una corrida de la suite
 * crea ~8: si se pasa, el 429 se reporta con su causa en vez de un timeout esperando el editor.
 */
export async function entrarAlEditorDesdeCero(page: Page): Promise<void> {
  await page.goto('/organizador/nuevo', { waitUntil: 'domcontentloaded' })
  await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {})
  expect(page.url(), 'No debería redirigir a /login con sesión válida').not.toContain('/login')
  const creado = page.waitForResponse(
    (r) => new URL(r.url()).pathname === '/api/torneos/draft' && r.request().method() === 'POST',
    { timeout: 15_000 },
  )
  await page.getByRole('button', { name: /Empezar desde cero/i }).click()
  expect(
    (await creado).status(),
    'POST /api/torneos/draft falló (429 = rate limit draft-create de 10/h por usuario: hay specs creando de más)',
  ).toBeLessThan(300)
  await esperarEditorDeBorrador(page)
}

/**
 * ¿El usuario e2e debe ver bloqueada `feature` (Neto de Match Play, asistente IA)? Se declara por env, no se infiere
 * de lo que muestre la pantalla: E2E_PAYWALL_ENABLED ('true' | 'false', el NEXT_PUBLIC_PAYWALL_ENABLED de la app
 * probada) y E2E_TEST_USER_TIER (el plan del usuario e2e). `e2e-local.mjs` declara ambas. La regla es la del runtime
 * (`canAccessSimple` → FEATURE_MIN_TIER), no una copia. Sin env no se sabe qué esperar y el test se salta con el motivo.
 */
export function proBloqueadoEsperado(feature: Feature): { bloqueado: boolean } | { skip: string } {
  const paywall = process.env.E2E_PAYWALL_ENABLED
  const tier = process.env.E2E_TEST_USER_TIER
  if (paywall !== 'true' && paywall !== 'false') {
    return { skip: "E2E_PAYWALL_ENABLED no declarado ('true' | 'false'): no se sabe si lo Pro debe estar bloqueado" }
  }
  if (!tier || !(tier in TIER_RANK)) {
    return { skip: `E2E_TEST_USER_TIER no declarado (${Object.keys(TIER_RANK).join(' | ')}): no se sabe el plan del usuario e2e` }
  }
  return { bloqueado: !canAccessSimple(tier as Tier, feature, paywall === 'true') }
}
