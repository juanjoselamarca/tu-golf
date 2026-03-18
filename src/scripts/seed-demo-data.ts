/**
 * Seed datos demo — Golfers+
 * Crea auth users + profiles + torneo demo + inscripciones + hole_scores + rondas históricas
 * Ejecutar: npx tsx src/scripts/seed-demo-data.ts
 */
import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'

config({ path: '.env.local' })

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!URL || !KEY) { console.error('❌ Faltan vars de entorno'); process.exit(1) }

const sb = createClient(URL, KEY, { auth: { autoRefreshToken: false, persistSession: false } })

// ── Dominio ──────────────────────────────────────────
const PARS = [4,5,3,4,3,4,4,3,5, 4,5,4,3,5,4,5,3,4] // par 72
const SI   = [11,3,17,1,15,5,9,13,7, 16,18,4,12,14,8,2,10,6]
const CANCHAS = ['Los Leones', 'Prince of Wales', 'La Dehesa', 'El Manzano', 'Chicureo']

const DEMO_PLAYERS = [
  { name: 'Carlos Méndez',   indice: 2,  email: 'carlos-mendez@demo.golfers.plus' },
  { name: 'Roberto Silva',   indice: 4,  email: 'roberto-silva@demo.golfers.plus' },
  { name: 'Andrés Torres',   indice: 1,  email: 'andres-torres@demo.golfers.plus' },
  { name: 'Felipe García',   indice: 6,  email: 'felipe-garcia@demo.golfers.plus' },
  { name: 'Miguel Ríos',     indice: 3,  email: 'miguel-rios@demo.golfers.plus' },
  { name: 'Sebastián López', indice: 5,  email: 'sebastian-lopez@demo.golfers.plus' },
  { name: 'Diego Vargas',    indice: 7,  email: 'diego-vargas@demo.golfers.plus' },
  { name: 'Martín Pérez',    indice: 8,  email: 'martin-perez@demo.golfers.plus' },
  { name: 'Alejandro Cruz',  indice: 9,  email: 'alejandro-cruz@demo.golfers.plus' },
  { name: 'Valentina Mora',  indice: 12, email: 'valentina-mora@demo.golfers.plus' },
]

function grossAleatorio(indice: number): number {
  const base = 72 + Math.round(indice * 1.1)
  const u1 = Math.random(), u2 = Math.random()
  const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2)
  return Math.round(Math.max(65, Math.min(base + 8, base + z * 3)))
}

function distribuirHoyos(totalGross: number): Record<string, number> {
  const scores: Record<string, number> = {}
  let acum = 0
  for (let h = 1; h <= 17; h++) {
    const par = PARS[h - 1]
    scores[h] = Math.max(1, par - 1) + Math.floor(Math.random() * ((par + 2) - Math.max(1, par - 1) + 1))
    acum += scores[h]
  }
  scores[18] = Math.max(1, Math.min(10, totalGross - acum))
  const total = Object.values(scores).reduce((a, b) => a + b, 0)
  if (total !== totalGross) {
    const maxH = Object.entries(scores).reduce((a, b) => scores[Number(a[0])] > scores[Number(b[0])] ? a : b)
    scores[Number(maxH[0])] += (totalGross - total)
  }
  return scores
}

async function seed() {
  console.log('🌱 Golfers+ — Seed datos demo\n')

  // 1. Create auth users + profiles
  console.log('▶ Auth users + Perfiles (10)...')
  const userIds: string[] = []

  for (const p of DEMO_PLAYERS) {
    // Check if auth user exists by email
    const { data: existing } = await sb.auth.admin.listUsers({ perPage: 1000 })
    const existingUser = existing?.users?.find(u => u.email === p.email)

    let userId: string
    if (existingUser) {
      userId = existingUser.id
      console.log(`  ⏭ ${p.name} ya existe (${userId.substring(0, 8)}...)`)
    } else {
      const { data: newUser, error: authErr } = await sb.auth.admin.createUser({
        email: p.email,
        password: 'demo-golfers-2026',
        email_confirm: true,
        user_metadata: { name: p.name },
      })
      if (authErr) {
        console.error(`  ❌ Auth ${p.name}: ${authErr.message}`)
        userIds.push('')
        continue
      }
      userId = newUser.user.id
      console.log(`  ✅ ${p.name} creado (${userId.substring(0, 8)}...)`)
    }
    userIds.push(userId)

    // Upsert profile
    const { error: profErr } = await sb.from('profiles').upsert(
      { id: userId, email: p.email, name: p.name, indice: p.indice, role: 'player' },
      { onConflict: 'id' }
    )
    if (profErr) console.error(`  ❌ Profile ${p.name}: ${profErr.message}`)
  }

  const validUserIds = userIds.filter(Boolean)
  if (validUserIds.length === 0) {
    console.error('❌ No se pudo crear ningún usuario — abortando')
    process.exit(1)
  }
  console.log(`  ✅ ${validUserIds.length} perfiles OK`)

  // 2. Torneo demo
  console.log('\n▶ Torneo demo...')
  const organizerId = userIds[0] // Carlos Méndez
  const { data: existingT } = await sb.from('tournaments').select('id').eq('slug', 'copa-golfers-plus-demo').single()
  let tournamentId: string

  if (existingT) {
    tournamentId = existingT.id
    console.log(`  ⏭ Torneo ya existe (${tournamentId.substring(0, 8)}...)`)
  } else {
    const { data: newT, error: tErr } = await sb.from('tournaments').insert({
      name: 'Copa Golfers+ — Torneo Demo',
      slug: 'copa-golfers-plus-demo',
      organizer_id: organizerId,
      course_name: 'Los Leones Golf Club',
      date_start: '2026-03-22',
      format: 'stableford',
      hole_count: 18,
      use_handicap: true,
      status: 'draft',
      modo_juego: 'stableford',
    }).select('id').single()
    if (tErr) { console.error(`  ❌ Torneo: ${tErr.message}`); process.exit(1) }
    tournamentId = newT!.id
    console.log(`  ✅ Torneo creado (${tournamentId.substring(0, 8)}...)`)
  }

  // 3. Inscripciones (players) + rounds + hole_scores
  console.log('\n▶ Inscripciones, rondas y scores...')
  const SCORES_DEMO = [-8, -5, -3, -2, -1, 0, 2, 4, 6, 8]
  const THRU = [18, 18, 18, 18, 15, 12, 18, 16, 18, 18]

  for (let i = 0; i < DEMO_PLAYERS.length; i++) {
    const p = DEMO_PLAYERS[i]
    const userId = userIds[i]
    if (!userId) continue

    // Check if player already inscribed
    const { data: existingP } = await sb.from('players')
      .select('id')
      .eq('tournament_id', tournamentId)
      .eq('user_id', userId)
      .single()

    let playerId: string
    if (existingP) {
      playerId = existingP.id
    } else {
      const { data: newP, error: pErr } = await sb.from('players').insert({
        tournament_id: tournamentId,
        user_id: userId,
        handicap_at_registration: p.indice,
      }).select('id').single()
      if (pErr) { console.error(`  ❌ Player ${p.name}: ${pErr.message}`); continue }
      playerId = newP!.id
    }

    // Create round for this player
    const { data: existingR } = await sb.from('rounds')
      .select('id')
      .eq('tournament_id', tournamentId)
      .eq('player_id', playerId)
      .single()

    let roundId: string
    if (existingR) {
      roundId = existingR.id
    } else {
      const { data: newR, error: rErr } = await sb.from('rounds').insert({
        tournament_id: tournamentId,
        player_id: playerId,
        status: 'in_progress',
      }).select('id').single()
      if (rErr) { console.error(`  ❌ Round ${p.name}: ${rErr.message}`); continue }
      roundId = newR!.id
    }

    // Insert hole scores
    const targetGross = 72 + SCORES_DEMO[i]
    const hoyos = distribuirHoyos(targetGross)
    const thruHoyos = THRU[i]

    for (let h = 1; h <= thruHoyos; h++) {
      const par = PARS[h - 1]
      const strokes = p.indice >= SI[h - 1] ? 1 : 0
      const gross = hoyos[h] || par
      const netoScore = gross - strokes
      // Stableford points
      const diff = netoScore - par
      const pts = diff <= -2 ? 4 : diff === -1 ? 3 : diff === 0 ? 2 : diff === 1 ? 1 : 0

      await sb.from('hole_scores').upsert({
        round_id: roundId,
        hole_number: h,
        gross_score: gross,
        net_score: netoScore,
        par,
        points: pts,
        source: 'manual_organizer',
        status: 'loaded',
      }, { onConflict: 'round_id,hole_number' })
    }

    // Update round totals
    const { data: allScores } = await sb.from('hole_scores')
      .select('gross_score, net_score, points')
      .eq('round_id', roundId)
      .not('gross_score', 'is', null)

    if (allScores && allScores.length > 0) {
      const totalGross  = allScores.reduce((s, h) => s + (h.gross_score ?? 0), 0)
      const totalNet    = allScores.reduce((s, h) => s + (h.net_score ?? 0), 0)
      const totalPoints = allScores.reduce((s, h) => s + (h.points ?? 0), 0)
      await sb.from('rounds').update({ total_gross: totalGross, total_net: totalNet, total_points: totalPoints }).eq('id', roundId)
    }

    process.stdout.write('.')
  }
  console.log('\n  ✅ Inscripciones y hole_scores OK')

  // 4. Rondas históricas — 10 por jugador = 100 total
  console.log('\n▶ Rondas históricas (100)...')
  const now = new Date()
  let ok = 0

  for (let i = 0; i < DEMO_PLAYERS.length; i++) {
    const p = DEMO_PLAYERS[i]
    const userId = userIds[i]
    if (!userId) continue

    for (let semana = 10; semana >= 1; semana--) {
      const playedAt = new Date(now)
      playedAt.setDate(playedAt.getDate() - semana * 7)

      const gross = grossAleatorio(p.indice)
      const cancha = CANCHAS[Math.floor(Math.random() * CANCHAS.length)]
      const scores = distribuirHoyos(gross)

      const { error } = await sb.from('historical_rounds').insert({
        user_id: userId,
        course_name: cancha,
        played_at: playedAt.toISOString(),
        total_gross: gross,
        total_neto: Math.max(gross - p.indice, 60),
        scores,
        privacy: 'private',
      })
      if (!error) { ok++; process.stdout.write('.') }
      else if (!error?.message?.includes('unique')) console.error(`  ❌ ${p.name}: ${error?.message}`)
    }
  }
  console.log(`\n  ✅ ${ok}/100 rondas históricas`)

  // 5. Health check
  const { count: profiles } = await sb.from('profiles').select('*', { count: 'exact', head: true })
  const { count: hist }     = await sb.from('historical_rounds').select('*', { count: 'exact', head: true })
  const { count: hscores }  = await sb.from('hole_scores').select('*', { count: 'exact', head: true })
  const { count: players }  = await sb.from('players').select('*', { count: 'exact', head: true })
  const { count: tournaments } = await sb.from('tournaments').select('*', { count: 'exact', head: true })
  console.log('\n════════════════════════════════')
  console.log('🏁 Seed completado:')
  console.log(`  profiles:          ${profiles}`)
  console.log(`  tournaments:       ${tournaments}`)
  console.log(`  players:           ${players}`)
  console.log(`  historical_rounds: ${hist}`)
  console.log(`  hole_scores:       ${hscores}`)
}

seed().catch(e => { console.error('❌ Seed falló:', e); process.exit(1) })
