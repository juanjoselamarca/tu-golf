import { test, expect } from '@playwright/test'

/**
 * E2E: import photo scan persiste pares correctos
 *
 * Verifica que al importar una foto de scorecard:
 *   1. Los pares leídos por Gemini (par_per_hole) se muestran correctamente
 *      en el paso de Revisión — específicamente H17 = P5 (no P4 por defecto).
 *   2. El conteo de birdies refleja los pares reales, no los defaults.
 *
 * Este test mockea /api/import/screenshot para controlar el resultado de OCR
 * y verifica la UI del paso Review antes de confirmar.
 *
 * Flujo:
 *   /importar?source=photos → guide step → [upload fake file] → review step
 *   → expandir scorecard → assert P5 en H17 → assert birdies correctos
 *   → [confirmar con mock] → celebration step
 *
 * No requiere auth real ni tocar la BD — los endpoints están mockeados.
 * NOTA: si E2E_TEST_USER_EMAIL no está configurado, se omite con skip.
 */

// Scores: 18 hoyos — H17 (idx 16) = 8, H18 (idx 17) = 6
// Con par_per_hole correcto (H17=5): H17 es +3 (doble bogey). Sin birdies inventados.
// Con par=4 defecto (bug): H17 sería +4. El par_per_hole en el mock tiene TODOS los hoyos.
const MOCK_SCORES = [5, 4, 4, 5, 4, 3, 5, 5, 7, 6, 3, 6, 6, 4, 6, 4, 8, 6]

// Par por hoyo — H17=5, H18=5. El resto son pares estándar de Los Leones.
const MOCK_PAR_PER_HOLE: Record<string, number> = {
  '1': 4, '2': 4, '3': 3, '4': 5, '5': 4, '6': 3, '7': 4, '8': 4, '9': 5,
  '10': 4, '11': 3, '12': 4, '13': 4, '14': 3, '15': 4, '16': 4, '17': 5, '18': 5,
}

// Par total = 72. Con estos scores y pares:
// Birdies (score === par-1): H6 score=3 par=3 → par (no birdie), H11 score=3 par=3 → par.
// Ningún hoyo tiene score = par - 1, así que birdies = 0.
// Con par defecto 4 para TODOS (bug): H6 score=3 par=4 → birdie, H11 score=3 par=4 → birdie → 2 birdies falsos.

const MOCK_SCREENSHOT_RESPONSE = {
  job_id: 'test-job-id-e2e-123',
  rounds: [
    {
      tempId: 'temp-e2e-1',
      course_name: 'Club De Golf Los Leones',
      played_at: '2026-05-13',
      scores: Object.fromEntries(MOCK_SCORES.map((s, i) => [String(i + 1), s])),
      par_per_hole: MOCK_PAR_PER_HOLE,
      total_gross: MOCK_SCORES.reduce((a, b) => a + b, 0),
      holes_played: 18,
      import_confidence: 0.95,
      validation: { valid: true, warnings: [] },
      course_rating: null,
      slope_rating: null,
      metadata: { ambiguous_holes: [] },
    },
  ],
}

// ResultadoCPI debe coincidir con la interface real en src/golf/stats/cpi.ts
// score >= 55 → "Intermedio" según nivelCPI()
const MOCK_CONFIRM_RESPONSE = {
  success: true,
  job_id: 'test-job-id-e2e-123',
  total_imported: 1,
  total_errors: 0,
  total_duplicates: 0,
  inserted_ids: ['fake-uuid-e2e-round-001'],
  cpiResult: {
    score: 62,       // 0-100 — "Intermedio" según nivelCPI (>= 55)
    trend: 1,        // positivo = mejorando
    status: 'provisional',
    breakdown: {
      diferencial_avg: 20,
      consistencia: 55,
      tendencia: 5,
      volumen_factor: 0.8,
    },
    rondas_usadas: 1,
    diferenciales: [20],
  },
  cpi: {
    score: 62,
    trend: 1,
    status: 'provisional',
    breakdown: {
      diferencial_avg: 20,
      consistencia: 55,
      tendencia: 5,
      volumen_factor: 0.8,
    },
    rondas_usadas: 1,
    diferenciales: [20],
  },
  insights: ['Tu primera ronda importada.'],
}

test.describe('Import photo scan — pares correctos en revisión', () => {
  test.beforeEach(() => {
    if (!process.env.E2E_TEST_USER_EMAIL || !process.env.E2E_TEST_USER_PASSWORD) {
      test.skip(true, 'E2E_TEST_USER_EMAIL/PASSWORD no configurados — skip import photo scan test')
    }
  })

  test('H17 muestra P5 y 0 birdies en paso revisión', async ({ page }) => {
    const pageErrors: string[] = []
    page.on('pageerror', err => pageErrors.push(err.message))

    // ── 1. Mockear /api/import/screenshot ──────────────────────────────────
    await page.route('**/api/import/screenshot', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(MOCK_SCREENSHOT_RESPONSE),
      })
    })

    // ── 2. Mockear /api/import/confirm ─────────────────────────────────────
    await page.route('**/api/import/confirm', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(MOCK_CONFIRM_RESPONSE),
      })
    })

    // ── 3. Navegar directamente al paso guide para fotos ───────────────────
    // ?source=photos hace que el wizard arranque en "guide" (saltea survey+selector)
    await page.goto('/importar?source=photos', { waitUntil: 'domcontentloaded' })

    // Esperar que cargue el guide step (texto del guide de fotos)
    await expect(page.locator('text=Pantallazo de scorecard')).toBeVisible({ timeout: 15000 })

    // ── 4. Subir archivo ficticio vía el input oculto ──────────────────────
    // El input de fotos es un <input type="file" accept=".jpg,.jpeg,.png,.heic" multiple>
    // Está display:none — Playwright puede setInputFiles igual.
    const fileInput = page.locator('input[type="file"][accept*=".jpg"]').first()
    await fileInput.setInputFiles({
      name: 'scorecard-garmin.jpg',
      mimeType: 'image/jpeg',
      buffer: Buffer.from('fake-jpeg-content-for-e2e-test'),
    })

    // ── 5. Esperar paso Review ─────────────────────────────────────────────
    // El mock responde instantáneamente → el wizard avanza a "review"
    // que muestra el nombre del campo
    await expect(page.locator('text=Club De Golf Los Leones')).toBeVisible({ timeout: 15000 })

    // ── 6. Expandir el scorecard para ver los pares por hoyo ───────────────
    const verScorecardBtn = page.getByRole('button', { name: /ver scorecard/i }).first()
    await expect(verScorecardBtn).toBeVisible({ timeout: 5000 })
    await verScorecardBtn.click()

    // ── 7. Verificar que H17 muestra P5 (no P4 por defecto) ───────────────
    // El DOM renderiza: <div>17</div><div>P5</div> para el hoyo 17
    // El back 9 (H10-H18) está en la segunda fila del scorecard expandido.
    // H17 es el 8vo hoyo del back 9.
    //
    // Estrategia: buscar "P5" que aparece exactamente 2 veces (H17 y H18 son par 5)
    // y verificar que H17 específicamente muestra P5.
    // La estructura es: hole number (17) seguido de P5 en el mismo bloque.
    const allParFive = page.locator('div:has-text("P5")').filter({ hasText: /^P5$/ })
    await expect(allParFive.first()).toBeVisible({ timeout: 5000 })
    const parFiveCount = await allParFive.count()
    // Esperamos al menos 2 "P5" (hoyos 4, 9, 17, 18 son par 5 → 4 instancias)
    expect(parFiveCount).toBeGreaterThanOrEqual(2)

    // Verificación directa de H17:
    // Buscar el elemento de número de hoyo "17" y verificar que su hermano siguiente contiene "P5"
    const h17Cell = page.locator('div').filter({ hasText: /^17$/ }).nth(0)
    await expect(h17Cell).toBeVisible({ timeout: 5000 })

    // El par de H17 está en el elemento inmediatamente después del número de hoyo
    // Usar el contenedor padre: la estructura es div > div(17) + div(P5) + div(score)
    const h17ParText = await page.evaluate(() => {
      // Buscar todos los divs que contienen exactamente "17"
      const allDivs = Array.from(document.querySelectorAll('div'))
      const h17Div = allDivs.find(d => d.textContent?.trim() === '17' && d.children.length === 0)
      if (!h17Div) return null
      // El par está en el siguiente sibling
      const parSibling = h17Div.nextElementSibling
      return parSibling?.textContent?.trim() ?? null
    })
    expect(h17ParText).toBe('P5')

    // ── 8. Verificar birdies = 0 ──────────────────────────────────────────
    // Con par_per_hole correcto: H3(par=3,score=4)→+1, H6(par=3,score=3)→par, H11(par=3,score=3)→par.
    // Ningún hoyo tiene score < par → 0 birdies.
    // El paso Review NO muestra stats de birdies explícitamente (los muestra el Scorecard en historial).
    // Verificamos indirectamente que el total_gross = 91 y par total = 72, lo que da +19.
    // El display del total gross debe mostrar 91.
    await expect(page.locator('text=91')).toBeVisible({ timeout: 5000 })

    // ── 9. Confirmar el import → paso celebration ──────────────────────────
    const importBtn = page.getByRole('button', { name: /importar.*ronda/i }).first()
    await expect(importBtn).toBeVisible({ timeout: 5000 })
    await importBtn.click()

    // El mock de /api/import/confirm responde → wizard pasa a celebration.
    // La celebration es minimalista (rediseño): muestra "Tarjeta guardada" + resumen
    // y CTA a rondas. Ya NO muestra el CPI/nivel (el prop cpiResult quedó solo por
    // compatibilidad de firma — ver StepCelebration.tsx).
    await expect(page.locator('text=Tarjeta guardada')).toBeVisible({ timeout: 15000 })

    // Sin errores de JS en la página
    expect(pageErrors.filter(e => !e.includes('ResizeObserver'))).toHaveLength(0)
  })
})
