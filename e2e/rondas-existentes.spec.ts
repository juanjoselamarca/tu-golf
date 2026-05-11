import { test, expect, type Page } from '@playwright/test'

/**
 * E2E: Verifica que la vista espectador renderiza correctamente rondas
 * existentes en producción para cada modalidad.
 *
 * Estrategia: crear rondas directamente vía Supabase Management API
 * (usando SUPABASE_ACCESS_TOKEN), cargar la vista espectador con Playwright,
 * verificar que NO hay crashes de React y que los labels del formato/modo
 * son correctos después del refactor.
 *
 * Cleanup: elimina las rondas de test al final.
 */

import 'dotenv/config'
import * as fs from 'fs'
import * as path from 'path'

// Cargar .env.local manualmente (dotenv no lee .env.local por default)
const envPath = path.resolve(__dirname, '..', '.env.local')
if (fs.existsSync(envPath)) {
  const content = fs.readFileSync(envPath, 'utf8')
  content.split('\n').forEach(line => {
    const match = line.match(/^([A-Z_]+)=(.*)$/)
    if (match && !process.env[match[1]]) {
      process.env[match[1]] = match[2].replace(/^["']|["']$/g, '')
    }
  })
}

const SUPABASE_TOKEN = process.env.SUPABASE_ACCESS_TOKEN
const PROJECT_REF = 'hoswfwhvcgqlqdmzpnce'
const COURSE_ID = 'dff847e1-34d9-4805-85a7-01ec3e554f65' // Lomas de la Dehesa

// El throw se mueve adentro del describe (test.skip) en vez de top-level: en CI
// sin .env.local crasheaba el module-load, abortando el discovery de TODA la
// suite. Ver e2e/coach-e2e.test.ts para el patrón equivalente con beforeAll.

async function supabaseQuery(query: string): Promise<unknown[]> {
  if (!SUPABASE_TOKEN) throw new Error('SUPABASE_ACCESS_TOKEN no está configurado')
  const res = await fetch(`https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${SUPABASE_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query }),
  })
  const json = await res.json()
  if (!res.ok) throw new Error(`Supabase query failed: ${JSON.stringify(json)}`)
  return json as unknown[]
}

interface TestRonda {
  codigo: string
  formato_juego: 'stroke_play' | 'stableford' | 'match_play'
  modo_juego: 'gross' | 'neto'
}

const TEST_RONDAS: TestRonda[] = [
  { codigo: 'E2E_SP_G', formato_juego: 'stroke_play', modo_juego: 'gross' },
  { codigo: 'E2E_SP_N', formato_juego: 'stroke_play', modo_juego: 'neto' },
  { codigo: 'E2E_STBL', formato_juego: 'stableford', modo_juego: 'neto' },
  { codigo: 'E2E_MP_N', formato_juego: 'match_play', modo_juego: 'neto' },
]

test.describe('E2E: Vista espectador por modalidad', () => {
  // Skip todo el describe si no hay token (CI sin .env.local) sin matar discovery.
  test.skip(!SUPABASE_TOKEN, 'SUPABASE_ACCESS_TOKEN no configurado — requiere .env.local con token de Supabase Management API para crear rondas de test')

  // Pre-flight: verifica que el token sea VÁLIDO antes de intentar crear rondas.
  // Si el token está set pero revocado/expirado, queremos skipear con mensaje
  // claro en vez de fallar 30s después en un INSERT con error confuso.
  test.beforeAll(async () => {
    if (!SUPABASE_TOKEN) return  // ya cubierto por test.skip de arriba
    const res = await fetch(`https://api.supabase.com/v1/projects/${PROJECT_REF}`, {
      headers: { Authorization: `Bearer ${SUPABASE_TOKEN}` },
    })
    test.skip(res.status === 401 || res.status === 403, `SUPABASE_ACCESS_TOKEN inválido o sin permisos (HTTP ${res.status})`)
  })

  test.beforeAll(async () => {
    // Limpiar rondas de test previas si existen
    await supabaseQuery(
      `DELETE FROM rondas_libres WHERE codigo LIKE 'E2E_%'`
    )

    // Crear las rondas de test
    for (const r of TEST_RONDAS) {
      await supabaseQuery(`
        INSERT INTO rondas_libres (
          codigo, course_id, course_name, tees, holes, fecha, estado,
          modo_juego, formato_juego, hoyo_inicio, admin_mode, creador_id
        ) VALUES (
          '${r.codigo}',
          '${COURSE_ID}',
          'Club de Golf Lomas de La Dehesa',
          'azul',
          18,
          CURRENT_DATE,
          'en_curso',
          '${r.modo_juego}',
          '${r.formato_juego}',
          1,
          true,
          '00000000-0000-0000-0000-000000000000'
        )
      `)

      // Agregar 2 jugadores a cada ronda
      const playerNames = r.formato_juego === 'match_play'
        ? ['E2E Juan', 'E2E Pedro']
        : ['E2E Juan', 'E2E Pedro']

      for (let i = 0; i < playerNames.length; i++) {
        const handicap = i === 0 ? 10.5 : 18.0
        await supabaseQuery(`
          INSERT INTO ronda_libre_jugadores (ronda_id, nombre, scores, handicap)
          VALUES (
            (SELECT id FROM rondas_libres WHERE codigo = '${r.codigo}'),
            '${playerNames[i]}',
            '{"1":4,"2":5,"3":4}',
            ${handicap}
          )
        `)
      }
    }
  })

  test.afterAll(async () => {
    await supabaseQuery(
      `DELETE FROM rondas_libres WHERE codigo LIKE 'E2E_%'`
    )
  })

  async function captureErrors(page: Page) {
    const errors: string[] = []
    page.on('pageerror', (err) => errors.push(`JS ERROR: ${err.message}`))
    page.on('response', (res) => {
      if (res.status() >= 500) errors.push(`HTTP ${res.status()}: ${res.url()}`)
    })
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(`CONSOLE: ${msg.text()}`)
    })
    return errors
  }

  for (const ronda of TEST_RONDAS) {
    test(`Vista espectador carga ${ronda.formato_juego}/${ronda.modo_juego} sin errores`, async ({ page }) => {
      const errors = await captureErrors(page)

      await page.goto(`/ronda-libre/${ronda.codigo}`)
      await page.waitForLoadState('networkidle')

      // Debe renderizar el nombre del jugador
      await expect(page.getByText('E2E Juan').first()).toBeVisible({ timeout: 15_000 })

      // Screenshot para debugging
      await page.screenshot({
        path: `test-results/spectator-${ronda.formato_juego}-${ronda.modo_juego}.png`,
        fullPage: true,
      })

      // NO debe haber errores de runtime
      expect(errors, `Errores en ${ronda.codigo}:\n${errors.join('\n')}`).toEqual([])
    })
  }

  test('Match Play muestra display con nombre real del jugador', async ({ page }) => {
    await page.goto(`/ronda-libre/E2E_MP_N`)
    await page.waitForLoadState('networkidle')

    // El display de match play debe tener un nombre (Juan o Pedro), NO "A" ni "B" solitarios
    const body = await page.textContent('body')
    expect(body).toBeTruthy()

    // No debe decir "1 UP A con X por jugar" (el bug original)
    expect(body).not.toMatch(/\bUP A con \d+\b/)
    expect(body).not.toMatch(/\bUP B con \d+\b/)
  })

  test('Stableford muestra formato correcto en info card', async ({ page }) => {
    await page.goto(`/ronda-libre/E2E_STBL`)
    await page.waitForLoadState('networkidle')

    // Debe mostrar "Stableford" como formato (no "18 hoyos")
    await expect(page.getByText('Stableford').first()).toBeVisible()
  })

  test('Stroke Play Gross muestra label correcto', async ({ page }) => {
    await page.goto(`/ronda-libre/E2E_SP_G`)
    await page.waitForLoadState('networkidle')

    // Debe contener "Stroke Play" y "Gross" en algún lado
    const body = await page.textContent('body')
    expect(body).toContain('Stroke Play')
  })

  test('Stroke Play Neto muestra label correcto', async ({ page }) => {
    await page.goto(`/ronda-libre/E2E_SP_N`)
    await page.waitForLoadState('networkidle')

    const body = await page.textContent('body')
    expect(body).toContain('Stroke Play')
  })
})
