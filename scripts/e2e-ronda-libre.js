/**
 * E2E Test — Ronda Libre completa contra BD de producción
 *
 * Flujo: crear ronda → agregar jugadores → scoring → verificar APIs → limpiar
 *
 * USO: node scripts/e2e-ronda-libre.js
 */

require('dotenv').config({ path: '.env.local' })
const { createClient } = require('@supabase/supabase-js')

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://golfersplus.vercel.app'

// Admin client (bypasses RLS)
const admin = createClient(SUPABASE_URL, SERVICE_KEY)
// Anon client (respects RLS, no auth)
const anon = createClient(SUPABASE_URL, ANON_KEY)

const TIMESTAMP = Date.now()
const CODIGO = `TEST-E2E-${TIMESTAMP}`

const results = []
let rondaId = null
let jugadorIds = []
let creadorId = null
let otroUserId = null

function report(step, pass, detail) {
  const status = pass ? 'PASS' : 'FAIL'
  results.push({ step, status, detail })
  console.log(`  [${status}] ${step}: ${detail}`)
}

async function run() {
  console.log(`\n========================================`)
  console.log(`  E2E Test — Ronda Libre`)
  console.log(`  Codigo: ${CODIGO}`)
  console.log(`  Timestamp: ${new Date().toISOString()}`)
  console.log(`========================================\n`)

  try {
    // ── PASO 1: Buscar usuarios reales ──────────────────────────
    console.log('--- Paso 1: Buscar usuarios reales ---')
    const { data: profiles, error: profErr } = await admin
      .from('profiles')
      .select('id, name, email')
      .limit(10)

    if (profErr || !profiles?.length) {
      report('1. Buscar usuarios', false, `No se encontraron perfiles: ${profErr?.message}`)
      return
    }

    // Buscar admin por email
    const adminProfile = profiles.find(p => p.email === 'juanjoselamarca@gmail.com') || profiles[0]
    creadorId = adminProfile.id
    otroUserId = profiles.find(p => p.id !== creadorId)?.id || null

    report('1. Buscar usuarios', true,
      `Creador: ${adminProfile.name || adminProfile.email} (${creadorId.slice(0,8)}...) | ` +
      `Otro: ${otroUserId ? otroUserId.slice(0,8) + '...' : 'N/A'} | Total perfiles: ${profiles.length}`)

    // ── PASO 2: Crear ronda libre ───────────────────────────────
    console.log('\n--- Paso 2: Crear ronda libre ---')
    const hoy = new Date().toISOString().split('T')[0]
    const { data: ronda, error: rondaErr } = await admin
      .from('rondas_libres')
      .insert({
        codigo: CODIGO,
        creador_id: creadorId,
        course_name: 'Test Course E2E',
        holes: 9,
        fecha: hoy,
        estado: 'en_curso',
        tees: 'blanco',
        modo_juego: 'gross',
        hoyo_inicio: 1,
      })
      .select('id, codigo, estado')
      .single()

    if (rondaErr || !ronda) {
      report('2. Crear ronda', false, `Error: ${rondaErr?.message}`)
      return
    }
    rondaId = ronda.id
    report('2. Crear ronda', true, `ID: ${rondaId.slice(0,8)}... | Codigo: ${ronda.codigo} | Estado: ${ronda.estado}`)

    // ── PASO 3: Agregar 3 jugadores ─────────────────────────────
    console.log('\n--- Paso 3: Agregar jugadores ---')
    const jugadoresInsert = [
      { ronda_id: rondaId, nombre: 'Jugador E2E 1 (creador)', user_id: creadorId, is_guest: false },
      { ronda_id: rondaId, nombre: 'Jugador E2E 2', user_id: otroUserId, is_guest: !otroUserId },
      { ronda_id: rondaId, nombre: 'Invitado E2E 3', user_id: null, is_guest: true },
    ]

    const { data: jugadores, error: jugErr } = await admin
      .from('ronda_libre_jugadores')
      .insert(jugadoresInsert)
      .select('id, nombre, user_id, is_guest')

    if (jugErr || !jugadores?.length) {
      report('3. Agregar jugadores', false, `Error: ${jugErr?.message}`)
      return
    }
    jugadorIds = jugadores.map(j => j.id)
    report('3. Agregar jugadores', true,
      jugadores.map(j => `${j.nombre} (guest=${j.is_guest})`).join(' | '))

    // ── PASO 4: Simular scoring ─────────────────────────────────
    console.log('\n--- Paso 4: Simular scoring ---')

    // Jugador 1: 9 hoyos completos (variado: par, birdie, bogey)
    const scores1 = { '1': 4, '2': 3, '3': 5, '4': 4, '5': 3, '6': 5, '7': 4, '8': 6, '9': 4 }
    // Jugador 2: 9 hoyos completos (diferentes)
    const scores2 = { '1': 5, '2': 4, '3': 4, '4': 5, '5': 4, '6': 4, '7': 5, '8': 4, '9': 3 }
    // Jugador 3: solo 5 hoyos (incompleto)
    const scores3 = { '1': 5, '2': 5, '3': 6, '4': 4, '5': 5 }

    const scoreUpdates = [
      admin.from('ronda_libre_jugadores').update({ scores: scores1 }).eq('id', jugadorIds[0]),
      admin.from('ronda_libre_jugadores').update({ scores: scores2 }).eq('id', jugadorIds[1]),
      admin.from('ronda_libre_jugadores').update({ scores: scores3 }).eq('id', jugadorIds[2]),
    ]

    const scoreResults = await Promise.all(scoreUpdates)
    const scoreErrors = scoreResults.filter(r => r.error)

    if (scoreErrors.length > 0) {
      report('4. Scoring', false, `${scoreErrors.length} errores: ${scoreErrors.map(e => e.error.message).join(', ')}`)
    } else {
      // Verificar que los scores se guardaron correctamente
      const { data: verify } = await admin
        .from('ronda_libre_jugadores')
        .select('id, nombre, scores')
        .eq('ronda_id', rondaId)
        .order('created_at')

      const j1Scores = Object.keys(verify[0]?.scores || {}).length
      const j2Scores = Object.keys(verify[1]?.scores || {}).length
      const j3Scores = Object.keys(verify[2]?.scores || {}).length

      const totalJ1 = Object.values(scores1).reduce((a, b) => a + b, 0)
      const totalJ2 = Object.values(scores2).reduce((a, b) => a + b, 0)

      report('4. Scoring', j1Scores === 9 && j2Scores === 9 && j3Scores === 5,
        `J1: ${j1Scores}/9 hoyos (total ${totalJ1}) | J2: ${j2Scores}/9 hoyos (total ${totalJ2}) | J3: ${j3Scores}/5 hoyos (incompleto)`)
    }

    // ── PASO 5: Verificar API /en-vivo ──────────────────────────
    console.log('\n--- Paso 5: Verificar /api/en-vivo ---')
    try {
      const enVivoRes = await fetch(`${SITE_URL}/api/en-vivo`)
      const enVivoData = await enVivoRes.json()

      const nuestraRonda = enVivoData.rondas?.find(r => r.codigo === CODIGO)

      if (enVivoRes.ok && nuestraRonda) {
        report('5. API /en-vivo', true,
          `HTTP ${enVivoRes.status} | Ronda encontrada | ` +
          `${nuestraRonda.totalJugadores} jugadores | maxHoles: ${nuestraRonda.maxHolesCompleted}`)
      } else if (enVivoRes.ok) {
        report('5. API /en-vivo', false,
          `HTTP ${enVivoRes.status} pero ronda ${CODIGO} NO encontrada entre ${enVivoData.total} rondas activas`)
      } else {
        report('5. API /en-vivo', false, `HTTP ${enVivoRes.status}: ${JSON.stringify(enVivoData)}`)
      }
    } catch (e) {
      report('5. API /en-vivo', false, `Fetch error: ${e.message}`)
    }

    // ── PASO 6: Verificar vista espectador ──────────────────────
    console.log('\n--- Paso 6: Verificar vista espectador ---')
    try {
      const specRes = await fetch(`${SITE_URL}/ronda-libre/${CODIGO}`)
      // Next.js SSR puede devolver 200 con la página renderizada
      report('6. Vista espectador', specRes.ok,
        `HTTP ${specRes.status} | URL: ${SITE_URL}/ronda-libre/${CODIGO}`)
    } catch (e) {
      report('6. Vista espectador', false, `Fetch error: ${e.message}`)
    }

    // ── PASO 7: Verificar GWI ───────────────────────────────────
    console.log('\n--- Paso 7: Verificar GWI ---')
    try {
      const gwiRes = await fetch(`${SITE_URL}/api/gwi/ronda-libre/${CODIGO}`)
      const gwiData = await gwiRes.json()

      if (gwiRes.ok && gwiData.inputs) {
        const jugCount = gwiData.inputs.length
        const holesInfo = gwiData.inputs.map(j => `${j.nombre}: ${j.hoyosCompletados}h`).join(', ')
        report('7. GWI', true,
          `HTTP ${gwiRes.status} | ${jugCount} jugadores | modo: ${gwiData.modoJuego} | ${holesInfo}`)
      } else {
        report('7. GWI', false, `HTTP ${gwiRes.status}: ${JSON.stringify(gwiData).slice(0, 200)}`)
      }
    } catch (e) {
      report('7. GWI', false, `Fetch error: ${e.message}`)
    }

    // ── PASO 8: Test RLS — anon no debe poder actualizar scores ─
    console.log('\n--- Paso 8: Test RLS (anon client) ---')
    // El cliente anon NO tiene sesión de usuario autenticada
    // Intentar UPDATE en un jugador invitado debería fallar por RLS
    const { data: rlsData, error: rlsErr } = await anon
      .from('ronda_libre_jugadores')
      .update({ scores: { '1': 99 } })
      .eq('id', jugadorIds[2])
      .select()

    // RLS debería bloquear esto: el update devuelve 0 rows o error
    const rlsBlocked = rlsErr || !rlsData || rlsData.length === 0

    if (rlsBlocked) {
      report('8. RLS (anon update)', true,
        `Bloqueado correctamente | Error: ${rlsErr?.message || 'No rows returned (RLS filtered)'}`)
    } else {
      report('8. RLS (anon update)', false,
        `RLS NO bloqueó el update! Data: ${JSON.stringify(rlsData)}`)
      // Revertir el score corrupto
      await admin.from('ronda_libre_jugadores')
        .update({ scores: { '1': 5, '2': 5, '3': 6, '4': 4, '5': 5 } })
        .eq('id', jugadorIds[2])
    }

    // Verificar que anon SÍ puede leer (SELECT es public)
    const { data: rlsRead, error: rlsReadErr } = await anon
      .from('rondas_libres')
      .select('id, codigo')
      .eq('codigo', CODIGO)
      .single()

    report('8b. RLS (anon read)', !!rlsRead && !rlsReadErr,
      rlsRead ? `Lectura OK: ${rlsRead.codigo}` : `Error: ${rlsReadErr?.message}`)

    // ── PASO 9: Finalizar ronda ─────────────────────────────────
    console.log('\n--- Paso 9: Finalizar ronda ---')
    const { data: finalizada, error: finErr } = await admin
      .from('rondas_libres')
      .update({ estado: 'finalizada' })
      .eq('id', rondaId)
      .select('id, estado')
      .single()

    if (finErr || finalizada?.estado !== 'finalizada') {
      report('9. Finalizar ronda', false, `Error: ${finErr?.message || 'Estado incorrecto'}`)
    } else {
      report('9. Finalizar ronda', true, `Estado: ${finalizada.estado}`)
    }

    // Verificar que ya NO aparece en /en-vivo (solo muestra en_curso)
    try {
      const enVivo2 = await fetch(`${SITE_URL}/api/en-vivo`)
      const data2 = await enVivo2.json()
      const yaNoAparece = !data2.rondas?.find(r => r.codigo === CODIGO)
      report('9b. No aparece en /en-vivo tras finalizar', yaNoAparece,
        yaNoAparece ? 'Correctamente eliminada del live feed' : 'SIGUE apareciendo en /en-vivo!')
    } catch (e) {
      report('9b. No aparece en /en-vivo', false, `Fetch error: ${e.message}`)
    }

  } finally {
    // ── PASO 10: LIMPIAR ────────────────────────────────────────
    console.log('\n--- Paso 10: Limpieza ---')
    let cleanOk = true

    if (jugadorIds.length > 0) {
      const { error: delJug } = await admin
        .from('ronda_libre_jugadores')
        .delete()
        .in('id', jugadorIds)
      if (delJug) {
        console.log(`  [WARN] Error borrando jugadores: ${delJug.message}`)
        cleanOk = false
      }
    }

    if (rondaId) {
      const { error: delRonda } = await admin
        .from('rondas_libres')
        .delete()
        .eq('id', rondaId)
      if (delRonda) {
        console.log(`  [WARN] Error borrando ronda: ${delRonda.message}`)
        cleanOk = false
      }
    }

    // Verificar que realmente se borró
    if (rondaId) {
      const { data: check } = await admin
        .from('rondas_libres')
        .select('id')
        .eq('id', rondaId)
        .maybeSingle()

      if (check) {
        report('10. Limpieza', false, 'La ronda SIGUE existiendo en la BD!')
        cleanOk = false
      } else {
        report('10. Limpieza', cleanOk, 'Ronda y jugadores eliminados correctamente')
      }
    } else {
      report('10. Limpieza', true, 'Nada que limpiar (ronda no fue creada)')
    }

    // ── RESUMEN FINAL ──────────────────────────────────────────
    console.log('\n========================================')
    console.log('  RESUMEN E2E TEST')
    console.log('========================================')
    const passed = results.filter(r => r.status === 'PASS').length
    const failed = results.filter(r => r.status === 'FAIL').length
    console.log(`  Total: ${results.length} | PASS: ${passed} | FAIL: ${failed}`)
    console.log('')
    for (const r of results) {
      const icon = r.status === 'PASS' ? '+' : 'X'
      console.log(`  [${icon}] ${r.step}`)
    }
    console.log('========================================\n')

    if (failed > 0) {
      process.exit(1)
    }
  }
}

run().catch(err => {
  console.error('FATAL ERROR:', err)
  process.exit(2)
})
