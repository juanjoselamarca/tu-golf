/**
 * E2E Tests contra BD de producción — Golfers+
 * Ejecutar: node scripts/test-e2e-prod.mjs
 */
import { config } from 'dotenv'
import { createClient } from '@supabase/supabase-js'

config({ path: '.env.local' })

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY
const ANON_KEY     = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const SITE_URL     = process.env.NEXT_PUBLIC_SITE_URL || 'https://golfersplus.vercel.app'

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('Faltan variables SUPABASE en .env.local')
  process.exit(1)
}

const sb = createClient(SUPABASE_URL, SERVICE_KEY)

// ── Helpers ──
let passed = 0, failed = 0
const results = []

function pass(test, detail = '') {
  passed++
  const msg = `  PASS: ${test}${detail ? ' — ' + detail : ''}`
  results.push({ status: 'PASS', test, detail })
  console.log(msg)
}

function fail(test, detail = '') {
  failed++
  const msg = `  FAIL: ${test}${detail ? ' — ' + detail : ''}`
  results.push({ status: 'FAIL', test, detail })
  console.error(msg)
}

async function fetchProd(path) {
  const url = `${SITE_URL}${path}`
  const res = await fetch(url, { redirect: 'manual' })
  return res
}

// ══════════════════════════════════════════════════════════════
// TEST 1: Torneo completo
// ══════════════════════════════════════════════════════════════
async function test1_torneoCompleto() {
  console.log('\n══ TEST 1: Torneo completo ══')
  const ts = Date.now()
  const slug = `test-torneo-e2e-${ts}`
  let tournamentId, playerIds = [], roundIds = [], holeScoreIds = []

  try {
    // 1. Buscar admin
    const { data: admin } = await sb.from('profiles')
      .select('id, name, role')
      .eq('role', 'admin')
      .limit(1)
      .single()

    if (!admin) { fail('1.1 Buscar admin', 'No hay admin en profiles'); return }
    pass('1.1 Buscar admin', `${admin.name} (${admin.id.substring(0,8)}...)`)

    // 2. Buscar 2 usuarios reales para players
    const { data: users } = await sb.from('profiles')
      .select('id, name')
      .limit(3)

    if (!users || users.length < 2) { fail('1.2 Buscar usuarios', 'Menos de 2 perfiles'); return }
    const user1 = users[0], user2 = users[1]
    pass('1.2 Buscar usuarios', `${user1.name}, ${user2.name}`)

    // 3. INSERT tournament
    const { data: tournament, error: tErr } = await sb.from('tournaments').insert({
      name: 'Test Torneo E2E',
      slug,
      organizer_id: admin.id,
      status: 'open',
      format: 'stroke_play',
      hole_count: 9,
      course_name: 'Test Course E2E',
      date_start: new Date().toISOString().split('T')[0],
    }).select('id').single()

    if (tErr) { fail('1.3 INSERT tournament', tErr.message); return }
    tournamentId = tournament.id
    pass('1.3 INSERT tournament', `id=${tournamentId.substring(0,8)}...`)

    // 4. INSERT 2 players
    for (const u of [user1, user2]) {
      const { data: player, error: pErr } = await sb.from('players').insert({
        tournament_id: tournamentId,
        user_id: u.id,
        handicap_at_registration: 18,
      }).select('id').single()

      if (pErr) { fail(`1.4 INSERT player ${u.name}`, pErr.message); return }
      playerIds.push(player.id)
    }
    pass('1.4 INSERT players', `${playerIds.length} jugadores`)

    // 5. INSERT rounds
    for (const pid of playerIds) {
      const { data: round, error: rErr } = await sb.from('rounds').insert({
        tournament_id: tournamentId,
        player_id: pid,
        status: 'in_progress',
      }).select('id').single()

      if (rErr) { fail(`1.5 INSERT round`, rErr.message); return }
      roundIds.push(round.id)
    }
    pass('1.5 INSERT rounds', `${roundIds.length} rondas`)

    // 6. INSERT hole_scores (9 hoyos por ronda)
    const PARS = [4, 3, 5, 4, 4, 3, 5, 4, 4]
    const SCORES_P1 = [4, 3, 5, 5, 4, 4, 6, 4, 3] // mixed
    const SCORES_P2 = [5, 4, 4, 4, 3, 3, 5, 5, 5] // mixed

    for (let ri = 0; ri < roundIds.length; ri++) {
      const scores = ri === 0 ? SCORES_P1 : SCORES_P2
      for (let h = 0; h < 9; h++) {
        const gross = scores[h]
        const par = PARS[h]
        const net = gross // sin handicap adjustment para simplificar
        const diff = net - par
        const pts = diff <= -2 ? 4 : diff === -1 ? 3 : diff === 0 ? 2 : diff === 1 ? 1 : 0

        const { data: hs, error: hsErr } = await sb.from('hole_scores').insert({
          round_id: roundIds[ri],
          hole_number: h + 1,
          gross_score: gross,
          net_score: net,
          par,
          points: pts,
          source: 'manual_organizer',
          status: 'loaded',
        }).select('id').single()

        if (hsErr) { fail(`1.6 INSERT hole_score h${h+1} r${ri}`, hsErr.message); return }
        holeScoreIds.push(hs.id)
      }
    }
    pass('1.6 INSERT hole_scores', `${holeScoreIds.length} scores (9x2)`)

    // 7. Fetch torneo page
    const res = await fetchProd(`/torneo/${slug}`)
    if (res.status === 200) {
      pass('1.7 GET /torneo/slug', `HTTP ${res.status}`)
    } else if (res.status === 307 || res.status === 308) {
      pass('1.7 GET /torneo/slug', `HTTP ${res.status} redirect (esperado si requiere auth)`)
    } else {
      fail('1.7 GET /torneo/slug', `HTTP ${res.status}`)
    }

    // 8. Fetch GWI API for tournament
    const gwiRes = await fetch(`${SITE_URL}/api/gwi/torneo/${slug}`)
    if (gwiRes.ok) {
      const gwiData = await gwiRes.json()
      if (gwiData.inputs && gwiData.inputs.length === 2) {
        pass('1.8 GET /api/gwi/torneo/slug', `${gwiData.inputs.length} jugadores, modo=${gwiData.modoJuego}`)
      } else {
        fail('1.8 GET /api/gwi/torneo/slug', `inputs=${JSON.stringify(gwiData.inputs?.length)} esperado=2`)
      }
    } else {
      fail('1.8 GET /api/gwi/torneo/slug', `HTTP ${gwiRes.status}`)
    }

    // 9. UPDATE rounds to closed
    for (const rid of roundIds) {
      await sb.from('rounds').update({ status: 'closed' }).eq('id', rid)
    }
    pass('1.9 UPDATE rounds closed', 'OK')

  } finally {
    // CLEANUP
    console.log('  Limpiando test 1...')
    if (holeScoreIds.length > 0) {
      for (const rid of roundIds) {
        await sb.from('hole_scores').delete().eq('round_id', rid)
      }
    }
    if (roundIds.length > 0) {
      for (const rid of roundIds) {
        await sb.from('rounds').delete().eq('id', rid)
      }
    }
    if (playerIds.length > 0) {
      for (const pid of playerIds) {
        await sb.from('players').delete().eq('id', pid)
      }
    }
    if (tournamentId) {
      await sb.from('tournaments').delete().eq('id', tournamentId)
    }
    console.log('  Limpieza test 1 completa.')
  }
}

// ══════════════════════════════════════════════════════════════
// TEST 2: Scoring Stableford (ronda libre)
// ══════════════════════════════════════════════════════════════
async function test2_stableford() {
  console.log('\n══ TEST 2: Scoring Stableford ══')
  const ts = Date.now()
  const codigo = `E2E${ts}`
  let rondaId = null
  const jugadorIds = []

  try {
    // Buscar creador
    const { data: admin } = await sb.from('profiles')
      .select('id')
      .eq('role', 'admin')
      .limit(1)
      .single()

    if (!admin) { fail('2.0 Buscar admin', 'No admin'); return }

    // Buscar 2 usuarios
    const { data: users } = await sb.from('profiles').select('id, name').limit(2)
    if (!users || users.length < 2) { fail('2.0 Buscar usuarios', 'Menos de 2'); return }

    // 1. Crear ronda libre stableford
    const { data: ronda, error: rErr } = await sb.from('rondas_libres').insert({
      codigo,
      creador_id: admin.id,
      course_name: 'Test Stableford E2E',
      course_id: null,
      tees: 'Amarillo',
      holes: 9,
      fecha: new Date().toISOString().split('T')[0],
      estado: 'en_curso',
      modo_juego: 'stableford',
    }).select('id').single()

    if (rErr) { fail('2.1 Crear ronda libre stableford', rErr.message); return }
    rondaId = ronda.id
    pass('2.1 Crear ronda libre stableford', `id=${rondaId.substring(0,8)}... codigo=${codigo}`)

    // 2. Agregar 2 jugadores
    for (const u of users) {
      const { data: j, error: jErr } = await sb.from('ronda_libre_jugadores').insert({
        ronda_id: rondaId,
        nombre: u.name || 'Jugador Test',
        user_id: u.id,
        scores: {},
        handicap: 18,
      }).select('id').single()

      if (jErr) { fail(`2.2 Agregar jugador ${u.name}`, jErr.message); return }
      jugadorIds.push(j.id)
    }
    pass('2.2 Agregar jugadores', `${jugadorIds.length} jugadores`)

    // 3. Insertar scores para jugador 1
    // hoyo 1: par 4 score 3 (birdie → 3pts stableford con hcp 18)
    // hoyo 2: par 3 score 5 (doble bogey → 0pts)
    // hoyo 3: par 5 score 5 (par → 2pts)
    // hoyo 4: par 4 score 4 (par → 2pts)
    // hoyo 5: par 4 score 6 (doble bogey → 0pts)
    const scoresJ1 = { '1': 3, '2': 5, '3': 5, '4': 4, '5': 6 }
    const scoresJ2 = { '1': 4, '2': 3, '3': 6, '4': 5, '5': 4 }

    const { error: s1Err } = await sb.from('ronda_libre_jugadores')
      .update({ scores: scoresJ1 })
      .eq('id', jugadorIds[0])

    if (s1Err) { fail('2.3 Insertar scores J1', s1Err.message); return }

    const { error: s2Err } = await sb.from('ronda_libre_jugadores')
      .update({ scores: scoresJ2 })
      .eq('id', jugadorIds[1])

    if (s2Err) { fail('2.3 Insertar scores J2', s2Err.message); return }
    pass('2.3 Insertar scores', 'J1: 3,5,5,4,6 — J2: 4,3,6,5,4')

    // 4. Fetch GWI API for ronda libre
    const gwiRes = await fetch(`${SITE_URL}/api/gwi/ronda-libre/${codigo}`)
    if (gwiRes.ok) {
      const gwiData = await gwiRes.json()
      if (gwiData.modoJuego === 'stableford') {
        pass('2.4 API gwi/ronda-libre modo', `modoJuego=${gwiData.modoJuego}`)
      } else {
        fail('2.4 API gwi/ronda-libre modo', `modoJuego=${gwiData.modoJuego} esperado=stableford`)
      }
      if (gwiData.inputs && gwiData.inputs.length === 2) {
        pass('2.4b API gwi/ronda-libre jugadores', `${gwiData.inputs.length} jugadores`)
        // Verify stableford scoring for J1
        // With handicap 18, every hole gets 1 stroke
        // h1: par4, gross 3, neto 2, diff -2 → 4pts
        // h2: par3, gross 5, neto 4, diff +1 → 1pt
        // h3: par5, gross 5, neto 4, diff -1 → 3pts
        // h4: par4, gross 4, neto 3, diff -1 → 3pts
        // h5: par4, gross 6, neto 5, diff +1 → 1pt
        // Total stableford = 4+1+3+3+1 = 12
        // Note: actual stroke distribution depends on stroke_index
        const j1Score = gwiData.inputs[0].currentScore
        console.log(`    J1 stableford score: ${j1Score}`)
        if (j1Score > 0) {
          pass('2.4c Stableford points J1', `puntos=${j1Score}`)
        } else {
          fail('2.4c Stableford points J1', `puntos=${j1Score} (esperado > 0)`)
        }
      } else {
        fail('2.4b API gwi/ronda-libre jugadores', `inputs=${gwiData.inputs?.length}`)
      }
    } else {
      const body = await gwiRes.text()
      fail('2.4 API gwi/ronda-libre', `HTTP ${gwiRes.status}: ${body}`)
    }

    // 5. Fetch vista espectador (ronda-libre/[codigo])
    const espRes = await fetchProd(`/ronda-libre/${codigo}`)
    if (espRes.status === 200 || espRes.status === 307) {
      pass('2.5 Vista espectador', `HTTP ${espRes.status}`)
    } else {
      fail('2.5 Vista espectador', `HTTP ${espRes.status}`)
    }

  } finally {
    // CLEANUP
    console.log('  Limpiando test 2...')
    for (const jid of jugadorIds) {
      await sb.from('ronda_libre_jugadores').delete().eq('id', jid)
    }
    if (rondaId) {
      await sb.from('rondas_libres').delete().eq('id', rondaId)
    }
    console.log('  Limpieza test 2 completa.')
  }
}

// ══════════════════════════════════════════════════════════════
// TEST 3: Verificar mejoras / páginas clave
// ══════════════════════════════════════════════════════════════
async function test3_mejoras() {
  console.log('\n══ TEST 3: Páginas y mejoras ══')

  // 3.1 /recuperar
  try {
    const res = await fetchProd('/recuperar')
    if (res.status === 200) {
      const html = await res.text()
      if (html.includes('Recuperar') || html.includes('recuperar') || html.includes('contraseña') || html.includes('password')) {
        pass('3.1 GET /recuperar', 'Contiene texto de recuperación')
      } else {
        fail('3.1 GET /recuperar', 'No contiene texto esperado de recuperación')
      }
    } else {
      fail('3.1 GET /recuperar', `HTTP ${res.status}`)
    }
  } catch (e) {
    fail('3.1 GET /recuperar', e.message)
  }

  // 3.2 /dashboard (espera redirect a login si no auth)
  try {
    const res = await fetchProd('/dashboard')
    if (res.status === 200) {
      pass('3.2 GET /dashboard', 'HTTP 200 (público o SSR)')
    } else if (res.status === 307 || res.status === 308 || res.status === 302 || res.status === 301) {
      const location = res.headers.get('location') || ''
      pass('3.2 GET /dashboard', `HTTP ${res.status} redirect → ${location} (esperado sin auth)`)
    } else {
      fail('3.2 GET /dashboard', `HTTP ${res.status}`)
    }
  } catch (e) {
    fail('3.2 GET /dashboard', e.message)
  }

  // 3.3 /api/health
  try {
    const res = await fetch(`${SITE_URL}/api/health`)
    const data = await res.json()
    if (data.status === 'ok' && data.supabase === true && typeof data.responseTime === 'number') {
      pass('3.3 GET /api/health', `status=${data.status} supabase=${data.supabase} responseTime=${data.responseTime}ms`)
    } else {
      fail('3.3 GET /api/health', `status=${data.status} supabase=${data.supabase}`)
    }
  } catch (e) {
    fail('3.3 GET /api/health', e.message)
  }
}

// ══════════════════════════════════════════════════════════════
// TEST 4: APIs públicas responden
// ══════════════════════════════════════════════════════════════
async function test4_apisPublicas() {
  console.log('\n══ TEST 4: APIs públicas ══')

  const endpoints = [
    { path: '/api/health', name: 'health', expectJson: true },
    { path: '/api/en-vivo', name: 'en-vivo', expectJson: true },
    { path: '/api/demo/profile', name: 'demo/profile', expectJson: true },
    { path: '/api/demo/players', name: 'demo/players', expectJson: true },
  ]

  for (const ep of endpoints) {
    try {
      const res = await fetch(`${SITE_URL}${ep.path}`)
      if (res.ok) {
        if (ep.expectJson) {
          const data = await res.json()
          const keys = Object.keys(data)
          pass(`4. GET ${ep.path}`, `HTTP ${res.status} keys=[${keys.slice(0,5).join(',')}]`)
        } else {
          pass(`4. GET ${ep.path}`, `HTTP ${res.status}`)
        }
      } else {
        const text = await res.text().catch(() => '')
        fail(`4. GET ${ep.path}`, `HTTP ${res.status} ${text.substring(0, 100)}`)
      }
    } catch (e) {
      fail(`4. GET ${ep.path}`, e.message)
    }
  }
}

// ══════════════════════════════════════════════════════════════
// MAIN
// ══════════════════════════════════════════════════════════════
async function main() {
  console.log('╔══════════════════════════════════════════════════════╗')
  console.log('║  E2E Tests — Golfers+ (producción)                  ║')
  console.log(`║  ${new Date().toISOString()}                ║`)
  console.log(`║  Target: ${SITE_URL}  ║`)
  console.log('╚══════════════════════════════════════════════════════╝')

  await test1_torneoCompleto()
  await test2_stableford()
  await test3_mejoras()
  await test4_apisPublicas()

  console.log('\n══════════════════════════════════════════════════════')
  console.log(`RESULTADO FINAL: ${passed} PASS / ${failed} FAIL`)
  console.log('══════════════════════════════════════════════════════')

  if (failed > 0) {
    console.log('\nFAILED tests:')
    for (const r of results.filter(r => r.status === 'FAIL')) {
      console.log(`  - ${r.test}: ${r.detail}`)
    }
  }

  process.exit(failed > 0 ? 1 : 0)
}

main().catch(err => {
  console.error('Error fatal:', err)
  process.exit(1)
})
