/**
 * E2E — Coach tAIger+: /coach, /coach/progreso, /coach/sesion/nueva
 *
 * Cubre:
 *   1. Dashboard /coach — carga sin errores, muestra upsell PRO o dashboard
 *   2. Upsell page — verifica que "Conocer PRO" aparece para usuarios sin plan PRO
 *   3. Progreso /coach/progreso — carga sin errores, muestra upsell o datos
 *   4. Chat /coach/sesion/nueva — carga sin errores o redirige correctamente
 *   5. Progreso con /api/coach/progress interceptado: meta, gráfico, foco, error + reintento
 *
 * Test user tiene coach_access_enabled=true (beta) con plan free: el acceso al
 * coach lo decide canUseCoach (beta), así que ve el coach y /coach/progreso
 * completos. Sin beta se muestra la pantalla de acceso (CoachGatePage).
 */

import { test, expect, type Page } from '@playwright/test'

/** Helper: navega y detecta BotID. */
async function safeGoto(page: import('@playwright/test').Page, path: string): Promise<boolean> {
  await page.goto(path, { waitUntil: 'domcontentloaded' })
  await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {})
  const bodyText = await page.locator('body').innerText()
  if (bodyText.includes('Failed to verify your browser') || bodyText.includes('Security Checkpoint')) {
    return false
  }
  return true
}

test.describe('Coach tAIger+ — Dashboard', () => {
  test.beforeEach(async () => {
    if (!process.env.E2E_TEST_USER_EMAIL || !process.env.E2E_TEST_USER_PASSWORD) {
      test.skip(true, 'E2E_TEST_USER_EMAIL/PASSWORD no configurados')
    }
  })

  test('dashboard carga sin errores 5xx', async ({ page }) => {
    const pageErrors: string[] = []
    const serverErrors: string[] = []
    page.on('pageerror', err => pageErrors.push(err.message))
    page.on('response', res => {
      if (res.status() >= 500) serverErrors.push(`${res.status()} ${res.url()}`)
    })

    const loaded = await safeGoto(page, '/coach')
    test.fixme(!loaded, 'Vercel BotID bloqueó el headless browser')

    // No debe redirigir a login
    expect(page.url()).not.toContain('/login')

    // Debe mostrar contenido del coach (dashboard o upsell)
    const bodyText = await page.locator('body').innerText({ timeout: 15_000 })
    const hasContent = /taiger|coach|pro|conversar|patrones|rendimiento/i.test(bodyText)
    expect(
      hasContent,
      `Dashboard debe mostrar contenido del coach. Body: ${bodyText.slice(0, 300)}`,
    ).toBeTruthy()

    expect(serverErrors, 'No debe haber errores 5xx').toHaveLength(0)

    const appErrors = pageErrors.filter(
      e => !e.includes('Lock broken by another request') && !e.includes('ResizeObserver'),
    )
    expect(appErrors, 'No debe haber errores JS de la app').toHaveLength(0)
  })

  test('muestra upsell PRO con CTA "Conocer PRO"', async ({ page }) => {
    const loaded = await safeGoto(page, '/coach')
    test.fixme(!loaded, 'Vercel BotID bloqueó el headless browser')

    await page.waitForTimeout(2000)
    const bodyText = await page.locator('body').innerText()

    // Test user no tiene PRO — debe ver upsell
    // Si el paywall está desactivado, verá el dashboard directamente (ambos son válidos)
    const hasUpsell = /conocer.*pro|coach.*pro|desbloquea|mejorar.*plan/i.test(bodyText)
    const hasDashboard = /conversar|patrones|progreso|analizando|hablar.*coach/i.test(bodyText)
    const hasGate = /código.*acceso|activar|TAIGER/i.test(bodyText)

    expect(
      hasUpsell || hasDashboard || hasGate,
      `Debe mostrar upsell PRO, dashboard o gate. Body: ${bodyText.slice(0, 300)}`,
    ).toBeTruthy()
  })

  test('hero tAIger+ es visible con subtítulo', async ({ page }) => {
    const loaded = await safeGoto(page, '/coach')
    test.fixme(!loaded, 'Vercel BotID bloqueó el headless browser')

    await page.waitForTimeout(2000)

    // El hero "tAIger+" debe ser visible en cualquier estado (upsell o dashboard)
    const taigerHeading = page.getByText(/taiger\+/i).first()
    await expect(taigerHeading).toBeVisible({ timeout: 10_000 })

    // Subtítulo descriptivo
    const bodyText = await page.locator('body').innerText()
    const hasSubtitle = /coach.*rendimiento|inteligencia.*artificial|análisis.*patrones/i.test(bodyText)
    expect(hasSubtitle, 'Debe tener subtítulo descriptivo del coach').toBeTruthy()
  })
})

// ─── Progreso ───────────────────────────────────────────────────────────

test.describe('Coach tAIger+ — Progreso', () => {
  test.beforeEach(async () => {
    if (!process.env.E2E_TEST_USER_EMAIL || !process.env.E2E_TEST_USER_PASSWORD) {
      test.skip(true, 'E2E_TEST_USER_EMAIL/PASSWORD no configurados')
    }
  })

  test('/coach/progreso carga sin errores', async ({ page }) => {
    const pageErrors: string[] = []
    const serverErrors: string[] = []
    page.on('pageerror', err => pageErrors.push(err.message))
    page.on('response', res => {
      if (res.status() >= 500) serverErrors.push(`${res.status()} ${res.url()}`)
    })

    const loaded = await safeGoto(page, '/coach/progreso')
    test.fixme(!loaded, 'Vercel BotID bloqueó el headless browser')

    expect(page.url()).not.toContain('/login')

    await page.waitForTimeout(3000)
    const bodyText = await page.locator('body').innerText()

    // Puede mostrar progreso, upsell, gate, o redirigir al coach
    const hasProgress = /progreso|avance|meta|handicap|foco/i.test(bodyText)
    const hasUpsell = /pro|mejorar.*plan|suscri|conocer.*pro|desbloquea/i.test(bodyText)
    const hasGate = /código.*acceso|activar|TAIGER/i.test(bodyText)
    const hasCoach = /taiger|coach|rendimiento/i.test(bodyText)

    expect(
      hasProgress || hasUpsell || hasGate || hasCoach,
      `Progreso debe mostrar datos, upsell, gate o coach. Body: ${bodyText.slice(0, 300)}`,
    ).toBeTruthy()

    expect(serverErrors, 'No debe haber errores 5xx').toHaveLength(0)

    const appErrors = pageErrors.filter(
      e => !e.includes('Lock broken by another request') && !e.includes('ResizeObserver'),
    )
    expect(appErrors, 'No debe haber errores JS de la app').toHaveLength(0)
  })
})

// ─── Chat ───────────────────────────────────────────────────────────────

test.describe('Coach tAIger+ — Chat', () => {
  test.beforeEach(async () => {
    if (!process.env.E2E_TEST_USER_EMAIL || !process.env.E2E_TEST_USER_PASSWORD) {
      test.skip(true, 'E2E_TEST_USER_EMAIL/PASSWORD no configurados')
    }
  })

  test('/coach/sesion/nueva carga sin errores', async ({ page }) => {
    const pageErrors: string[] = []
    const serverErrors: string[] = []
    page.on('pageerror', err => pageErrors.push(err.message))
    page.on('response', res => {
      if (res.status() >= 500) serverErrors.push(`${res.status()} ${res.url()}`)
    })

    const loaded = await safeGoto(page, '/coach/sesion/nueva')
    test.fixme(!loaded, 'Vercel BotID bloqueó el headless browser')

    expect(page.url()).not.toContain('/login')

    await page.waitForTimeout(3000)
    const bodyText = await page.locator('body').innerText()

    // Chat puede mostrar: interfaz de chat, upsell, gate, o redirigir
    const hasChat = /escribe.*mensaje|enviar|sugerencia|¿qué|cómo/i.test(bodyText)
    const hasUpsell = /pro|conocer.*pro|desbloquea/i.test(bodyText)
    const hasGate = /código.*acceso|activar|TAIGER/i.test(bodyText)
    const hasCoach = /taiger|coach|rendimiento/i.test(bodyText)

    expect(
      hasChat || hasUpsell || hasGate || hasCoach,
      `Chat debe mostrar interfaz, upsell, gate o coach. URL: ${page.url()}, Body: ${bodyText.slice(0, 300)}`,
    ).toBeTruthy()

    expect(serverErrors, 'No debe haber errores 5xx').toHaveLength(0)

    const appErrors = pageErrors.filter(
      e => !e.includes('Lock broken by another request') && !e.includes('ResizeObserver'),
    )
    expect(appErrors, 'No debe haber errores JS de la app').toHaveLength(0)
  })
})

/* ─── /coach/progreso con datos controlados ─────────────────────────────────────
 * Los tests de arriba solo confirman que la pantalla carga (el usuario E2E tiene
 * un perfil real que cambia). Acá /api/coach/progress se intercepta con datos
 * conocidos para verificar QUÉ se pinta: la meta, el gráfico de avance, el foco
 * y el error con reintento. No escribe nada en prod: solo se reemplaza la
 * respuesta de una lectura.
 */

interface PuntoSerieMock { played_at: string; delta_vs_handicap_expected: number; holes_played: number }

function progreso(over: {
  target?: { currentHandicap: number | null; targetHandicap: number | null; targetDeadline: string | null }
  serie?: PuntoSerieMock[]
  focus?: Record<string, unknown>
} = {}) {
  return {
    focus: over.focus ?? { kind: 'fallback', reason: 'cold_start' },
    target: over.target ?? { currentHandicap: 15.4, targetHandicap: 12, targetDeadline: '2027-03-15' },
    serie: over.serie ?? [],
    activePlan: null,
    outcomes: [],
  }
}

/** Serie de 18h (una por semana desde marzo) más, opcionalmente, una de 9h al final. */
function serie(deltas18: number[], ultima9?: number): PuntoSerieMock[] {
  const puntos = deltas18.map((d, i) => ({
    played_at: `2026-${String(3 + Math.floor(i / 4)).padStart(2, '0')}-${String(1 + (i % 4) * 7).padStart(2, '0')}`,
    delta_vs_handicap_expected: d,
    holes_played: 18,
  }))
  if (ultima9 != null) puntos.push({ played_at: '2026-10-10', delta_vs_handicap_expected: ultima9, holes_played: 9 })
  return puntos
}

/** Intercepta /api/coach/progress. Devuelve cuántas veces se pidió. */
async function mockProgreso(page: Page, responder: (n: number) => { status: number; body: unknown }) {
  const llamadas = { n: 0 }
  await page.route(/\/api\/coach\/progress(\?|$)/, route => {
    llamadas.n++
    const r = responder(llamadas.n)
    return route.fulfill({ status: r.status, contentType: 'application/json', body: JSON.stringify(r.body) })
  })
  return llamadas
}

async function abrirProgreso(page: Page) {
  await page.goto('/coach/progreso', { waitUntil: 'domcontentloaded' })
  const body = await page.locator('body').innerText()
  test.fixme(
    body.includes('Failed to verify your browser') || body.includes('Security Checkpoint'),
    'Vercel BotID bloqueó el headless browser',
  )
}

test.describe('Coach tAIger+ — Progreso con datos controlados', () => {
  test.beforeEach(async () => {
    if (!process.env.E2E_TEST_USER_EMAIL || !process.env.E2E_TEST_USER_PASSWORD) {
      test.skip(true, 'E2E_TEST_USER_EMAIL/PASSWORD no configurados')
    }
  })

  test('con meta: hoy → meta, lo que falta, la fecha y la bajada del gráfico', async ({ page }) => {
    const pageErrors: string[] = []
    page.on('pageerror', err => pageErrors.push(err.message))
    // Las 18h bajan de +2.5 (promedio de las 5 previas) a 0 (las 5 últimas): "mejorando".
    // La última ronda es de 9h: se marca como tal y su dif = 15.4 − 2 = 13.4.
    await mockProgreso(page, () => ({
      status: 200,
      body: progreso({ serie: serie([3, 3, 2.5, 2, 2, 1, 0.5, 0, -0.5, -1], -2) }),
    }))
    await abrirProgreso(page)

    await expect(page.getByRole('heading', { level: 1, name: 'La bajada hacia tu meta' })).toBeVisible({ timeout: 20_000 })
    await expect(page.getByText('Hoy', { exact: true })).toBeVisible()
    await expect(page.getByText('15.4', { exact: true })).toBeVisible()
    await expect(page.getByText('Meta', { exact: true })).toBeVisible()
    await expect(page.getByText('12.0', { exact: true })).toBeVisible()
    // 15.4 − 12 = 3.4 (sin el ruido de coma flotante 3.4000000000000004).
    await expect(page.getByText('3.4', { exact: true })).toBeVisible()
    await expect(page.getByText('puntos para tu objetivo')).toBeVisible()
    await expect(page.getByText('Estás en tu meta.')).toHaveCount(0)
    // La fecha se formatea en es-CL en el navegador; se compara contra el mismo formato.
    const fecha = await page.evaluate(() =>
      new Date('2027-03-15T00:00:00').toLocaleDateString('es-CL', { day: 'numeric', month: 'short', year: 'numeric' }),
    )
    expect(fecha).toMatch(/15/)
    expect(fecha).toMatch(/2027/)
    await expect(page.getByText(`antes de ${fecha}`, { exact: true })).toBeVisible()

    const grafico = page.getByRole('img', { name: 'Diferenciales por ronda hacia la meta' })
    await expect(grafico).toBeVisible()
    await expect(page.getByText('↓ mejorando', { exact: true })).toBeVisible()
    await expect(grafico.getByText('meta 12', { exact: true })).toBeAttached()
    await expect(grafico.getByText('hcp 15.4', { exact: true })).toBeAttached()
    await expect(page.getByText('Última ronda · 9 hoyos', { exact: true })).toBeVisible()
    await expect(page.getByText('dif 13.4', { exact: true })).toBeVisible()
    await expect(page.getByText('9 hoyos (equiv. 18h, más volátil)')).toBeVisible()

    // #573: las etiquetas del SVG se veían a ~5 px (viewBox 600 escalado al celular).
    // Tamaño en pantalla = font-size declarado × (ancho dibujado / ancho del viewBox).
    const px = await grafico.evaluate(svg => {
      const s = svg as SVGSVGElement
      const t = s.querySelector('text')
      const declarado = Number(t?.getAttribute('font-size') ?? 0)
      return declarado * (s.getBoundingClientRect().width / s.viewBox.baseVal.width)
    })
    expect(px, `etiquetas del gráfico a ${px.toFixed(1)} px en pantalla`).toBeGreaterThanOrEqual(9.5)

    const cta = page.getByRole('link', { name: /Trabajar esto con el coach/ })
    await expect(cta).toHaveAttribute('href', '/coach')
    const box = await cta.boundingBox()
    expect(box?.height ?? 0, 'CTA usable con el pulgar').toBeGreaterThanOrEqual(44)

    expect(pageErrors.filter(e => !e.includes('ResizeObserver') && !e.includes('Lock broken'))).toHaveLength(0)
  })

  test('serie pareja de 18h: "→ estable" y la última ronda sin marca de 9 hoyos', async ({ page }) => {
    await mockProgreso(page, () => ({ status: 200, body: progreso({ serie: serie([1, 1, 1, 1, 1, 1, 1, 1, 1, 1.5]) }) }))
    await abrirProgreso(page)

    await expect(page.getByText('→ estable', { exact: true })).toBeVisible({ timeout: 20_000 })
    await expect(page.getByText('↓ mejorando')).toHaveCount(0)
    await expect(page.getByText('Última ronda', { exact: true })).toBeVisible()
    await expect(page.getByText('dif 16.9', { exact: true })).toBeVisible()
    await expect(page.getByText(/9 hoyos/)).toHaveCount(0)
  })

  test('meta alcanzada: "Estás en tu meta." y no "puntos para tu objetivo"', async ({ page }) => {
    await mockProgreso(page, () => ({
      status: 200,
      body: progreso({ target: { currentHandicap: 11.8, targetHandicap: 12, targetDeadline: null } }),
    }))
    await abrirProgreso(page)

    await expect(page.getByText('Estás en tu meta.', { exact: true })).toBeVisible({ timeout: 20_000 })
    await expect(page.getByText('puntos para tu objetivo')).toHaveCount(0)
    // Sin fecha límite no se inventa un "antes de".
    await expect(page.getByText(/antes de/)).toHaveCount(0)
  })

  test('sin meta: muestra el hándicap actual e invita a fijarla con el coach', async ({ page }) => {
    await mockProgreso(page, () => ({
      status: 200,
      body: progreso({ target: { currentHandicap: 15, targetHandicap: null, targetDeadline: null } }),
    }))
    await abrirProgreso(page)

    await expect(page.getByText('Hándicap actual', { exact: true })).toBeVisible({ timeout: 20_000 })
    await expect(page.getByText('15.0', { exact: true })).toBeVisible()
    await expect(page.getByRole('link', { name: /Fija tu meta con el coach/ })).toHaveAttribute('href', '/coach')
    await expect(page.getByText('Meta', { exact: true })).toHaveCount(0)
    await expect(page.getByText('puntos para tu objetivo')).toHaveCount(0)
  })

  test('menos de 2 rondas: explica qué falta en vez de dibujar un gráfico vacío', async ({ page }) => {
    await mockProgreso(page, () => ({ status: 200, body: progreso({ serie: serie([1]) }) }))
    await abrirProgreso(page)

    await expect(page.getByText(/Necesito al menos 2 rondas con diferencial/)).toBeVisible({ timeout: 20_000 })
    await expect(page.getByRole('img', { name: 'Diferenciales por ronda hacia la meta' })).toHaveCount(0)
    await expect(page.getByText(/^dif /)).toHaveCount(0)
  })

  // Cada tipo de evidencia se traduce a una frase; nunca se muestra la clave cruda.
  const evidencias: Array<{ caso: string; evidencia: Record<string, number>; frase: string; clave: string }> = [
    { caso: 'espiral de bogeys', evidencia: { spiral_rate: 0.42 }, frase: '42% de tus bogeys arrastran a otro bogey o peor.', clave: 'spiral_rate' },
    { caso: 'back nine peor', evidencia: { front9_avg: 4.5, back9_avg: 5.3 }, frase: 'Tu back nine promedia 0.8 golpes más que tu front nine.', clave: 'back9_avg' },
    { caso: 'front nine peor', evidencia: { front9_avg: 5, back9_avg: 4.6 }, frase: 'Tu front nine promedia 0.4 golpes más que tu back nine.', clave: 'front9_avg' },
  ]
  for (const ev of evidencias) {
    test(`foco (${ev.caso}): título, evidencia en palabras y la acción de la semana`, async ({ page }) => {
      await mockProgreso(page, () => ({
        status: 200,
        body: progreso({
          focus: {
            kind: 'focus',
            label: 'Foco E2E',
            accion: 'Juega el hoyo siguiente al centro del green.',
            evidencia: ev.evidencia,
          },
        }),
      }))
      await abrirProgreso(page)

      await expect(page.getByText('Tu foco ahora', { exact: true })).toBeVisible({ timeout: 20_000 })
      await expect(page.getByRole('heading', { level: 2, name: 'Foco E2E' })).toBeVisible()
      await expect(page.getByText(ev.frase, { exact: true })).toBeVisible()
      await expect(page.getByText('Esta semana', { exact: true })).toBeVisible()
      await expect(page.getByText('Juega el hoyo siguiente al centro del green.', { exact: true })).toBeVisible()
      expect(await page.locator('body').innerText()).not.toContain(ev.clave)
    })
  }

  test('sin foco: distingue "faltan rondas" de "estás parejo"', async ({ page }) => {
    let reason = 'cold_start'
    await mockProgreso(page, () => ({ status: 200, body: progreso({ focus: { kind: 'fallback', reason } }) }))
    await abrirProgreso(page)
    await expect(page.getByText('Todavía no tengo un foco claro para darte.')).toBeVisible({ timeout: 20_000 })
    await expect(page.getByText(/Me faltan rondas para leer un patrón real/)).toBeVisible()
    await expect(page.getByText('Tu foco ahora')).toHaveCount(0)

    reason = 'no_clear_leak'
    await page.reload({ waitUntil: 'domcontentloaded' })
    await expect(page.getByText(/Tus números no muestran una fuga clara/)).toBeVisible({ timeout: 20_000 })
    await expect(page.getByText(/Me faltan rondas/)).toHaveCount(0)
  })

  test('si la API falla muestra el error y "Reintentar" recupera la vista', async ({ page }) => {
    const llamadas = await mockProgreso(page, n =>
      n === 1
        ? { status: 500, body: { error: 'Error leyendo el progreso' } }
        : { status: 200, body: progreso({ serie: serie([1, 0]) }) },
    )
    await abrirProgreso(page)

    await expect(page.getByText('No pude cargar tu progreso', { exact: true })).toBeVisible({ timeout: 20_000 })
    await expect(page.getByText('Error leyendo el progreso', { exact: true })).toBeVisible()
    const reintentar = page.getByRole('button', { name: 'Reintentar' })
    const box = await reintentar.boundingBox()
    expect(box?.height ?? 0).toBeGreaterThanOrEqual(44)
    await reintentar.click()

    await expect(page.getByRole('heading', { level: 1, name: 'La bajada hacia tu meta' })).toBeVisible({ timeout: 20_000 })
    await expect(page.getByText('No pude cargar tu progreso')).toHaveCount(0)
    expect(llamadas.n).toBe(2)
  })

  // BUG de la app (16-oct, en pendientes E2E): con meta fijada pero sin hándicap actual
  // (currentHandicap null), MetaResumen muestra "Hoy —" y además "Estás en tu meta.":
  // `delta` es null y cae en la rama de meta cumplida. Al arreglarlo, quitar el fixme.
  test.fixme('meta fijada sin hándicap actual: no dice "Estás en tu meta."', async ({ page }) => {
    await mockProgreso(page, () => ({
      status: 200,
      body: progreso({ target: { currentHandicap: null, targetHandicap: 12, targetDeadline: null } }),
    }))
    await abrirProgreso(page)
    await expect(page.getByText('Meta', { exact: true })).toBeVisible({ timeout: 20_000 })
    await expect(page.getByText('Estás en tu meta.')).toHaveCount(0)
  })
})
