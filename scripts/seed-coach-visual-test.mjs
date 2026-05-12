/**
 * Seed temporal para verificación visual del rediseño de /coach.
 *
 * Crea un usuario de test con data ficticia que ejercita TODAS las secciones
 * del rediseño psicológico-first:
 *   - 5 rondas Los Leones con scores realistas (incluye espirales post-bogey)
 *   - 2 player_patterns activos: post_bogey_spiral (critical) + par_3_weakness
 *   - 1 coach_plan activo apuntando a post_bogey_spiral
 *   - 5 plan_outcomes mostrando 60% de adherencia
 *   - 1 taiger_session marcada is_primary
 *
 * Email: visual-test-<random>@test.golfers.local
 * Password: VisualTest123!
 *
 * Cleanup: el script de cleanup `seed-coach-visual-cleanup.mjs` elimina al user
 * y todas sus filas via ON DELETE CASCADE.
 *
 * NO commitear este seed a main. Vive solo en el worktree.
 */

import { createClient } from '@supabase/supabase-js'
import { randomBytes } from 'node:crypto'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!url || !serviceRole) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local')
  process.exit(1)
}

const admin = createClient(url, serviceRole, {
  auth: { autoRefreshToken: false, persistSession: false },
})

const suffix = randomBytes(4).toString('hex')
const EMAIL = `visual-test-${suffix}@test.golfers.local`
const PASSWORD = 'VisualTest123!'

const LOS_LEONES_PARS = [4, 4, 3, 4, 5, 4, 3, 4, 5, 4, 4, 3, 4, 5, 4, 3, 4, 5]
const COURSE_RATING = 70.8
const SLOPE = 130

function daysAgo(n) {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return d.toISOString()
}

// Rondas con espirales detectables — necesario para que strokesEvitables tenga
// instancias y CostoPsicologicoCard renderee. Scores diseñadas para activar
// post_bogey_spiral pattern (>40% de bogeys seguidos por otro bogey).
const ROUNDS = [
  {
    played_at: daysAgo(23),  // 18 abr — mejor ronda mental
    course_name: 'Los Leones',
scores: [4, 4, 3, 4, 5, 4, 3, 4, 5, 4, 4, 3, 4, 5, 4, 3, 4, 5],
    total_gross: 88,  // sum = 72... wait. Let me recalc. 4+4+3+4+5+4+3+4+5+4+4+3+4+5+4+3+4+5 = 72. Need 88.
  },
  {
    played_at: daysAgo(12),  // 29 abr
    course_name: 'Los Leones',
scores: [5, 7, 3, 4, 5, 4, 3, 4, 5, 4, 5, 7, 4, 5, 7, 3, 4, 6],
    total_gross: 95,  // espiral H1→H2, H11→H12, H14→H15
  },
  {
    played_at: daysAgo(9),  // 02 may
    course_name: 'Los Leones',
scores: [5, 7, 4, 4, 6, 4, 3, 5, 5, 4, 5, 6, 4, 6, 7, 3, 5, 6],
    total_gross: 95,
  },
  {
    played_at: daysAgo(8),  // 03 may — ronda de la screenshot, 100 (+28)
    course_name: 'Los Leones',
scores: [5, 7, 3, 4, 5, 6, 3, 4, 5, 4, 5, 7, 4, 5, 7, 3, 4, 9],
    total_gross: 100,
  },
  {
    played_at: daysAgo(4),  // 07 may
    course_name: 'Los Leones',
scores: [5, 6, 4, 4, 5, 4, 3, 4, 6, 4, 5, 4, 4, 5, 7, 3, 4, 5],
    total_gross: 88,
  },
]

// Re-calc total_gross from scores to ensure consistency
for (const r of ROUNDS) {
  r.total_gross = r.scores.reduce((a, b) => a + b, 0)
  r.par_per_hole = LOS_LEONES_PARS
  r.course_rating = COURSE_RATING
  r.slope_rating = SLOPE
  r.holes_played = 18
}

async function main() {
  console.log(`\n→ Creating test user: ${EMAIL}`)

  const { data: userData, error: userErr } = await admin.auth.admin.createUser({
    email: EMAIL,
    password: PASSWORD,
    email_confirm: true,
  })

  if (userErr) {
    console.error('Failed to create user:', userErr.message)
    process.exit(1)
  }

  const userId = userData.user.id
  console.log(`  user_id: ${userId}`)

  // 1. profile
  const { error: profErr } = await admin.from('profiles').upsert({
    id: userId,
    email: EMAIL,
    name: 'Test Visual Coach',
    indice: 14.2,
    cpi_score: 62,
  }, { onConflict: 'id' })
  if (profErr) {
    console.error('Failed profile:', profErr.message)
    process.exit(1)
  }
  console.log(`  ✓ profile`)

  // 2. historical_rounds
  const roundsToInsert = ROUNDS.map(r => ({ ...r, user_id: userId }))
  const { error: roundErr } = await admin.from('historical_rounds').insert(roundsToInsert)
  if (roundErr) {
    console.error('Failed rounds:', roundErr.message)
    process.exit(1)
  }
  console.log(`  ✓ ${ROUNDS.length} historical_rounds`)

  // 3. player_patterns — necesita data_points >= 1 + status active
  const { error: patErr } = await admin.from('player_patterns').insert([
    {
      user_id: userId,
      pattern_type: 'post_bogey_spiral',
      confidence: 0.85,
      data_points: 4,
      status: 'active',
      first_detected: daysAgo(10),
      metadata: { spiral_rate: 0.62, bogey_count: 13, followed_by_bogey: 8 },
    },
    {
      user_id: userId,
      pattern_type: 'par_3_weakness',
      confidence: 0.72,
      data_points: 5,
      status: 'active',
      first_detected: daysAgo(7),
      metadata: { par3_avg_over: 1.4, other_avg_over: 0.6 },
    },
  ])
  if (patErr) {
    console.error('Failed patterns:', patErr.message)
    process.exit(1)
  }
  console.log(`  ✓ 2 player_patterns (active)`)

  // 4. coach_plan activo
  const { data: planData, error: planErr } = await admin.from('coach_plans').insert({
    user_id: userId,
    pattern_id: 'post_bogey_spiral',
    pattern_version: 1,
    hypothesis: 'Bogey seguro tras error',
    rule: 'Cuando un hoyo se complica, juega al bogey en vez de buscar par.',
    metric: 'post_bogey_spiral_rate',
    target_value: 0.30,
    target_op: 'lte',
    baseline_value: 0.62,
    duration_days: 21,
    status: 'active',
    observation_data: { detected_in_rounds: 4, current_rate: 0.62 },
    assigned_by: 'tAIger',
  }).select('id').single()
  if (planErr) {
    console.error('Failed plan:', planErr.message)
    process.exit(1)
  }
  const planId = planData.id
  console.log(`  ✓ coach_plan (active, id ${planId.slice(0, 8)}...)`)

  // 5. plan_outcomes — 5 outcomes, 3 target_reached (60% adherence)
  // Necesita historical_round_id válido para satisfacer CHECK constraint
  const { data: roundsData } = await admin.from('historical_rounds').select('id, played_at').eq('user_id', userId).order('played_at', { ascending: false }).limit(5)
  if (!roundsData || roundsData.length < 5) {
    console.error('Could not fetch rounds for outcomes')
    process.exit(1)
  }
  const outcomesToInsert = roundsData.map((r, i) => ({
    plan_id: planId,
    user_id: userId,
    historical_round_id: r.id,
    played_at: r.played_at,
    metric_value: [0.25, 0.50, 0.20, 0.45, 0.28][i],
    delta_vs_baseline: [-0.37, -0.12, -0.42, -0.17, -0.34][i],
    target_reached: [true, false, true, false, true][i],
    compliance: ['full', 'partial', 'full', 'partial', 'full'][i],
    metadata: { round: i + 1 },
  }))
  const { error: outErr } = await admin.from('plan_outcomes').insert(outcomesToInsert)
  if (outErr) {
    console.error('Failed outcomes:', outErr.message)
    process.exit(1)
  }
  console.log(`  ✓ 5 plan_outcomes (3 target_reached = 60%)`)

  // 6. taiger_session primary
  const { error: sessErr } = await admin.from('taiger_sessions').insert({
    user_id: userId,
    session_type: 'continuous',
    is_primary: true,
    messages: [],
    next_focus: 'Espiral post-bogey',
  })
  if (sessErr) {
    console.error('Failed session:', sessErr.message)
    process.exit(1)
  }
  console.log(`  ✓ taiger_session (primary)`)

  console.log('\n========================================')
  console.log('SEED COMPLETE')
  console.log('========================================')
  console.log(`EMAIL:    ${EMAIL}`)
  console.log(`PASSWORD: ${PASSWORD}`)
  console.log(`USER_ID:  ${userId}`)
  console.log('========================================')
  console.log('\nNext: open http://localhost:3001/login y autentícate con esas credenciales para ver /coach con data ficticia.')
  console.log(`Cleanup: node --env-file=.env.local scripts/seed-coach-visual-cleanup.mjs ${userId}`)
}

main().catch(err => {
  console.error('Unexpected error:', err)
  process.exit(1)
})
