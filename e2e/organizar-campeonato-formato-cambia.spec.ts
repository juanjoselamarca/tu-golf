import { test, expect, type Page } from '@playwright/test'

/**
 * E2E — Organizar Campeonato: cambiar formato cambia las secciones visibles.
 *
 * Reglas que cubre (de ComoJueganSection.tsx + TournamentDraftEditor.tsx):
 *   - format='scramble'   → EquiposSection visible (team-based)
 *   - format='match_play' → MatchPlaySection visible + modo forzado a "neto"
 *   - format='stableford' → StablefordSection visible + modo forzado a "neto"
 *
 * El "modo gross/neto" se renderiza como chips; cuando neto está forzado,
 * el chip "Gross" queda disabled.
 *
 * Requiere E2E_TEST_USER_EMAIL/PASSWORD (mismo patrón que el resto).
 */

test.beforeEach(async () => {
  if (!process.env.E2E_TEST_USER_EMAIL || !process.env.E2E_TEST_USER_PASSWORD) {
    test.skip(
      true,
      'E2E_TEST_USER_EMAIL/PASSWORD no configuradas — correr scripts/setup-e2e-user.mjs',
    )
  }
})

/** Helper: crea un draft fresco entrando al editor desde el modal. */
async function entrarAlEditor(page: Page): Promise<void> {
  await page.goto('/organizador/nuevo', { waitUntil: 'domcontentloaded' })
  await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {})
  expect(page.url(), 'No debería redirigir a /login con sesión válida').not.toContain('/login')
  await page.getByRole('button', { name: /Empezar desde cero/i }).click()
  await expect(page.getByText(/Configuración/i).first()).toBeVisible({ timeout: 15_000 })
}

/** Click sobre un chip de formato (un <button> dentro del row de chips). */
async function elegirFormato(page: Page, label: RegExp): Promise<void> {
  // El chip está dentro de la sección "Cómo juegan" — usamos getByRole('button') con name.
  // El primer match es el chip (los headings no son botones).
  const chip = page.getByRole('button', { name: label }).first()
  await expect(chip).toBeVisible()
  await chip.click()
}

test.describe('Organizar Campeonato — formato dispara secciones', () => {
  test('Scramble muestra sección Equipos', async ({ page }) => {
    await entrarAlEditor(page)

    // Cambiar formato → Scramble
    await elegirFormato(page, /^Scramble$/)

    // EquiposSection (h2 = "Equipos") debe aparecer
    await expect(page.getByRole('heading', { name: /^Equipos$/i })).toBeVisible({
      timeout: 5_000,
    })
  })

  test('Match Play muestra sección Match Play y modo se fuerza a Neto', async ({ page }) => {
    await entrarAlEditor(page)

    await elegirFormato(page, /^Match Play$/)

    // MatchPlaySection (h2 = "Match Play")
    await expect(page.getByRole('heading', { name: /^Match Play$/i })).toBeVisible({
      timeout: 5_000,
    })

    // El chip "Gross" debe quedar disabled (neto forzado)
    const grossChip = page.getByRole('button', { name: /^Gross$/i }).first()
    await expect(grossChip).toBeDisabled()
  })

  test('Stableford acepta Gross y Neto (Scratch Stableford es válido USGA/R&A)', async ({ page }) => {
    await entrarAlEditor(page)

    await elegirFormato(page, /^Stableford$/)

    // StablefordSection (h2 = "Tabla de puntos Stableford")
    await expect(page.getByRole('heading', { name: /Tabla de puntos Stableford/i })).toBeVisible({
      timeout: 5_000,
    })

    // Stableford NO fuerza neto (a diferencia de Match Play): "Scratch Stableford"
    // (gross, hcp=0) es válido USGA/R&A, así que el chip "Gross" queda habilitado.
    // Ver NETO_FORCED = ['match_play'] en ComoJueganSection.tsx (PR #63).
    const grossChip = page.getByRole('button', { name: /^Gross$/i }).first()
    await expect(grossChip).toBeEnabled()
  })
})
