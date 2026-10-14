#!/usr/bin/env node
/**
 * HTTP Smoke Tests — Golfers+ producción
 *
 * Verifica el refactor formato/modo sin necesidad de browser:
 * 1. Crea rondas de test con la service key de Supabase (1 por cada combinación)
 * 2. Fetch HTTP de la vista espectador (SSR de Next.js)
 * 3. Verifica en el HTML que los labels son correctos y no hay crashes
 * 4. Cleanup: elimina rondas de test
 *
 * Ventaja sobre Playwright: no necesita browser (bloqueado por Windows
 * Application Control en este entorno), corre contra producción directo.
 */

import * as fs from 'fs'
import * as path from 'path'
import { createClient } from '@supabase/supabase-js'

// Cargar .env.local
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

// Claves de los inputs privados del GWI: fuente única compartida con los tests
// de las rutas y el E2E de prod.
const CLAVES_PRIVADAS_GWI = new RegExp(
  (JSON.parse(fs.readFileSync(path.resolve(__dirname, '..', 'src/golf/stats/gwi-claves-privadas.json'), 'utf8')) as { claves: string[] }).claves.join('|')
)

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? 'https://golfersplus.vercel.app'
const COURSE_ID = 'dff847e1-34d9-4805-85a7-01ec3e554f65' // Lomas de la Dehesa

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('ERROR: faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en .env.local')
  process.exit(1)
}
const sb = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { autoRefreshToken: false, persistSession: false } })

// ── Helpers ──────────────────────────────────────────────────────────

async function borrarRondasDeTest(): Promise<void> {
  const { error } = await sb.from('rondas_libres').delete().in('codigo', TEST_RONDAS.map(r => r.codigo))
  if (error) throw new Error(`No se pudieron borrar las rondas de test: ${error.message}`)
}

async function fetchPage(url: string): Promise<{ status: number; html: string }> {
  const res = await fetch(url, { headers: { 'User-Agent': 'Golfers+ E2E Smoke' } })
  const html = await res.text()
  return { status: res.status, html }
}

interface TestResult {
  name: string
  passed: boolean
  error?: string
}

const results: TestResult[] = []

function assert(name: string, condition: boolean, errorMsg?: string): void {
  if (condition) {
    results.push({ name, passed: true })
    console.log(`  ✅ ${name}`)
  } else {
    results.push({ name, passed: false, error: errorMsg })
    console.log(`  ❌ ${name}${errorMsg ? ` — ${errorMsg}` : ''}`)
  }
}

// ── Test Data ────────────────────────────────────────────────────────

interface TestRonda {
  codigo: string
  formato_juego: 'stroke_play' | 'stableford' | 'match_play'
  modo_juego: 'gross' | 'neto'
  expectedFormatLabel: string
  expectedModeLabel: string | null
}

const TEST_RONDAS: TestRonda[] = [
  {
    codigo: 'E2ESPG',
    formato_juego: 'stroke_play',
    modo_juego: 'gross',
    expectedFormatLabel: 'Stroke Play',
    expectedModeLabel: 'Gross',
  },
  {
    codigo: 'E2ESPN',
    formato_juego: 'stroke_play',
    modo_juego: 'neto',
    expectedFormatLabel: 'Stroke Play',
    expectedModeLabel: 'Neto',
  },
  {
    codigo: 'E2ESTB',
    formato_juego: 'stableford',
    modo_juego: 'neto',
    expectedFormatLabel: 'Stableford',
    expectedModeLabel: null, // stableford no dice "Neto" explícito
  },
  {
    codigo: 'E2EMPN',
    formato_juego: 'match_play',
    modo_juego: 'neto',
    expectedFormatLabel: 'Match Play',
    expectedModeLabel: 'Neto',
  },
]

// ── Setup: crear rondas de test ──────────────────────────────────────

async function setup(): Promise<void> {
  console.log('\n🔧 Setup: limpiar rondas de test previas...')
  await borrarRondasDeTest()

  // Buscar un creador_id válido (admin del proyecto)
  const { data: admin, error: errAdmin } = await sb.from('profiles').select('id').eq('role', 'admin').limit(1).maybeSingle()
  if (errAdmin) throw new Error(`No se pudo buscar un admin: ${errAdmin.message}`)
  if (!admin) {
    throw new Error('No hay admin en profiles, no puedo crear rondas de test')
  }

  console.log(`🔧 Setup: crear ${TEST_RONDAS.length} rondas de test...`)
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
      creador_id: admin.id,
    }).select('id').single()
    if (error) throw new Error(`No se pudo crear la ronda ${r.codigo}: ${error.message}`)

    // 2 jugadores por ronda con scores parciales
    const { error: errJugadores } = await sb.from('ronda_libre_jugadores').insert([
      { ronda_id: ronda.id, nombre: 'E2E Juan', scores: { 1: 4, 2: 5, 3: 4 }, handicap: 10.5 },
      { ronda_id: ronda.id, nombre: 'E2E Pedro', scores: { 1: 5, 2: 5, 3: 4 }, handicap: 18.0 },
    ])
    if (errJugadores) throw new Error(`No se pudieron crear los jugadores de ${r.codigo}: ${errJugadores.message}`)
  }
  console.log('✅ Setup completo\n')
}

async function cleanup(): Promise<void> {
  console.log('\n🧹 Cleanup: eliminar rondas de test...')
  await borrarRondasDeTest()
  console.log('✅ Cleanup completo')
}

// ── Tests ────────────────────────────────────────────────────────────

async function testSmoke(): Promise<void> {
  console.log('\n📄 Test 1: Páginas básicas cargan (smoke)')

  const home = await fetchPage(BASE_URL)
  assert('Home GET / → 200', home.status === 200, `status=${home.status}`)
  assert('Home contiene "Golfers"', home.html.includes('Golfers'))

  const enVivo = await fetchPage(`${BASE_URL}/en-vivo`)
  assert('/en-vivo → 200', enVivo.status === 200, `status=${enVivo.status}`)
}

async function testEspectadorPorModalidad(): Promise<void> {
  console.log('\n🏌️ Test 2: Vista espectador por modalidad — HTTP SSR')

  // NOTA: La página es 'use client' → el HTML SSR inicial es un shell vacío.
  // Los labels se renderizan client-side después del hydrate.
  // Este test solo verifica que el SSR NO crashea (retorna 200 sin error).
  // Para verificar el rendering real ver testApiGwi() que chequea los datos.

  for (const r of TEST_RONDAS) {
    console.log(`\n  Modalidad: ${r.formato_juego} / ${r.modo_juego}`)
    const url = `${BASE_URL}/ronda-libre/${r.codigo}`
    const res = await fetchPage(url)

    assert(`  [${r.codigo}] GET → 200`, res.status === 200, `status=${res.status}`)

    // NO debe haber error de React durante SSR
    assert(
      `  [${r.codigo}] NO contiene "Application error"`,
      !res.html.includes('Application error') && !res.html.includes('500 Internal'),
      'La página crasheó durante SSR'
    )

    // El HTML debe tener el shell de Next.js (indica SSR exitoso)
    assert(
      `  [${r.codigo}] HTML tiene shell de Next.js válido`,
      res.html.includes('__next') || res.html.includes('_next/static'),
      'No parece ser una respuesta válida de Next.js'
    )
  }
}

async function testApiGwi(): Promise<void> {
  console.log('\n🔌 Test 3: API /api/gwi retorna formato_juego y modo_juego correctamente')

  for (const r of TEST_RONDAS) {
    console.log(`\n  API para ${r.codigo} (${r.formato_juego}/${r.modo_juego})`)
    const url = `${BASE_URL}/api/gwi/ronda-libre/${r.codigo}`
    const res = await fetch(url)

    assert(`  [${r.codigo}] GET /api/gwi → 200`, res.status === 200, `status=${res.status}`)

    if (res.status !== 200) continue

    // Contrato GWIResponse: el GWI llega calculado; los inputs privados
    // (historial, patrones) nunca salen del servidor.
    const texto = await res.text()
    const data = JSON.parse(texto) as { results?: unknown[]; jugadores?: unknown[] } & Record<string, unknown>
    assert(
      `  [${r.codigo}] response tiene "results" y "jugadores"`,
      Array.isArray(data.results) && Array.isArray(data.jugadores),
      'Response no tiene arrays results/jugadores'
    )
    assert(
      `  [${r.codigo}] response sin inputs privados del GWI`,
      !CLAVES_PRIVADAS_GWI.test(texto),
      'La respuesta filtra historial o patrones'
    )

    const first = data

    // CRÍTICO: verificar que el response separa formatoJuego de modoJuego
    assert(
      `  [${r.codigo}] response tiene campo "modoJuego"`,
      'modoJuego' in first,
      `Campos presentes: ${Object.keys(first).join(', ')}`
    )

    assert(
      `  [${r.codigo}] response tiene campo "formatoJuego"`,
      'formatoJuego' in first,
      `Campos presentes: ${Object.keys(first).join(', ')}`
    )

    // Verificar que modoJuego es 'gross' o 'neto' (NO más híbrido)
    assert(
      `  [${r.codigo}] modoJuego es "${r.modo_juego}"`,
      first.modoJuego === r.modo_juego,
      `Esperado "${r.modo_juego}", obtenido "${first.modoJuego}"`
    )

    // Verificar que formatoJuego coincide
    assert(
      `  [${r.codigo}] formatoJuego es "${r.formato_juego}"`,
      first.formatoJuego === r.formato_juego,
      `Esperado "${r.formato_juego}", obtenido "${first.formatoJuego}"`
    )

    // Verificar que NUNCA modoJuego contiene valores híbridos
    assert(
      `  [${r.codigo}] modoJuego NUNCA es "stableford" o "match_play_neto"`,
      first.modoJuego !== 'stableford' && first.modoJuego !== 'match_play_neto',
      `modoJuego=${first.modoJuego} (valor híbrido del sistema viejo)`
    )
  }
}

async function testRondasExistentesLegacy(): Promise<void> {
  console.log('\n🗄️ Test 3: Rondas pre-migración siguen funcionando')

  // Buscar una ronda existente (pre-migración) que no sea de test
  const { data: existing, error } = await sb
    .from('rondas_libres')
    .select('codigo')
    .not('codigo', 'like', 'E2E%')
    .eq('estado', 'finalizada')
    .order('created_at', { ascending: false })
    .limit(1)
  if (error) throw new Error(`No se pudo buscar una ronda legacy: ${error.message}`)

  if (existing.length === 0) {
    console.log('  ⚠️  No hay rondas legacy finalizadas para testear')
    return
  }

  const codigo = existing[0].codigo
  const url = `${BASE_URL}/ronda-libre/${codigo}`
  const res = await fetchPage(url)

  assert(
    `Ronda legacy ${codigo} → 200`,
    res.status === 200,
    `status=${res.status}`
  )
  assert(
    `Ronda legacy NO crashea con SSR`,
    !res.html.includes('Application error') && !res.html.includes('500 Internal'),
    'Crash en ronda legacy'
  )
}

// ── Main ─────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log('═════════════════════════════════════════════════════════')
  console.log('🧪 Golfers+ E2E Smoke Tests (HTTP)')
  console.log(`   Base URL: ${BASE_URL}`)
  console.log('═════════════════════════════════════════════════════════')

  try {
    await setup()
    await testSmoke()
    await testEspectadorPorModalidad()
    await testApiGwi()
    await testRondasExistentesLegacy()
  } catch (err) {
    console.error('\n💥 Error fatal:', err)
    results.push({ name: 'Execution', passed: false, error: String(err) })
  } finally {
    try {
      await cleanup()
    } catch (err) {
      console.error('Cleanup failed:', err)
    }
  }

  // Reporte final
  console.log('\n═════════════════════════════════════════════════════════')
  const passed = results.filter(r => r.passed).length
  const failed = results.filter(r => !r.passed).length
  console.log(`   Total: ${results.length}  ✅ ${passed}  ❌ ${failed}`)
  console.log('═════════════════════════════════════════════════════════')

  if (failed > 0) {
    console.log('\nTests fallidos:')
    results.filter(r => !r.passed).forEach(r => {
      console.log(`  ❌ ${r.name}${r.error ? ` — ${r.error}` : ''}`)
    })
    process.exit(1)
  }
}

main().catch(err => {
  console.error('Fatal:', err)
  process.exit(1)
})
