import { test, expect, type Page } from '@playwright/test'
import { entrarAlEditorDesdeCero as entrarAlEditor, proBloqueadoEsperado } from './helpers/organizador-editor'

/**
 * E2E — Organizar Campeonato: cambiar formato cambia las secciones visibles.
 *
 * Reglas que cubre (de ComoJueganSection.tsx + TournamentDraftEditor.tsx):
 *   - format='scramble'   → EquiposSection visible (team-based)
 *   - format='match_play' → MatchPlaySection visible; Gross habilitado para todos
 *   - format='stableford' → StablefordSection visible; Gross habilitado
 *
 * El "modo gross/neto" se renderiza como chips. Gross nunca se bloquea. El
 * Neto de Match Play / Best Ball / Stableford es del plan Pro: con el paywall
 * encendido y un usuario e2e free, el chip Neto queda `aria-disabled` con el
 * nombre accesible "Neto, requiere plan Pro" (regla: modoPermitidoPorPlan).
 *
 * Requiere E2E_TEST_USER_EMAIL/PASSWORD (mismo patrón que el resto).
 *
 * El test del chip Neto declara el estado esperado por env (no acepta "lo que
 * salga"): E2E_PAYWALL_ENABLED ('true' | 'false', el NEXT_PUBLIC_PAYWALL_ENABLED
 * del deploy probado) y E2E_TEST_USER_TIER ('free' | 'pro', el
 * profiles.subscription_tier del usuario e2e; scripts/setup-e2e-user.mjs lo crea
 * free). Sin ambas, ese test se salta con el motivo (proBloqueadoEsperado).
 */

test.beforeEach(async () => {
  if (!process.env.E2E_TEST_USER_EMAIL || !process.env.E2E_TEST_USER_PASSWORD) {
    test.skip(
      true,
      'E2E_TEST_USER_EMAIL/PASSWORD no configuradas — correr con scripts/test-db/e2e-local.mjs',
    )
  }
})

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

  test('Match Play muestra sección Match Play y Gross queda habilitado para todos', async ({ page }) => {
    await entrarAlEditor(page)

    await elegirFormato(page, /^Match Play$/)

    // MatchPlaySection (h2 = "Match Play")
    await expect(page.getByRole('heading', { name: /^Match Play$/i })).toBeVisible({
      timeout: 5_000,
    })

    // Match Play Gross es libre: el chip "Gross" se puede elegir con cualquier plan.
    const grossChip = page.getByRole('button', { name: /^Gross$/i }).first()
    await expect(grossChip).toBeEnabled()
    await grossChip.click()
    await expect(grossChip).toHaveAttribute('aria-pressed', 'true')
  })

  test('Match Play Neto respeta el plan declarado del usuario e2e', async ({ page }) => {
    const esperado = proBloqueadoEsperado()
    test.skip('skip' in esperado, 'skip' in esperado ? esperado.skip : '')
    if ('skip' in esperado) return

    await entrarAlEditor(page)
    await elegirFormato(page, /^Match Play$/)
    await expect(page.getByRole('heading', { name: /^Match Play$/i })).toBeVisible({ timeout: 5_000 })

    const grossChip = page.getByRole('button', { name: /^Gross$/i }).first()
    const netoChip = page.getByRole('button', { name: /^Neto/i }).first()
    await expect(netoChip).toBeVisible()
    if (esperado.bloqueado) {
      // free con paywall: "Neto, requiere plan Pro" + aria-disabled; sigue en Gross.
      await expect(netoChip).toHaveAccessibleName(/requiere plan Pro/i)
      await expect(netoChip).toHaveAttribute('aria-disabled', 'true')
      await netoChip.click({ force: true })
      await expect(grossChip).toHaveAttribute('aria-pressed', 'true')
    } else {
      // Pro o paywall apagado: Neto elegible.
      await expect(netoChip).not.toHaveAccessibleName(/requiere plan Pro/i)
      await expect(netoChip).not.toHaveAttribute('aria-disabled', 'true')
      await netoChip.click()
      await expect(netoChip).toHaveAttribute('aria-pressed', 'true')
    }
  })

  test('Stableford acepta Gross y Neto (Scratch Stableford es válido USGA/R&A)', async ({ page }) => {
    await entrarAlEditor(page)

    await elegirFormato(page, /^Stableford$/)

    // StablefordSection (h2 = "Tabla de puntos Stableford")
    await expect(page.getByRole('heading', { name: /Tabla de puntos Stableford/i })).toBeVisible({
      timeout: 5_000,
    })

    // "Scratch Stableford" (gross, hcp=0) es válido USGA/R&A: el chip "Gross"
    // queda habilitado. Ningún formato fuerza neto (modoPermitidoPorPlan).
    const grossChip = page.getByRole('button', { name: /^Gross$/i }).first()
    await expect(grossChip).toBeEnabled()
  })
})
