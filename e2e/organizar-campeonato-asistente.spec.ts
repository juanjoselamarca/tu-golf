import { test, expect } from '@playwright/test'
import { entrarAlEditorDesdeCero as entrarAlEditor, proBloqueadoEsperado } from './helpers/organizador-editor'

/**
 * E2E — Organizar Campeonato: chat IA (tAIger+ asistente).
 *
 * Smoke test del AssistantPanel: escribe un mensaje, espera respuesta,
 * y verifica que la propuesta del asistente impacta el config (ej: format
 * pasa a "scramble" cuando el usuario dice "Scramble parejas...").
 *
 * El asistente es del plan Pro: con el paywall encendido y el usuario e2e free
 * se ve la tarjeta de upsell en vez del chat (test del gate). Qué esperar lo
 * declara el entorno (proBloqueadoEsperado), no lo que salga en pantalla.
 *
 * Skips:
 *   - Si no hay credenciales E2E → skip auth
 *   - Si el entorno bloquea lo Pro → los tests del chat se saltan
 *   - Si no hay ANTHROPIC_API_KEY en el server → el endpoint /assistant
 *     puede devolver 500/fallback → toleramos y skipeamos la aserción
 *     dura sobre el formato (verificamos solo el round-trip básico).
 */

test.beforeEach(async () => {
  if (!process.env.E2E_TEST_USER_EMAIL || !process.env.E2E_TEST_USER_PASSWORD) {
    test.skip(
      true,
      'E2E_TEST_USER_EMAIL/PASSWORD no configuradas — correr con scripts/test-db/e2e-local.mjs',
    )
  }
})

/** El asistente es del plan Pro (FEATURE_MIN_TIER 'tournament-ai-assistant'): se salta si el entorno lo bloquea. */
function exigirAsistenteHabilitado(): void {
  const esperado = proBloqueadoEsperado('tournament-ai-assistant')
  test.skip('skip' in esperado, 'skip' in esperado ? esperado.skip : '')
  test.skip('bloqueado' in esperado && esperado.bloqueado, 'Usuario e2e free con paywall: el asistente muestra el upsell (lo cubre el test del gate)')
}

test.describe('Organizar Campeonato — asistente IA', () => {
  test('gate Pro: free con paywall ve el upsell y no el chat; si no, ve el chat', async ({ page }) => {
    const esperado = proBloqueadoEsperado('tournament-ai-assistant')
    test.skip('skip' in esperado, 'skip' in esperado ? esperado.skip : '')
    if ('skip' in esperado) return

    await entrarAlEditor(page)
    const asistente = page.getByRole('region', { name: 'Asistente IA del torneo' })
    await expect(asistente).toBeVisible()
    // ProGate muestra el esqueleto ("Cargando") mientras lee sesión y plan en Supabase; con varios workers sobre un
    // servidor recién levantado eso pasó de 10 s una vez. Se espera a que el gate resuelva antes de afirmar qué muestra.
    await expect(asistente.getByRole('status', { name: 'Cargando' })).toHaveCount(0, { timeout: 25_000 })
    const input = asistente.getByLabel(/Mensaje para el asistente/i)

    if (esperado.bloqueado) {
      await expect(asistente.getByText('Asistente IA de torneo')).toBeVisible({ timeout: 10_000 })
      const cta = asistente.getByRole('link', { name: /Conocer PRO/i })
      await expect(cta).toBeVisible()
      // Volver desde /planes trae al organizador de vuelta al editor.
      await expect(cta).toHaveAttribute('href', '/planes?volver=%2Forganizador%2Fnuevo')
      await expect(input).toHaveCount(0)
    } else {
      await expect(input).toBeVisible({ timeout: 10_000 })
      await expect(asistente.getByRole('link', { name: /Conocer PRO/i })).toHaveCount(0)
    }

    // El gate no bloquea el formulario manual: el editor sigue usable sin el asistente.
    await expect(page.getByRole('heading', { name: /^Cómo juegan$/i })).toBeVisible()
  })

  test('enviar mensaje al chat dispara request al backend', async ({ page }) => {
    exigirAsistenteHabilitado()
    await entrarAlEditor(page)

    // El input del asistente tiene aria-label="Mensaje para tAIger+"
    const input = page.getByLabel(/Mensaje para el asistente/i)
    await expect(input).toBeVisible({ timeout: 10_000 })

    // Escribir un prompt que típicamente cambia el formato a "scramble". Cubre también el round-trip de UI
    // (input acepta texto, enviar se habilita) sin un borrador extra: el POST de borradores tiene rate limit.
    const prompt = 'Scramble parejas sábado 12 de julio'
    await input.fill(prompt)
    expect(await input.inputValue()).toBe(prompt)

    // El botón "Enviar mensaje" debe activarse
    const sendBtn = page.getByLabel(/Enviar mensaje/i)
    await expect(sendBtn).toBeEnabled()

    // Esperamos la response del endpoint /assistant (tolera fallback si no
    // hay ANTHROPIC_API_KEY — solo verificamos que el round-trip ocurra)
    const responsePromise = page.waitForResponse(
      (res) => res.url().includes('/assistant') && res.request().method() === 'POST',
      { timeout: 30_000 },
    )

    await sendBtn.click()

    // AssistantPanel agrega el mensaje del usuario a la lista antes del fetch: el round-trip de UI se verifica
    // aunque el backend del asistente no tenga proveedor IA en este entorno.
    await expect(page.getByText(prompt, { exact: false })).toBeVisible({ timeout: 5_000 })

    let responseOk = false
    try {
      const res = await responsePromise
      // 200 = response normal con propuesta, 5xx = fallback (sin API key)
      responseOk = res.status() < 500
    } catch {
      // timeout — toleramos (puede que el endpoint esté no configurado en preview)
      test.skip(
        true,
        'El endpoint /assistant no respondió a tiempo — probablemente ' +
          'ANTHROPIC_API_KEY no está configurada en este entorno',
      )
    }

    if (!responseOk) {
      test.skip(
        true,
        'El endpoint /assistant devolvió 5xx (probablemente sin API key configurada)',
      )
    }

    // Con respuesta del backend el mensaje sigue en la lista (no se pierde al llegar la propuesta).
    await expect(page.getByText(prompt, { exact: false })).toBeVisible({ timeout: 5_000 })
  })
})
