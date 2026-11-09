/**
 * Scorer — /ronda-libre/nueva (asistente para crear una ronda)
 *
 * Flujo: Cancha → Formato → Jugadores → Confirmar. Quién anota se deriva del
 * formato: los formatos de equipo (y match play / stableford) los anota uno
 * por el grupo; sólo stroke play con compañía lo pregunta.
 *
 * Regresión R4794T (Cristián Ross, 07-nov-2026): elegir Scramble forzaba "llevo
 * el score del grupo" sin avisar, abría tres rivales en blanco y bloqueaba
 * "Revisar" con "Scramble necesita al menos 4 jugadores"; volver a Stroke Play
 * no lo revertía. Hoy Scramble arma "Equipo 1" (tú + un compañero), se puede
 * jugar contra el par, y Stroke Play vuelve a preguntar quién anota.
 *
 * NO crea rondas reales (no presiona "Crear ronda ✓").
 */
import { test, expect, type Page } from '@playwright/test'

/**
 * Navega a /ronda-libre/nueva y espera contenido real.
 * Retorna false si Vercel BotID bloquea el headless browser.
 */
async function gotoNueva(page: Page): Promise<boolean> {
  await page.goto('/ronda-libre/nueva', { waitUntil: 'domcontentloaded' })
  await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {})
  const bodyText = await page.locator('body').innerText()
  if (bodyText.includes('Failed to verify your browser') || bodyText.includes('Security Checkpoint')) {
    return false
  }
  return true
}

/**
 * Paso 1 → paso 2. Si la cancha de la ronda anterior vino precargada, basta con
 * "Siguiente"; si no, se busca una y se elige el primer resultado.
 */
async function llegarAFormato(page: Page): Promise<void> {
  const siguiente = page.getByRole('button', { name: /siguiente/i })
  await expect(siguiente).toBeVisible()
  if (await siguiente.isDisabled()) {
    await page.getByLabel('Buscar cancha').fill('Leones')
    // Los resultados se agrupan por club (encabezado de 60 px). Tocarlo elige la cancha
    // si el club tiene una sola; si tiene varias, las despliega (tarjetas de 56 px).
    const club = page.locator('div[style*="min-height: 60px"]', { hasText: /leones/i }).first()
    await expect(club).toBeVisible({ timeout: 15_000 })
    await club.click()
    await expect(siguiente).toBeEnabled({ timeout: 3_000 }).catch(async () => {
      await page.locator('div[style*="min-height: 56px"]', { hasText: /leones/i }).first().click()
      await expect(siguiente).toBeEnabled()
    })
  }
  await siguiente.click()
  await expect(subtitulo(page, /cómo quieres jugar/i)).toBeVisible()
}

/**
 * El subtítulo del paso. Es un <p>: el menú Jugar del Navbar tiene un <h3> oculto con
 * el mismo texto "¿Cómo quieres jugar?" y getByText los confunde.
 */
function subtitulo(page: Page, texto: RegExp) {
  return page.locator('p', { hasText: texto })
}

/** Paso 2 → paso 3 con el formato pedido. */
async function elegirFormatoYSeguir(page: Page, formato: RegExp): Promise<void> {
  await page.getByRole('button', { name: formato }).first().click()
  await page.getByRole('button', { name: /siguiente/i }).click()
  await expect(subtitulo(page, /con quién juegas/i)).toBeVisible()
}

test.describe('Scorer — Asistente /ronda-libre/nueva', () => {
  test.beforeEach(async () => {
    if (!process.env.E2E_TEST_USER_EMAIL || !process.env.E2E_TEST_USER_PASSWORD) {
      test.skip(true, 'E2E_TEST_USER_EMAIL/PASSWORD no configurados')
    }
  })

  test('carga sin errores y parte por la cancha, sin preguntar quién anota', async ({ page }) => {
    const pageErrors: string[] = []
    const serverErrors: string[] = []
    page.on('pageerror', err => pageErrors.push(err.message))
    page.on('response', res => {
      if (res.status() >= 500) serverErrors.push(`${res.status()} ${res.url()}`)
    })

    const loaded = await gotoNueva(page)
    test.fixme(!loaded, 'Vercel Security Checkpoint bloqueó el headless browser')

    expect(page.url()).not.toContain('/login')

    const bodyText = await page.locator('body').innerText()
    expect(bodyText, 'Paso 1 pregunta dónde juegas').toMatch(/dónde juegas/i)
    expect(bodyText, 'Paso 1 ya no pregunta quién anota').not.toMatch(/quién anota|cada uno marca|yo llevo/i)

    // El stepper muestra los nombres en UPPERCASE (CSS text-transform; innerText lo respeta).
    for (const paso of ['CANCHA', 'FORMATO', 'JUGADORES', 'CONFIRMAR']) {
      expect(bodyText, `el stepper muestra ${paso}`).toContain(paso)
    }

    const appErrors = pageErrors.filter(
      e => !e.includes('Lock broken by another request') && !e.includes('ResizeObserver'),
    )
    expect(appErrors, 'errores JS en /ronda-libre/nueva').toEqual([])
    expect(serverErrors, '5xx en /ronda-libre/nueva').toEqual([])
  })

  test('cancha → formato → jugadores; atrás vuelve a la cancha', async ({ page }) => {
    const loaded = await gotoNueva(page)
    test.fixme(!loaded, 'Vercel Security Checkpoint bloqueó el headless browser')

    await llegarAFormato(page)
    const formato = await page.locator('body').innerText()
    expect(formato).toMatch(/formato de juego/i)
    expect(formato).toMatch(/stroke play/i)
    expect(formato).toMatch(/scramble/i)

    await page.getByRole('button', { name: /atrás/i }).click()
    await expect(subtitulo(page, /dónde juegas/i)).toBeVisible()
    await expect(page.getByLabel('Fecha')).toBeVisible()
  })

  test('Scramble: Equipo 1 con un compañero, se puede jugar contra el par y Revisar se habilita (R4794T)', async ({ page }) => {
    const loaded = await gotoNueva(page)
    test.fixme(!loaded, 'Vercel Security Checkpoint bloqueó el headless browser')

    await llegarAFormato(page)
    await elegirFormatoYSeguir(page, /^scramble\b/i)

    // El nombre del equipo es un <input> editable: se lee por valor, no por texto.
    await expect(page.getByLabel('Nombre del equipo 1')).toHaveValue('Equipo 1')
    await expect(page.getByLabel(/nombre del equipo/i)).toHaveCount(1)
    const jugadores = await page.locator('body').innerText()
    expect(jugadores).toMatch(/contra el par/i)
    expect(jugadores).toMatch(/agregar equipo rival/i)
    expect(jugadores).toMatch(/tú anotas por el grupo/i)
    expect(jugadores, 'el mensaje que frenó a Cristián ya no existe').not.toMatch(/al menos 4 jugadores/i)
    expect(jugadores).not.toMatch(/quién anota/i)

    // Un solo compañero en blanco: Revisar espera a que tenga nombre.
    const revisar = page.getByRole('button', { name: /revisar/i })
    await expect(revisar).toBeDisabled()
    await expect(page.getByLabel(/nombre del jugador 1/i)).toHaveCount(1)
    await page.getByLabel(/nombre del jugador 1/i).fill('Compañero E2E')
    await expect(revisar).toBeEnabled()

    await revisar.click()
    const confirmar = await page.locator('body').innerText()
    expect(confirmar).toMatch(/confirmar ronda/i)
    expect(confirmar).toContain('Equipo 1')
    expect(confirmar).toContain('Compañero E2E')
    expect(confirmar).toMatch(/anota\s+tú, por todos/i)
    expect(confirmar).toMatch(/jugadores \(2\)/i)
  })

  test('Scramble → Stroke Play vuelve a preguntar quién anota y conserva al compañero', async ({ page }) => {
    const loaded = await gotoNueva(page)
    test.fixme(!loaded, 'Vercel Security Checkpoint bloqueó el headless browser')

    await llegarAFormato(page)
    await elegirFormatoYSeguir(page, /^scramble\b/i)
    await page.getByLabel(/nombre del jugador 1/i).fill('Compañero E2E')

    await page.getByRole('button', { name: /atrás/i }).click()
    await elegirFormatoYSeguir(page, /^stroke play\b/i)

    await expect(page.getByText('¿Quién anota?')).toBeVisible()
    await expect(page.getByRole('button', { name: /yo anoto por todos/i })).toHaveAttribute('aria-pressed', 'true')
    await expect(page.getByLabel(/nombre del jugador 1/i)).toHaveValue('Compañero E2E')
    await expect(page.getByLabel(/nombre del equipo/i), 'Stroke Play no arma equipos').toHaveCount(0)
    await expect(page.getByRole('button', { name: /revisar/i })).toBeEnabled()

    await page.getByRole('button', { name: /cada uno en su celular/i }).click()
    await expect(page.getByText(/unirse compartiendo el enlace/i)).toBeVisible()
    await expect(page.getByRole('button', { name: /revisar/i })).toBeEnabled()
  })

  test('Scramble: "+ Agregar equipo rival" abre un segundo equipo con dos tarjetas', async ({ page }) => {
    const loaded = await gotoNueva(page)
    test.fixme(!loaded, 'Vercel Security Checkpoint bloqueó el headless browser')

    await llegarAFormato(page)
    await elegirFormatoYSeguir(page, /^scramble\b/i)
    await page.getByRole('button', { name: /agregar equipo rival/i }).click()

    await expect(page.getByLabel('Nombre del equipo 2')).toBeVisible()
    await expect(page.getByLabel(/nombre del jugador \d/i)).toHaveCount(3)
    expect(await page.locator('body').innerText()).not.toMatch(/contra el par/i)
  })

  test('muestra rondas recientes como atajo (si las hay)', async ({ page }) => {
    const loaded = await gotoNueva(page)
    test.fixme(!loaded, 'Vercel Security Checkpoint bloqueó el headless browser')

    const bodyText = await page.locator('body').innerText()
    // Si el usuario tiene rondas previas, el atajo vive en el paso 1 junto a la cancha.
    if (/últimas rondas/i.test(bodyText)) {
      await expect(subtitulo(page, /dónde juegas/i)).toBeVisible()
      expect(bodyText).toMatch(/repetir/i)
    }
  })
})
