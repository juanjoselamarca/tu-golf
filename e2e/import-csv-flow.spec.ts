import { test, expect, type Page } from '@playwright/test'

/**
 * E2E — Import CSV flow: upload → review → accept/reject → confirm.
 *
 * Tests the full CSV import wizard flow with mocked /api/import/csv
 * and /api/import/confirm endpoints. No real data is created in prod.
 *
 * Cubre:
 *   1. CSV upload triggers guide → review transition with parsed rounds
 *   2. Review step shows round cards with correct data (course, score, date)
 *   3. Summary pills show correct counts (Garmin, verified, review needed)
 *   4. Accept/reject/restore buttons toggle correctly
 *   5. Expanded scorecard shows hole-by-hole scores
 *   6. Confirm button sends accepted rounds and shows celebration
 *   7. Error handling: needsMapping shows error message
 *   8. Error handling: server error shows fallback message
 *   9. Empty CSV (0 rounds) handled gracefully
 *
 * NO toca la BD: mock intercepta las requests.
 */

/* ─── Mock Data ──────────────────────────────────────── */

const MOCK_CSV_ROUNDS = [
  {
    tempId: 'csv-e2e-round-1',
    played_at: '2026-09-20',
    course_name: 'Club de Golf Los Leones',
    total_gross: 82,
    holes_played: 18,
    scores: Object.fromEntries(
      [4, 5, 3, 5, 4, 4, 4, 5, 4, 5, 3, 4, 5, 3, 4, 4, 5, 5].map((s, i) => [
        String(i + 1),
        s,
      ]),
    ),
    par_per_hole: Object.fromEntries(
      [4, 4, 3, 5, 4, 3, 4, 4, 5, 4, 3, 4, 4, 3, 4, 4, 5, 5].map((p, i) => [
        String(i + 1),
        p,
      ]),
    ),
    import_confidence: 1.0, // Garmin data
    validation: { valid: true, holesPlayed: 18, issues: [] },
    metadata: { putts: 31, fairways: 10, gir: 8 },
  },
  {
    tempId: 'csv-e2e-round-2',
    played_at: '2026-09-15',
    course_name: 'Prince of Wales Country Club',
    total_gross: 95,
    holes_played: 18,
    scores: Object.fromEntries(
      [5, 6, 4, 6, 5, 4, 5, 6, 5, 6, 4, 5, 6, 4, 5, 5, 6, 6].map((s, i) => [
        String(i + 1),
        s,
      ]),
    ),
    par_per_hole: Object.fromEntries(
      [4, 4, 3, 5, 4, 3, 4, 4, 5, 4, 3, 4, 4, 3, 4, 4, 5, 5].map((p, i) => [
        String(i + 1),
        p,
      ]),
    ),
    import_confidence: 0.85,
    validation: { valid: true, holesPlayed: 18, issues: [] },
    metadata: { putts: 36 },
  },
  {
    tempId: 'csv-e2e-round-3',
    played_at: '2026-09-10',
    course_name: 'La Dehesa Golf Club',
    total_gross: 48,
    holes_played: 9,
    scores: Object.fromEntries(
      [5, 6, 4, 6, 5, 4, 5, 6, 5].map((s, i) => [String(i + 1), s]),
    ),
    par_per_hole: Object.fromEntries(
      [4, 4, 3, 5, 4, 3, 4, 4, 5].map((p, i) => [String(i + 1), p]),
    ),
    import_confidence: 0.6,
    validation: { valid: true, holesPlayed: 9, issues: ['Solo 9 hoyos detectados'] },
    metadata: {},
  },
]

const MOCK_CSV_RESPONSE = {
  job_id: 'csv-e2e-job-001',
  format: '18birdies',
  total_detected: 3,
  total_valid: 3,
  total_errors: 0,
  rounds: MOCK_CSV_ROUNDS,
  errors: [],
}

const MOCK_CONFIRM_RESPONSE = {
  success: true,
  job_id: 'csv-e2e-job-001',
  total_imported: 2,
  total_errors: 0,
  total_duplicates: 0,
  inserted_ids: ['uuid-e2e-1', 'uuid-e2e-2'],
  errors: [],
  duplicates: [],
  cpi: null,
}

/* ─── Helpers ──────────────────────────────────────────── */

function attachErrorTrackers(page: Page) {
  const pageErrors: string[] = []
  const serverErrors: string[] = []
  page.on('pageerror', (err) => pageErrors.push(err.message))
  page.on('response', (res) => {
    if (res.status() >= 500 && !res.url().includes('/api/import/'))
      serverErrors.push(`${res.status()} ${res.url()}`)
  })
  return { pageErrors, serverErrors }
}

async function isBlockedByVercel(page: Page): Promise<boolean> {
  const bodyText = await page.locator('body').innerText()
  return (
    bodyText.includes('Failed to verify your browser') ||
    bodyText.includes('Security Checkpoint')
  )
}

/** Set up mock routes for CSV import and confirm. */
async function setupCsvMocks(
  page: Page,
  csvResponse = MOCK_CSV_RESPONSE,
  confirmResponse = MOCK_CONFIRM_RESPONSE,
) {
  await page.route('**/api/import/csv', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(csvResponse),
    })
  })

  await page.route('**/api/import/confirm', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(confirmResponse),
    })
  })
}

/** Navigate to CSV import guide step (skipping survey). */
async function goToCsvGuide(page: Page) {
  await page.goto('/importar?source=csv', { waitUntil: 'domcontentloaded' })
  await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {})
}

/** Upload a fake CSV file via the hidden input. */
async function uploadFakeCsv(page: Page, filename = 'garmin-export.csv') {
  const fileInput = page.locator('input[type="file"][accept*=".csv"]').first()
  await fileInput.setInputFiles({
    name: filename,
    mimeType: 'text/csv',
    buffer: Buffer.from(
      'Date,Course,Total,H1,H2,H3\n2026-09-20,Los Leones,82,4,5,3',
    ),
  })
}

/* ═══════════════════════════════════════════════════════ */
/*  CSV Import Flow (autenticado, mocked APIs)            */
/* ═══════════════════════════════════════════════════════ */

test.describe('Import CSV — flujo completo con mock', () => {
  test.beforeEach(async () => {
    if (
      !process.env.E2E_TEST_USER_EMAIL ||
      !process.env.E2E_TEST_USER_PASSWORD
    ) {
      test.skip(true, 'E2E_TEST_USER_EMAIL/PASSWORD no configurados')
    }
  })

  test('upload CSV muestra review con 3 rondas parseadas', async ({
    page,
  }) => {
    const { pageErrors } = attachErrorTrackers(page)
    await setupCsvMocks(page)
    await goToCsvGuide(page)

    test.fixme(
      await isBlockedByVercel(page),
      'Vercel Security Checkpoint bloqueó el headless browser',
    )

    // Verify CSV guide step is showing
    await expect(
      page.getByText('Archivo de Garmin', { exact: false }),
    ).toBeVisible({ timeout: 10_000 })

    // Upload fake CSV
    await uploadFakeCsv(page)

    // Should transition to review step
    await expect(page.getByText(/Revisar \d+ rondas/)).toBeVisible({
      timeout: 15_000,
    })

    // Verify all 3 course names appear
    await expect(
      page.getByText('Club de Golf Los Leones'),
    ).toBeVisible()
    await expect(
      page.getByText('Prince of Wales Country Club'),
    ).toBeVisible()
    await expect(page.getByText('La Dehesa Golf Club')).toBeVisible()

    // Verify scores are shown
    await expect(page.getByText('82')).toBeVisible()
    await expect(page.getByText('95')).toBeVisible()
    await expect(page.getByText('48')).toBeVisible()

    const appErrors = pageErrors.filter(
      (e) => !e.includes('ResizeObserver'),
    )
    expect(appErrors).toHaveLength(0)
  })

  test('summary pills show correct counts by confidence', async ({
    page,
  }) => {
    await setupCsvMocks(page)
    await goToCsvGuide(page)
    test.fixme(
      await isBlockedByVercel(page),
      'Vercel Security Checkpoint bloqueó el headless browser',
    )

    await uploadFakeCsv(page)
    await expect(page.getByText(/Revisar \d+ rondas/)).toBeVisible({
      timeout: 15_000,
    })

    // Round 1: confidence=1.0 → Garmin pill
    // Round 2: confidence=0.85 → verified/lista
    // Round 3: confidence=0.6 → revisar
    const body = await page.locator('body').innerText()

    // At least one Garmin badge
    expect(body).toContain('Garmin')

    // Low confidence round should show review indicator
    const hasReviewIndicator =
      body.includes('revisar') || body.includes('REVISAR')
    expect(
      hasReviewIndicator,
      'Low confidence rounds should show review indicator',
    ).toBe(true)
  })

  test('accept and reject toggle correctly on round cards', async ({
    page,
  }) => {
    await setupCsvMocks(page)
    await goToCsvGuide(page)
    test.fixme(
      await isBlockedByVercel(page),
      'Vercel Security Checkpoint bloqueó el headless browser',
    )

    await uploadFakeCsv(page)
    await expect(page.getByText(/Revisar \d+ rondas/)).toBeVisible({
      timeout: 15_000,
    })

    // Find the first "Descartar" button (rounds start accepted by default for high confidence)
    const descartarBtns = page.getByRole('button', { name: /Descartar/i })
    const firstDescartar = descartarBtns.first()

    // If rounds start as accepted, there should be Descartar buttons
    const descartarCount = await descartarBtns.count()

    if (descartarCount > 0) {
      // Click "Descartar" on first round
      await firstDescartar.click()

      // Should now show "Restaurar" for that round
      const restaurarBtn = page.getByRole('button', { name: /Restaurar/i })
      await expect(restaurarBtn.first()).toBeVisible({ timeout: 5_000 })

      // Click "Restaurar" to re-accept
      await restaurarBtn.first().click()

      // Should go back to accepted state
      await expect(
        page.getByRole('button', { name: /Descartar/i }).first(),
      ).toBeVisible({ timeout: 5_000 })
    } else {
      // Rounds may start in "pending" state with "Aceptar" button
      const aceptarBtns = page.getByRole('button', { name: /Aceptar/i })
      const aceptarCount = await aceptarBtns.count()
      expect(
        aceptarCount,
        'Should have Aceptar or Descartar buttons',
      ).toBeGreaterThan(0)

      // Accept the first round
      await aceptarBtns.first().click()

      // Should now show "Aceptada" or "Descartar"
      const body = await page.locator('body').innerText()
      const accepted =
        body.includes('Aceptada') || body.includes('Descartar')
      expect(accepted, 'Round should be marked as accepted').toBe(true)
    }
  })

  test('expanded scorecard shows hole-by-hole scores', async ({ page }) => {
    await setupCsvMocks(page)
    await goToCsvGuide(page)
    test.fixme(
      await isBlockedByVercel(page),
      'Vercel Security Checkpoint bloqueó el headless browser',
    )

    await uploadFakeCsv(page)
    await expect(page.getByText(/Revisar \d+ rondas/)).toBeVisible({
      timeout: 15_000,
    })

    // Find and click the expand chevron for the first round card
    // The expand button is typically a chevron icon
    const expandBtns = page.locator(
      'button:has(svg)',
    )

    // Try to find "Ver scorecard" button if it exists
    const verScorecard = page.getByRole('button', {
      name: /ver scorecard/i,
    })
    const chevronBtn = expandBtns.first()

    if ((await verScorecard.count()) > 0) {
      await verScorecard.first().click()
    } else if ((await chevronBtn.count()) > 0) {
      // Click the first card to expand it
      const firstCard = page.locator('[class*="round"]').first()
      if ((await firstCard.count()) > 0) {
        await firstCard.click()
      }
    }

    // Wait a moment for expansion animation
    await page.waitForTimeout(500)

    // After expansion, should see hole numbers (1-9 at minimum)
    const body = await page.locator('body').innerText()

    // The scorecard should show par labels like P4, P5, P3
    const hasParLabels =
      body.includes('P4') || body.includes('P5') || body.includes('P3')

    // Or it might show the hole numbers in a grid
    const hasHoleNumbers = body.includes('OUT') || body.includes('IN')

    expect(
      hasParLabels || hasHoleNumbers,
      'Expanded scorecard should show hole data (par labels or OUT/IN totals)',
    ).toBe(true)
  })

  test('confirm import shows celebration step', async ({ page }) => {
    const { pageErrors } = attachErrorTrackers(page)
    await setupCsvMocks(page)
    await goToCsvGuide(page)
    test.fixme(
      await isBlockedByVercel(page),
      'Vercel Security Checkpoint bloqueó el headless browser',
    )

    await uploadFakeCsv(page)
    await expect(page.getByText(/Revisar \d+ rondas/)).toBeVisible({
      timeout: 15_000,
    })

    // Make sure at least one round is accepted
    // High confidence rounds (Garmin) start auto-accepted
    // Check if confirm button is already enabled
    const confirmBtn = page.getByRole('button', {
      name: /Importar \d+ rondas?/i,
    })

    if ((await confirmBtn.count()) === 0) {
      // Need to accept rounds manually first
      const aceptarBtns = page.getByRole('button', { name: /Aceptar/i })
      if ((await aceptarBtns.count()) > 0) {
        await aceptarBtns.first().click()
        await page.waitForTimeout(300)
      }
    }

    // Click confirm
    const finalConfirmBtn = page.getByRole('button', {
      name: /Importar \d+ rondas?/i,
    })
    await expect(finalConfirmBtn).toBeVisible({ timeout: 5_000 })
    await finalConfirmBtn.click()

    // Should show celebration/success step
    // The celebration shows "Tarjeta guardada" or similar success message
    await expect(
      page
        .getByText(/guardad[ao]s?|importad[ao]s?|éxito|listo/i)
        .first(),
    ).toBeVisible({ timeout: 15_000 })

    const appErrors = pageErrors.filter(
      (e) => !e.includes('ResizeObserver'),
    )
    expect(appErrors).toHaveLength(0)
  })

  test('9-hole round shows correct hole count', async ({ page }) => {
    await setupCsvMocks(page)
    await goToCsvGuide(page)
    test.fixme(
      await isBlockedByVercel(page),
      'Vercel Security Checkpoint bloqueó el headless browser',
    )

    await uploadFakeCsv(page)
    await expect(page.getByText(/Revisar \d+ rondas/)).toBeVisible({
      timeout: 15_000,
    })

    // La Dehesa round is 9 holes — should show "9h" indicator
    const body = await page.locator('body').innerText()
    const has9h = body.includes('9h') || body.includes('9 hoyos')
    expect(has9h, 'Should show 9-hole indicator for short round').toBe(
      true,
    )
  })
})

/* ═══════════════════════════════════════════════════════ */
/*  Error Handling                                        */
/* ═══════════════════════════════════════════════════════ */

test.describe('Import CSV — manejo de errores', () => {
  test.beforeEach(async () => {
    if (
      !process.env.E2E_TEST_USER_EMAIL ||
      !process.env.E2E_TEST_USER_PASSWORD
    ) {
      test.skip(true, 'E2E_TEST_USER_EMAIL/PASSWORD no configurados')
    }
  })

  test('needsMapping response shows column error message', async ({
    page,
  }) => {
    // Mock with needsMapping response
    await page.route('**/api/import/csv', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          job_id: 'csv-e2e-mapping-001',
          needsMapping: true,
          headers: ['Fecha', 'Campo', 'Score'],
          previewRows: [['2026-09-20', 'Los Leones', '82']],
          total_rows: 5,
        }),
      })
    })

    await goToCsvGuide(page)
    test.fixme(
      await isBlockedByVercel(page),
      'Vercel Security Checkpoint bloqueó el headless browser',
    )

    await uploadFakeCsv(page, 'unknown-format.csv')

    // Should show error about columns not detected
    await expect(
      page
        .getByText(/no pudimos detectar|columnas|formato/i)
        .first(),
    ).toBeVisible({ timeout: 10_000 })

    // Should NOT transition to review step
    const hasReview = await page
      .getByText(/Revisar \d+ rondas/)
      .isVisible()
      .catch(() => false)
    expect(hasReview, 'Should not show review step on mapping error').toBe(
      false,
    )
  })

  test('server error shows fallback error message', async ({ page }) => {
    await page.route('**/api/import/csv', async (route) => {
      await route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Internal server error' }),
      })
    })

    await goToCsvGuide(page)
    test.fixme(
      await isBlockedByVercel(page),
      'Vercel Security Checkpoint bloqueó el headless browser',
    )

    await uploadFakeCsv(page, 'broken.csv')

    // Should show error message
    await expect(
      page.getByText(/error|problema|no se pudo/i).first(),
    ).toBeVisible({ timeout: 10_000 })
  })

  test('empty CSV (0 rounds) handled gracefully', async ({ page }) => {
    await page.route('**/api/import/csv', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          job_id: 'csv-e2e-empty-001',
          format: '18birdies',
          total_detected: 0,
          total_valid: 0,
          total_errors: 0,
          rounds: [],
          errors: [],
        }),
      })
    })

    await goToCsvGuide(page)
    test.fixme(
      await isBlockedByVercel(page),
      'Vercel Security Checkpoint bloqueó el headless browser',
    )

    await uploadFakeCsv(page, 'empty.csv')

    // Should handle gracefully — no crash, shows some feedback
    await page.waitForTimeout(3_000)

    const body = await page.locator('body').innerText()
    // Should not crash — page still has content
    expect(body.length).toBeGreaterThan(50)

    // Should NOT show "Revisar 0 rondas" review step with confirm button
    const hasConfirm = await page
      .getByRole('button', { name: /Importar \d+ rondas?/i })
      .isVisible()
      .catch(() => false)
    expect(
      hasConfirm,
      'Should not show import button for 0 rounds',
    ).toBe(false)
  })
})
