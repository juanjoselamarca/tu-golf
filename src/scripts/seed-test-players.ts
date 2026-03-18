/**
 * Seed jugadores de prueba + torneos adicionales
 * Ejecutar: npx tsx src/scripts/seed-test-players.ts
 */
import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'

config({ path: '.env.local' })

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!URL || !KEY) { console.error('❌ Faltan vars de entorno'); process.exit(1) }

const sb = createClient(URL, KEY, { auth: { autoRefreshToken: false, persistSession: false } })

const TEST_PLAYERS = [
  { name: 'Test Organizador', email: 'test-organizador@golfers.plus', indice: 10, role: 'player' },
  { name: 'Test Jugador A',   email: 'test-jugador-a@golfers.plus',  indice: 15, role: 'player' },
  { name: 'Test Jugador B',   email: 'test-jugador-b@golfers.plus',  indice: 22, role: 'player' },
  { name: 'Test Admin',       email: 'test-admin@golfers.plus',      indice: 5,  role: 'admin' },
]

async function seedTestPlayers() {
  console.log('🌱 Seed jugadores y torneos de prueba\n')

  // 1. Create auth users + profiles
  console.log('▶ Auth users + Perfiles de prueba (4)...')
  const userIds: string[] = []

  for (const p of TEST_PLAYERS) {
    const { data: existing } = await sb.auth.admin.listUsers({ perPage: 1000 })
    const existingUser = existing?.users?.find(u => u.email === p.email)

    let userId: string
    if (existingUser) {
      userId = existingUser.id
      console.log(`  ⏭ ${p.name} ya existe`)
    } else {
      const { data: newUser, error } = await sb.auth.admin.createUser({
        email: p.email,
        password: 'test-golfers-2026',
        email_confirm: true,
        user_metadata: { name: p.name },
      })
      if (error) { console.error(`  ❌ ${p.name}: ${error.message}`); userIds.push(''); continue }
      userId = newUser.user.id
      console.log(`  ✅ ${p.name} creado`)
    }
    userIds.push(userId)

    await sb.from('profiles').upsert(
      { id: userId, email: p.email, name: p.name, indice: p.indice, role: p.role },
      { onConflict: 'id' }
    )
  }

  // 2. Torneos de prueba
  console.log('\n▶ Torneos de prueba...')
  const organizerId = userIds[0]
  if (!organizerId) { console.error('❌ No se pudo crear organizador'); process.exit(1) }

  const testTournaments = [
    { name: 'Torneo Test — Stableford', slug: 'torneo-test-stableford', date_start: '2026-03-29', format: 'stableford', status: 'draft' },
    { name: 'Torneo Test — Gross',      slug: 'torneo-test-gross',      date_start: '2026-04-05', format: 'gross',      status: 'draft' },
    { name: 'Torneo Test — 9 Hoyos',    slug: 'torneo-test-9h',         date_start: '2026-04-12', format: 'stableford', status: 'draft' },
  ]

  for (const t of testTournaments) {
    const { data: existing } = await sb.from('tournaments').select('id').eq('slug', t.slug).single()
    if (existing) { console.log(`  ⏭ ${t.name} ya existe`); continue }

    const { error } = await sb.from('tournaments').insert({
      ...t,
      organizer_id: organizerId,
      course_name: 'Los Leones Golf Club',
      hole_count: t.slug.includes('9h') ? 9 : 18,
      use_handicap: true,
      modo_juego: t.format,
    })
    if (error) console.error(`  ❌ ${t.name}: ${error.message}`)
    else console.log(`  ✅ ${t.name}`)
  }

  // 3. Inscribir jugadores test en torneo stableford
  console.log('\n▶ Inscripciones de prueba...')
  const { data: stablefordT } = await sb.from('tournaments').select('id').eq('slug', 'torneo-test-stableford').single()
  if (stablefordT) {
    for (let i = 1; i <= 2; i++) {
      const userId = userIds[i]
      if (!userId) continue
      const { data: existing } = await sb.from('players').select('id').eq('tournament_id', stablefordT.id).eq('user_id', userId).single()
      if (existing) { console.log(`  ⏭ ${TEST_PLAYERS[i].name} ya inscrito`); continue }

      const { error } = await sb.from('players').insert({
        tournament_id: stablefordT.id,
        user_id: userId,
        handicap_at_registration: TEST_PLAYERS[i].indice,
      })
      if (error) console.error(`  ❌ ${TEST_PLAYERS[i].name}: ${error.message}`)
      else console.log(`  ✅ ${TEST_PLAYERS[i].name} inscrito`)
    }
  }

  // 4. Rondas históricas para jugadores test (5 cada uno)
  console.log('\n▶ Rondas históricas de prueba...')
  const now = new Date()
  let ok = 0

  for (let i = 1; i <= 2; i++) {
    const userId = userIds[i]
    if (!userId) continue
    const p = TEST_PLAYERS[i]

    for (let semana = 5; semana >= 1; semana--) {
      const playedAt = new Date(now)
      playedAt.setDate(playedAt.getDate() - semana * 7)
      const gross = 72 + p.indice + Math.floor(Math.random() * 6) - 2

      const { error } = await sb.from('historical_rounds').insert({
        user_id: userId, course_name: 'Los Leones',
        played_at: playedAt.toISOString(),
        total_gross: gross, total_neto: gross - p.indice,
        privacy: 'private',
      })
      if (!error) { ok++; process.stdout.write('.') }
    }
  }
  console.log(`\n  ✅ ${ok}/10 rondas históricas`)

  // Health check
  const { count: profiles } = await sb.from('profiles').select('*', { count: 'exact', head: true })
  const { count: tournaments } = await sb.from('tournaments').select('*', { count: 'exact', head: true })
  const { count: players } = await sb.from('players').select('*', { count: 'exact', head: true })
  console.log('\n════════════════════════════════')
  console.log('🏁 Seed test completado:')
  console.log(`  profiles:    ${profiles}`)
  console.log(`  tournaments: ${tournaments}`)
  console.log(`  players:     ${players}`)
}

seedTestPlayers().catch(e => { console.error('❌ Seed falló:', e); process.exit(1) })
