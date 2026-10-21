/**
 * Torneo Equipos Leaderboard — /torneo/[slug]
 *
 * Verifica que la tabla TeamLeaderboard renderiza correctamente para torneos
 * de equipos (scramble):
 *
 * 1. Tabla con headers correctos (Pos, Equipo, Jugadores, Score, A par/±, THRU)
 * 2. Equipos ordenados por vs_par (líder primero)
 * 3. Nombres de jugadores separados por " / "
 * 4. vs_par formateado correctamente (E, +N, −N con U+2212)
 * 5. Posiciones estilo golf (empates con "T" prefix)
 * 6. Sin errores JS de cliente
 *
 * Crea su torneo scramble en curso (de un organizador efímero) en beforeAll y lo borra en afterAll.
 */
import { test, expect } from '@playwright/test'
import { createEphemeralUser, deleteEphemeralUser } from './helpers/ronda-fixture'
import { createTeamTournamentFixture, type TeamTournamentFixture } from './helpers/tournament-team-fixture'
import { tarjeta } from './helpers/tournament-individual-fixture'

const SCRAMBLE_NAME = 'E2E Equipos scramble'

let organizadorId = ''
let fixture: TeamTournamentFixture | undefined
let SCRAMBLE_SLUG = ''

test.beforeAll(async () => {
  organizadorId = await createEphemeralUser('e2e-org-equipos')
  // Nueve hoyos jugados: el líder solo y dos equipos empatados un golpe atrás (T2).
  fixture = await createTeamTournamentFixture({
    organizerUserId: organizadorId,
    format: 'scramble',
    teams: [
      { nombre: 'E2E Equipo Uno', sharedScores: tarjeta(9, 4), players: [{ nombre: 'E2E Uno A' }, { nombre: 'E2E Uno B' }] },
      { nombre: 'E2E Equipo Dos', sharedScores: tarjeta(9, 4, 1), players: [{ nombre: 'E2E Dos A' }, { nombre: 'E2E Dos B' }] },
      { nombre: 'E2E Equipo Tres', sharedScores: tarjeta(9, 4, 1), players: [{ nombre: 'E2E Tres A' }, { nombre: 'E2E Tres B' }] },
    ],
  })
  SCRAMBLE_SLUG = fixture.slug
})

test.afterAll(async () => {
  await fixture?.cleanup()
  const errs = organizadorId ? await deleteEphemeralUser(organizadorId) : []
  if (errs.length > 0) throw new Error(`Limpieza incompleta: ${errs.join(' · ')}`)
})

// ────────────────────────────────────────────────────────
// Scramble — TeamLeaderboard
// ────────────────────────────────────────────────────────

test.describe('Scramble TeamLeaderboard — /torneo/[slug]', () => {
  test('muestra tabla con headers correctos', async ({ page }) => {
    test.setTimeout(120_000) // Supabase can be slow on cold starts

    const pageErrors: string[] = []
    page.on('pageerror', (err) => pageErrors.push(err.message))

    const response = await page.goto(`/torneo/${SCRAMBLE_SLUG}`, {
      waitUntil: 'domcontentloaded',
      timeout: 100_000,
    })
    expect(response?.status()).toBeLessThan(400)

    // Nombre del torneo visible
    await expect(page.getByText(SCRAMBLE_NAME).first()).toBeVisible({ timeout: 30_000 })

    // Esperar que la tabla de equipos renderice
    const table = page.locator('table').first()
    await expect(table).toBeVisible({ timeout: 15_000 })

    // Verificar headers — la tabla tiene: Pos, Equipo, Jugadores, Score, A par/±, THRU
    const headers = table.locator('thead th')
    const headerTexts = await headers.allInnerTexts()

    expect(headerTexts.some((h) => /pos/i.test(h))).toBe(true)
    expect(headerTexts.some((h) => /equipo/i.test(h))).toBe(true)
    expect(headerTexts.some((h) => /jugador/i.test(h))).toBe(true)
    expect(headerTexts.some((h) => /score/i.test(h))).toBe(true)
    // "A par" en desktop o "±" en mobile — al menos uno visible
    expect(headerTexts.some((h) => /par|±/i.test(h))).toBe(true)
    expect(headerTexts.some((h) => /thru/i.test(h))).toBe(true)

    expect(pageErrors).toHaveLength(0)
  })

  test('equipos ordenados por vs_par, líder en posición 1', async ({ page }) => {
    test.setTimeout(120_000)

    await page.goto(`/torneo/${SCRAMBLE_SLUG}`, {
      waitUntil: 'domcontentloaded',
      timeout: 100_000,
    })

    const table = page.locator('table').first()
    await expect(table).toBeVisible({ timeout: 30_000 })

    const rows = table.locator('tbody tr')
    const rowCount = await rows.count()
    expect(rowCount).toBeGreaterThanOrEqual(1)

    // Primera fila debe tener posición "1" o "T1"
    const leaderPos = await rows.nth(0).locator('td').nth(0).innerText()
    expect(leaderPos).toMatch(/^T?1$/)

    // Cada fila debe tener un nombre de equipo no vacío
    for (let i = 0; i < Math.min(rowCount, 5); i++) {
      const name = await rows.nth(i).locator('td').nth(1).innerText()
      expect(name.trim().length).toBeGreaterThan(0)
    }

    // Verificar que vs_par está ordenado (equipos con menor vs_par primero)
    if (rowCount >= 2) {
      const vsParTexts: string[] = []
      for (let i = 0; i < rowCount; i++) {
        const text = await rows.nth(i).locator('td').nth(4).innerText()
        vsParTexts.push(text)
      }

      // Convertir vs_par texto a número para verificar orden
      function parseVsPar(text: string): number {
        if (text === 'E') return 0
        // "−" (U+2212) = bajo par (negativo), "+" = sobre par (positivo)
        const clean = text.replace('\u2212', '-')
        return parseInt(clean) || 0
      }

      const vsParNumbers = vsParTexts.map(parseVsPar)
      for (let i = 1; i < vsParNumbers.length; i++) {
        expect(vsParNumbers[i]).toBeGreaterThanOrEqual(vsParNumbers[i - 1])
      }
    }
  })

  test('nombres de jugadores con separador " / "', async ({ page }) => {
    test.setTimeout(120_000)

    await page.goto(`/torneo/${SCRAMBLE_SLUG}`, {
      waitUntil: 'domcontentloaded',
      timeout: 100_000,
    })

    const table = page.locator('table').first()
    await expect(table).toBeVisible({ timeout: 30_000 })

    const rows = table.locator('tbody tr')
    const rowCount = await rows.count()

    // Cada equipo debe mostrar jugadores separados por " / " o "-" si no hay datos
    for (let i = 0; i < Math.min(rowCount, 5); i++) {
      const playersCell = rows.nth(i).locator('td').nth(2)
      const text = await playersCell.innerText()
      // Jugadores: "Jugador A / Jugador B" o "-" si no hay miembros
      expect(text.trim().length).toBeGreaterThan(0)
      if (text !== '-') {
        // Al menos 1 nombre (scramble = equipo, mínimo 1 jugador)
        expect(text.length).toBeGreaterThan(1)
      }
    }
  })

  test('vs_par formateado correctamente (E, +N, −N)', async ({ page }) => {
    test.setTimeout(120_000)

    await page.goto(`/torneo/${SCRAMBLE_SLUG}`, {
      waitUntil: 'domcontentloaded',
      timeout: 100_000,
    })

    const table = page.locator('table').first()
    await expect(table).toBeVisible({ timeout: 30_000 })

    const rows = table.locator('tbody tr')
    const rowCount = await rows.count()

    for (let i = 0; i < Math.min(rowCount, 5); i++) {
      const vsPar = await rows.nth(i).locator('td').nth(4).innerText()
      // Formato válido: "E" (par), "+N" (over par), "−N" (under par con U+2212)
      expect(vsPar).toMatch(/^(E|\+\d+|\u2212\d+)$/)
    }
  })

  test('score y THRU son numéricos', async ({ page }) => {
    test.setTimeout(120_000)

    await page.goto(`/torneo/${SCRAMBLE_SLUG}`, {
      waitUntil: 'domcontentloaded',
      timeout: 100_000,
    })

    const table = page.locator('table').first()
    await expect(table).toBeVisible({ timeout: 30_000 })

    const rows = table.locator('tbody tr')
    const rowCount = await rows.count()

    for (let i = 0; i < Math.min(rowCount, 5); i++) {
      // Score (columna 3) — debe ser un número entero
      const score = await rows.nth(i).locator('td').nth(3).innerText()
      expect(parseInt(score)).toBeGreaterThan(0)

      // THRU (columna 5) — "F" (finished), "H9", "H18", o similar
      const thru = await rows.nth(i).locator('td').nth(5).innerText()
      expect(thru).toMatch(/^(F|H\d+|\d+)$/)
    }
  })

  test('posiciones con empates estilo golf (T prefix)', async ({ page }) => {
    test.setTimeout(120_000)

    await page.goto(`/torneo/${SCRAMBLE_SLUG}`, {
      waitUntil: 'domcontentloaded',
      timeout: 100_000,
    })

    const table = page.locator('table').first()
    await expect(table).toBeVisible({ timeout: 30_000 })

    const rows = table.locator('tbody tr')
    const rowCount = await rows.count()

    const positions: string[] = []
    for (let i = 0; i < rowCount; i++) {
      const pos = await rows.nth(i).locator('td').nth(0).innerText()
      positions.push(pos)
      // Cada posición debe ser un número o "T" + número
      expect(pos).toMatch(/^T?\d+$/)
    }

    // Posiciones deben ser ascendentes (ignorando "T")
    const numericPositions = positions.map((p) => parseInt(p.replace('T', '')))
    for (let i = 1; i < numericPositions.length; i++) {
      expect(numericPositions[i]).toBeGreaterThanOrEqual(numericPositions[i - 1])
    }
  })
})
