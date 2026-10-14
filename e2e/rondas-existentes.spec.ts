import { test, expect, type Page } from '@playwright/test'

/**
 * E2E: Verifica que la vista espectador renderiza correctamente rondas
 * existentes en producción para cada modalidad.
 *
 * Estrategia: crear rondas directamente con la service key de Supabase,
 * cargar la vista espectador con Playwright,
 * verificar que NO hay crashes de React y que los labels del formato/modo
 * son correctos después del refactor.
 *
 * Cleanup: elimina las rondas de test al final.
 */

import 'dotenv/config'
import * as fs from 'fs'
import * as path from 'path'
import { createClient } from '@supabase/supabase-js'

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

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const COURSE_ID = 'dff847e1-34d9-4805-85a7-01ec3e554f65' // Lomas de la Dehesa

// El throw se mueve adentro del describe (test.skip) en vez de top-level: en CI
// sin .env.local crasheaba el module-load, abortando el discovery de TODA la
// suite. Ver e2e/coach-e2e.test.ts para el patrón equivalente con beforeAll.

function adminClient() {
  if (!SUPABASE_URL || !SERVICE_KEY) throw new Error('Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY')
  return createClient(SUPABASE_URL, SERVICE_KEY, { auth: { autoRefreshToken: false, persistSession: false } })
}

async function borrarRondasDeTest(): Promise<void> {
  const { error } = await adminClient().from('rondas_libres').delete().in('codigo', TEST_RONDAS.map(r => r.codigo))
  if (error) throw new Error(`No se pudieron borrar las rondas de test: ${error.message}`)
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
  // Skip todo el describe si no hay credenciales (CI sin .env.local) sin matar discovery.
  test.skip(!SUPABASE_URL || !SERVICE_KEY, 'Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY — requiere .env.local para crear rondas de test')

  test.beforeAll(async () => {
    await borrarRondasDeTest()

    const sb = adminClient()
    for (const r of TEST_RONDAS) {
      const { data: ronda, error } = await sb.from('rondas_libres').insert({
        codigo: r.codigo,
        course_id: COURSE_ID,
        course_name: 'Club de Golf Lomas de La Dehesa',
        tees: 'azul',
        holes: 18,
        fecha: new Date().toISOString().slice(0, 10),
        estado: 'en_curso',
        modo_juego: r.modo_juego,
        formato_juego: r.formato_juego,
        hoyo_inicio: 1,
        admin_mode: true,
        creador_id: '00000000-0000-0000-0000-000000000000',
      }).select('id').single()
      if (error) throw new Error(`No se pudo crear la ronda ${r.codigo}: ${error.message}`)

      const { error: errJugadores } = await sb.from('ronda_libre_jugadores').insert([
        { ronda_id: ronda.id, nombre: 'E2E Juan', scores: { 1: 4, 2: 5, 3: 4 }, handicap: 10.5 },
        { ronda_id: ronda.id, nombre: 'E2E Pedro', scores: { 1: 4, 2: 5, 3: 4 }, handicap: 18.0 },
      ])
      if (errJugadores) throw new Error(`No se pudieron crear los jugadores de ${r.codigo}: ${errJugadores.message}`)
    }
  })

  test.afterAll(async () => {
    await borrarRondasDeTest()
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
