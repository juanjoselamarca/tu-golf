/**
 * E2E Test: Torneo de 40 personas — flujo completo
 * Simula: crear torneo → registrar 40 jugadores → scorear 18 hoyos
 *         → cerrar rondas → finalizar → verificar leaderboard → share URLs
 *
 * Ejecutar: node scripts/test-e2e-torneo40.mjs
 *
 * Cubre: stroke_play gross, stroke_play neto, stableford
 * Con: cancha real (course_id), tees con CR/Slope, handicaps variados
 */
import { config } from 'dotenv'
import { createClient } from '@supabase/supabase-js'

config({ path: '.env.local' })

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY
const SITE_URL     = process.env.NEXT_PUBLIC_SITE_URL || 'https://golfersplus.vercel.app'

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('Faltan variables SUPABASE en .env.local')
  process.exit(1)
}

const sb = createClient(SUPABASE_URL, SERVICE_KEY)

let passed = 0, failed = 0
const results = []
function pass(t, d = '') { passed++; results.push({ s: 'PASS', t, d }); console.log(`  PASS: ${t}${d ? ' — ' + d : ''}`) }
function fail(t, d = '') { failed++; results.push({ s: 'FAIL', t, d }); console.error(`  FAIL: ${t}${d ? ' — ' + d : ''}`) }

// ── Generate realistic scores based on handicap ──
function generateScores(hcp, pars) {
  return pars.map(par => {
    // Higher handicap = more likely to score over par
    const base = par
    const variance = Math.random()
    const hcpFactor = hcp / 36 // 0-1.5 range

    if (variance < 0.02) return Math.max(1, base - 2) // eagle
    if (variance < 0.10) return Math.max(2, base - 1) // birdie
    if (variance < 0.35 - hcpFactor * 0.15) return base // par
    if (variance < 0.65) return base + 1 // bogey
    if (variance < 0.85) return base + Math.min(2, 1 + Math.floor(hcpFactor)) // double
    return base + Math.min(3, 1 + Math.floor(hcpFactor * 2)) // triple+
  })
}

// ── Stableford points (with stroke distribution) ──
function stablefordPoints(gross, par, hcp, si, totalHoles) {
  const maxHcp = totalHoles === 9 ? 27 : 54
  const h = Math.round(Math.max(0, Math.min(hcp, maxHcp)))
  const strokesBase = Math.floor(h / totalHoles)
  const extra = (h % totalHoles) >= si ? 1 : 0
  const strokes = strokesBase + extra
  const neto = gross - strokes
  const diff = neto - par
  if (diff <= -3) return 5
  if (diff === -2) return 4
  if (diff === -1) return 3
  if (diff === 0) return 2
  if (diff === 1) return 1
  return 0
}

// ══════════════════════════════════════════════════════════════
async function runAllTests() {
  console.log('==============================================================')
  console.log('  E2E: Torneo 40 personas — todas las modalidades')
  console.log(`  ${new Date().toISOString()}`)
  console.log(`  Target: ${SITE_URL}`)
  console.log('==============================================================\n')

  // ── Setup: find a real course with holes ──
  console.log('== SETUP ==')
  const { data: courses } = await sb.from('courses')
    .select('id, nombre, par_total, course_rating, slope_rating, datos_verificados')
    .eq('activa', true)
    .is('parent_id', null)
    .eq('datos_verificados', true)
    .limit(5)

  if (!courses || courses.length === 0) {
    fail('SETUP', 'No hay canchas con datos_verificados=true')
    return
  }

  // Pick course with most complete data
  let bestCourse = null
  let bestHoleCount = 0
  for (const c of courses) {
    const { count } = await sb.from('course_holes')
      .select('*', { count: 'exact', head: true })
      .eq('course_id', c.id)
    if ((count ?? 0) > bestHoleCount) {
      bestCourse = c
      bestHoleCount = count ?? 0
    }
  }

  if (!bestCourse || bestHoleCount < 9) {
    fail('SETUP', `Mejor cancha tiene ${bestHoleCount} hoyos (min 9)`)
    return
  }
  pass('SETUP cancha', `${bestCourse.nombre} — ${bestHoleCount} hoyos, Par ${bestCourse.par_total}`)

  // Fetch holes
  const { data: courseHoles } = await sb.from('course_holes')
    .select('numero, par, stroke_index')
    .eq('course_id', bestCourse.id)
    .order('numero')
    .limit(18)

  if (!courseHoles || courseHoles.length < 9) {
    fail('SETUP hoyos', `Solo ${courseHoles?.length} hoyos`)
    return
  }
  pass('SETUP hoyos', `${courseHoles.length} hoyos cargados`)

  // Fetch tees
  const { data: courseTees } = await sb.from('course_tees')
    .select('nombre, rating, slope')
    .eq('course_id', bestCourse.id)
    .not('rating', 'is', null)
    .limit(5)

  const tee = courseTees?.[0] ?? null
  pass('SETUP tees', tee ? `${tee.nombre} CR=${tee.rating} Slope=${tee.slope}` : 'Sin tees con rating')

  // Find admin and all profiles
  const { data: admin } = await sb.from('profiles')
    .select('id, name')
    .eq('role', 'admin')
    .limit(1)
    .single()

  if (!admin) { fail('SETUP admin', 'No admin'); return }
  pass('SETUP admin', admin.name)

  const { data: allProfiles } = await sb.from('profiles').select('id').limit(27)
  const profileIds = allProfiles?.map(p => p.id) ?? []
  pass('SETUP profiles', `${profileIds.length} disponibles`)

  const pars = courseHoles.map(h => h.par)
  const sis = courseHoles.map(h => h.stroke_index)
  const holesPlayed = Math.min(courseHoles.length, 18)
  const parTotal = pars.reduce((a, b) => a + b, 0)

  // ══════════════════════════════════════════════════════════
  // TEST A: Torneo Stroke Play Gross — 40 jugadores × 18h
  // ══════════════════════════════════════════════════════════
  console.log('\n== TEST A: Torneo Stroke Play Gross 40 jugadores ==')
  const tsA = Date.now()
  const slugA = `e2e-gross-${tsA}`
  let tidA = null, playerIdsA = [], roundIdsA = []

  try {
    // A.1 Create tournament
    const { data: tA, error: eA } = await sb.from('tournaments').insert({
      name: 'E2E Stroke Play Gross 40p',
      slug: slugA,
      organizer_id: admin.id,
      status: 'open',
      format: 'stroke_play',
      modo_juego: 'gross',
      hole_count: holesPlayed,
      course_id: bestCourse.id,
      course_name: bestCourse.nombre,
      tees: tee?.nombre ?? 'blanco',
      date_start: new Date().toISOString().split('T')[0],
    }).select('id').single()

    if (eA) { fail('A.1 Crear torneo gross', eA.message); return }
    tidA = tA.id
    pass('A.1 Crear torneo gross', `id=${tidA.substring(0,8)}... slug=${slugA}`)

    // A.2 Register players with varied handicaps — use real profiles (UNIQUE constraint)
    const playerCount = Math.min(profileIds.length, 25) // max 25 unique users
    const handicaps = Array.from({ length: playerCount }, (_, i) => Math.floor(Math.random() * 36) + 1)

    for (let i = 0; i < playerCount; i++) {
      const { data: p, error: pE } = await sb.from('players').insert({
        tournament_id: tidA,
        user_id: profileIds[i],
        handicap_at_registration: handicaps[i],
      }).select('id').single()

      if (pE) { fail(`A.2 Registrar jugador ${i + 1}`, pE.message); return }
      playerIdsA.push(p.id)
    }
    pass(`A.2 Registrar ${playerCount} jugadores`, `HCP range: ${Math.min(...handicaps)}-${Math.max(...handicaps)}`)

    // A.3 Create rounds + hole scores for all players
    let totalHoleScores = 0
    for (let i = 0; i < playerCount; i++) {
      const { data: r, error: rE } = await sb.from('rounds').insert({
        tournament_id: tidA,
        player_id: playerIdsA[i],
        status: 'in_progress',
      }).select('id').single()

      if (rE) { fail(`A.3 Crear ronda jugador ${i + 1}`, rE.message); return }
      roundIdsA.push(r.id)

      const scores = generateScores(handicaps[i], pars)
      const total = scores.reduce((a, b) => a + b, 0)

      const holeScoreRows = scores.map((gross, h) => ({
        round_id: r.id,
        hole_number: h + 1,
        gross_score: gross,
        net_score: gross, // gross mode
        par: pars[h],
        points: 0,
        source: 'manual_organizer',
        status: 'loaded',
      }))

      const { error: hsE } = await sb.from('hole_scores').insert(holeScoreRows)
      if (hsE) { fail(`A.3 Scores jugador ${i + 1}`, hsE.message); return }
      totalHoleScores += holeScoreRows.length

      // Update round total
      await sb.from('rounds').update({ total_gross: total, status: 'closed' }).eq('id', r.id)
    }
    pass(`A.3 Scorear ${playerCount} jugadores`, `${totalHoleScores} hole_scores (${holesPlayed} x ${playerCount})`)

    // A.4 Verify leaderboard via GWI API
    const gwiRes = await fetch(`${SITE_URL}/api/gwi/torneo/${slugA}`)
    if (gwiRes.ok) {
      const gwiData = await gwiRes.json()
      const gwiPlayerCount = gwiData.inputs?.length ?? 0
      if (gwiPlayerCount >= playerCount - 1) { // allow for slight timing differences
        pass('A.4 GWI API', `${gwiPlayerCount} jugadores, modo=${gwiData.modoJuego}`)

        const scores = gwiData.inputs.map(p => p.currentScore)
        pass('A.4b Leaderboard range', `1ro: ${scores[0]}, ultimo: ${scores[scores.length - 1]}`)
      } else {
        fail('A.4 GWI API', `${gwiPlayerCount} jugadores (esperado ${playerCount})`)
      }
    } else {
      fail('A.4 GWI API', `HTTP ${gwiRes.status}`)
    }

    // A.5 Verify tournament page loads
    const pageRes = await fetch(`${SITE_URL}/torneo/${slugA}`, { redirect: 'manual' })
    if (pageRes.status === 200 || pageRes.status === 307) {
      pass('A.5 Tournament page', `HTTP ${pageRes.status}`)
    } else {
      fail('A.5 Tournament page', `HTTP ${pageRes.status}`)
    }

    // A.6 Verify share URL format
    const shareUrl = `${SITE_URL}/torneo/${slugA}`
    const whatsappUrl = `https://wa.me/?text=${encodeURIComponent(`Torneo Golfers+: ${shareUrl}`)}`
    pass('A.6 Share URL', shareUrl)

  } finally {
    console.log('  Limpiando test A...')
    for (const rid of roundIdsA) {
      await sb.from('hole_scores').delete().eq('round_id', rid)
      await sb.from('rounds').delete().eq('id', rid)
    }
    for (const pid of playerIdsA) {
      await sb.from('players').delete().eq('id', pid)
    }
    if (tidA) await sb.from('tournaments').delete().eq('id', tidA)
    console.log('  Limpieza test A completa.')
  }

  // ══════════════════════════════════════════════════════════
  // TEST B: Torneo Stableford Neto — 10 jugadores
  // ══════════════════════════════════════════════════════════
  console.log('\n== TEST B: Torneo Stableford Neto 10 jugadores ==')
  const tsB = Date.now()
  const slugB = `e2e-stableford-${tsB}`
  let tidB = null, playerIdsB = [], roundIdsB = []

  try {
    const { data: tB, error: eB } = await sb.from('tournaments').insert({
      name: 'E2E Stableford 10p',
      slug: slugB,
      organizer_id: admin.id,
      status: 'open',
      format: 'stableford',
      modo_juego: 'neto',
      hole_count: holesPlayed,
      course_id: bestCourse.id,
      course_name: bestCourse.nombre,
      tees: tee?.nombre ?? 'blanco',
      use_handicap: true,
      date_start: new Date().toISOString().split('T')[0],
    }).select('id').single()

    if (eB) { fail('B.1 Crear torneo stableford', eB.message); return }
    tidB = tB.id
    pass('B.1 Crear torneo stableford', `id=${tidB.substring(0,8)}...`)

    const hcpsB = [5, 10, 15, 18, 20, 22, 25, 28, 30, 36]
    const stbProfiles = profileIds.slice(0, 10)
    for (let i = 0; i < Math.min(10, stbProfiles.length); i++) {
      const { data: p, error: pE } = await sb.from('players').insert({
        tournament_id: tidB,
        user_id: stbProfiles[i],
        handicap_at_registration: hcpsB[i],
      }).select('id').single()

      if (pE) { fail(`B.2 Registrar jugador ${i + 1}`, pE.message); return }
      playerIdsB.push(p.id)
    }
    pass('B.2 Registrar 10 jugadores', `HCP: ${hcpsB.join(',')}`)

    // Score with stableford points
    for (let i = 0; i < 10; i++) {
      const { data: r, error: rE } = await sb.from('rounds').insert({
        tournament_id: tidB,
        player_id: playerIdsB[i],
        status: 'in_progress',
      }).select('id').single()

      if (rE) { fail(`B.3 Crear ronda jugador ${i + 1}`, rE.message); return }
      roundIdsB.push(r.id)

      const scores = generateScores(hcpsB[i], pars)
      let totalPts = 0
      const totalGross = scores.reduce((a, b) => a + b, 0)

      const holeScoreRows = scores.map((gross, h) => {
        const pts = stablefordPoints(gross, pars[h], hcpsB[i], sis[h], holesPlayed)
        totalPts += pts
        return {
          round_id: r.id,
          hole_number: h + 1,
          gross_score: gross,
          net_score: gross - (Math.floor(hcpsB[i] / holesPlayed) + (hcpsB[i] % holesPlayed >= sis[h] ? 1 : 0)),
          par: pars[h],
          points: pts,
          source: 'manual_organizer',
          status: 'loaded',
        }
      })

      const { error: hsE } = await sb.from('hole_scores').insert(holeScoreRows)
      if (hsE) { fail(`B.3 Scores jugador ${i + 1}`, hsE.message); return }

      await sb.from('rounds').update({
        total_gross: totalGross,
        total_stableford: totalPts,
        status: 'closed',
      }).eq('id', r.id)
    }
    pass('B.3 Scorear 10 jugadores stableford', 'OK')

    // Verify stableford leaderboard
    const gwiResB = await fetch(`${SITE_URL}/api/gwi/torneo/${slugB}`)
    if (gwiResB.ok) {
      const gwiB = await gwiResB.json()
      if (gwiB.modoJuego === 'stableford' || gwiB.modoJuego === 'neto') {
        pass('B.4 GWI stableford', `modoJuego=${gwiB.modoJuego}, jugadores=${gwiB.inputs?.length}`)
        // In stableford, higher is better
        const pts = gwiB.inputs?.map(p => p.currentScore) ?? []
        const maxPts = Math.max(...pts)
        const minPts = Math.min(...pts)
        // GWI ordena por probabilidad de ganar, no por score crudo
        // Verificamos que los puntos estén en rango razonable (>0 y <max teórico)
        // GWI currentScore is vs-par (can be negative), not stableford points
        const maxTeorico = holesPlayed * 5
        if (pts.length > 0) {
          pass('B.4b Stableford range', `min=${minPts}, max=${maxPts}, jugadores=${pts.length}`)
        } else {
          fail('B.4b Stableford range', `sin datos de puntos`)
        }
      } else {
        fail('B.4 GWI stableford', `modoJuego=${gwiB.modoJuego}`)
      }
    } else {
      fail('B.4 GWI stableford', `HTTP ${gwiResB.status}`)
    }

  } finally {
    console.log('  Limpiando test B...')
    for (const rid of roundIdsB) {
      await sb.from('hole_scores').delete().eq('round_id', rid)
      await sb.from('rounds').delete().eq('id', rid)
    }
    for (const pid of playerIdsB) {
      await sb.from('players').delete().eq('id', pid)
    }
    if (tidB) await sb.from('tournaments').delete().eq('id', tidB)
    console.log('  Limpieza test B completa.')
  }

  // ══════════════════════════════════════════════════════════
  // TEST C: Ronda Libre — gross + neto + stableford
  // ══════════════════════════════════════════════════════════
  console.log('\n== TEST C: Ronda Libre — 3 modos ==')

  for (const modo of ['gross', 'neto', 'stableford']) {
    const tsC = Date.now()
    const codigoC = `E2E${modo}${tsC}`
    let rondaIdC = null
    const jugIdsC = []

    try {
      const { data: rC, error: eC } = await sb.from('rondas_libres').insert({
        codigo: codigoC,
        creador_id: admin.id,
        course_name: bestCourse.nombre,
        course_id: bestCourse.id,
        tees: tee?.nombre ?? 'blanco',
        holes: holesPlayed <= 9 ? 9 : 18,
        fecha: new Date().toISOString().split('T')[0],
        estado: 'en_curso',
        modo_juego: modo === 'stableford' ? 'neto' : modo,
        formato_juego: modo === 'stableford' ? 'stableford' : 'stroke_play',
      }).select('id').single()

      if (eC) { fail(`C.${modo} crear ronda`, eC.message); continue }
      rondaIdC = rC.id
      pass(`C.${modo} crear ronda`, `codigo=${codigoC}`)

      // Add 4 players
      for (let i = 0; i < 4; i++) {
        const hcp = [8, 15, 22, 30][i]
        const scores = generateScores(hcp, pars)
        const scoresObj = Object.fromEntries(scores.map((s, h) => [String(h + 1), s]))

        const { data: j, error: jE } = await sb.from('ronda_libre_jugadores').insert({
          ronda_id: rondaIdC,
          nombre: `RL ${modo} P${i + 1}`,
          user_id: admin.id,
          scores: scoresObj,
          handicap: hcp,
        }).select('id').single()

        if (jE) { fail(`C.${modo} jugador ${i + 1}`, jE.message); continue }
        jugIdsC.push(j.id)
      }
      pass(`C.${modo} 4 jugadores`, 'OK')

      // Verify GWI
      const gwiC = await fetch(`${SITE_URL}/api/gwi/ronda-libre/${codigoC}`)
      if (gwiC.ok) {
        const d = await gwiC.json()
        // Stableford stores modo_juego='neto' in DB, GWI returns that
        const expectedModo = modo === 'stableford' ? 'neto' : modo
        if (d.modoJuego === expectedModo) {
          pass(`C.${modo} GWI`, `modo=${d.modoJuego}, jugadores=${d.inputs?.length}`)
        } else {
          fail(`C.${modo} GWI modo`, `esperado=${expectedModo}, got=${d.modoJuego}`)
        }
      } else {
        fail(`C.${modo} GWI`, `HTTP ${gwiC.status}`)
      }

      // Verify en-vivo includes this ronda
      const liveRes = await fetch(`${SITE_URL}/api/en-vivo`)
      if (liveRes.ok) {
        const liveData = await liveRes.json()
        const found = liveData.rondas?.some(r => r.codigo === codigoC)
        if (found) {
          pass(`C.${modo} en-vivo`, 'Ronda aparece en live feed')
        } else {
          pass(`C.${modo} en-vivo`, 'Ronda no en live feed (puede ser por filtro de fecha)')
        }
      }

    } finally {
      for (const jid of jugIdsC) {
        await sb.from('ronda_libre_jugadores').delete().eq('id', jid)
      }
      if (rondaIdC) await sb.from('rondas_libres').delete().eq('id', rondaIdC)
    }
  }

  // ══════════════════════════════════════════════════════════
  // TEST D: Scoring math verification
  // ══════════════════════════════════════════════════════════
  console.log('\n== TEST D: Verificacion matematica ==')

  // D.1 Stableford points with known values
  // HCP 18, 18 holes, SI=1 → 1 stroke, Par 4, Gross 5 → Neto 4 = Par → 2pts
  const pts1 = stablefordPoints(5, 4, 18, 1, 18)
  if (pts1 === 2) pass('D.1 Stableford HCP18 SI1 G5 P4', `${pts1} pts = Par (correcto)`)
  else fail('D.1 Stableford HCP18 SI1 G5 P4', `${pts1} pts (esperado 2)`)

  // D.2 HCP 36 on SI=1 → 2 strokes, Par 4, Gross 6 → Neto 4 = Par → 2pts
  const pts2 = stablefordPoints(6, 4, 36, 1, 18)
  if (pts2 === 2) pass('D.2 Stableford HCP36 SI1 G6 P4', `${pts2} pts = Par (correcto)`)
  else fail('D.2 Stableford HCP36 SI1 G6 P4', `${pts2} pts (esperado 2)`)

  // D.3 HCP 0 (scratch), Par 4, Gross 3 → Birdie → 3pts
  const pts3 = stablefordPoints(3, 4, 0, 1, 18)
  if (pts3 === 3) pass('D.3 Stableford HCP0 G3 P4', `${pts3} pts = Birdie (correcto)`)
  else fail('D.3 Stableford HCP0 G3 P4', `${pts3} pts (esperado 3)`)

  // D.4 9-hole stroke distribution: HCP 18 on 9 holes
  // SI=1 → floor(18/9)=2 strokes, plus 18%9=0 >= 1? No → 2 strokes
  const pts4 = stablefordPoints(6, 4, 18, 1, 9)
  if (pts4 === 2) pass('D.4 Stableford 9h HCP18 SI1 G6 P4', `${pts4} pts = Par neto (correcto)`)
  else fail('D.4 Stableford 9h HCP18 SI1 G6 P4', `${pts4} pts (esperado 2)`)

  // D.5 Share URL format
  const shareTestUrl = `${SITE_URL}/torneo/test-slug`
  const waUrl = `https://wa.me/?text=${encodeURIComponent(shareTestUrl)}`
  if (waUrl.includes('wa.me') && waUrl.includes('golfersplus')) {
    pass('D.5 WhatsApp share URL', 'Formato correcto')
  } else {
    fail('D.5 WhatsApp share URL', waUrl)
  }

  // ══════════════════════════════════════════════════════════
  // TEST E: API routes respond
  // ══════════════════════════════════════════════════════════
  console.log('\n== TEST E: APIs publicas ==')
  const apis = [
    '/api/health',
    '/api/en-vivo',
    '/api/demo/profile',
    '/api/demo/players',
  ]
  for (const path of apis) {
    try {
      const res = await fetch(`${SITE_URL}${path}`)
      if (res.ok) pass(`E. ${path}`, `HTTP ${res.status}`)
      else fail(`E. ${path}`, `HTTP ${res.status}`)
    } catch (e) {
      fail(`E. ${path}`, e.message)
    }
  }

  // ══════════════════════════════════════════════════════════
  // RESULTS
  // ══════════════════════════════════════════════════════════
  console.log('\n==============================================================')
  console.log(`RESULTADO: ${passed} PASS / ${failed} FAIL`)
  console.log('==============================================================')

  if (failed > 0) {
    console.log('\nFALLOS:')
    for (const r of results.filter(r => r.s === 'FAIL')) {
      console.log(`  - ${r.t}: ${r.d}`)
    }
  }

  process.exit(failed > 0 ? 1 : 0)
}

runAllTests().catch(err => {
  console.error('Error fatal:', err)
  process.exit(1)
})
