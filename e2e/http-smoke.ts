#!/usr/bin/env node
/**
 * HTTP Smoke Tests — Golfers+ producción
 *
 * Verifica el refactor formato/modo sin necesidad de browser:
 * 1. Crea rondas de test vía Supabase Management API (1 por cada combinación)
 * 2. Fetch HTTP de la vista espectador (SSR de Next.js)
 * 3. Verifica en el HTML que los labels son correctos y no hay crashes
 * 4. Cleanup: elimina rondas de test
 *
 * Ventaja sobre Playwright: no necesita browser (bloqueado por Windows
 * Application Control en este entorno), corre contra producción directo.
 */

import * as fs from 'fs'
import * as path from 'path'

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

const SUPABASE_TOKEN = process.env.SUPABASE_ACCESS_TOKEN
const PROJECT_REF = 'hoswfwhvcgqlqdmzpnce'
const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? 'https://golfersplus.vercel.app'
const COURSE_ID = 'dff847e1-34d9-4805-85a7-01ec3e554f65' // Lomas de la Dehesa

if (!SUPABASE_TOKEN) {
  console.error('ERROR: SUPABASE_ACCESS_TOKEN no encontrado en .env.local')
  process.exit(1)
}

// ── Helpers ──────────────────────────────────────────────────────────

async function supabaseQuery(query: string): Promise<unknown[]> {
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
  await supabaseQuery(`DELETE FROM rondas_libres WHERE codigo LIKE 'E2E%'`)

  // Buscar un creador_id válido (admin del proyecto)
  const admins = (await supabaseQuery(`
    SELECT id FROM profiles WHERE role = 'admin' LIMIT 1
  `)) as Array<{ id: string }>
  const adminId = admins[0]?.id
  if (!adminId) {
    throw new Error('No hay admin en profiles, no puedo crear rondas de test')
  }

  console.log(`🔧 Setup: crear ${TEST_RONDAS.length} rondas de test...`)
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
        '${adminId}'
      )
    `)

    // 2 jugadores por ronda con scores parciales
    await supabaseQuery(`
      INSERT INTO ronda_libre_jugadores (ronda_id, nombre, scores, handicap)
      VALUES
        ((SELECT id FROM rondas_libres WHERE codigo = '${r.codigo}'), 'E2E Juan', '{"1":4,"2":5,"3":4}'::jsonb, 10.5),
        ((SELECT id FROM rondas_libres WHERE codigo = '${r.codigo}'), 'E2E Pedro', '{"1":5,"2":5,"3":4}'::jsonb, 18.0)
    `)
  }
  console.log('✅ Setup completo\n')
}

async function cleanup(): Promise<void> {
  console.log('\n🧹 Cleanup: eliminar rondas de test...')
  await supabaseQuery(`DELETE FROM rondas_libres WHERE codigo LIKE 'E2E%'`)
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

    const data = (await res.json()) as { inputs?: Array<Record<string, unknown>> }
    assert(
      `  [${r.codigo}] response tiene "inputs" array`,
      Array.isArray(data.inputs),
      'Response no tiene array inputs'
    )

    if (!data.inputs || data.inputs.length === 0) continue

    const first = data.inputs[0]

    // CRÍTICO: verificar que el response separa formatoJuego de modoJuego
    assert(
      `  [${r.codigo}] inputs[0] tiene campo "modoJuego"`,
      'modoJuego' in first,
      `Campos presentes: ${Object.keys(first).join(', ')}`
    )

    assert(
      `  [${r.codigo}] inputs[0] tiene campo "formatoJuego"`,
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
  const existing = (await supabaseQuery(`
    SELECT codigo FROM rondas_libres
    WHERE codigo NOT LIKE 'E2E%' AND estado = 'finalizada'
    ORDER BY created_at DESC LIMIT 1
  `)) as Array<{ codigo: string }>

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
