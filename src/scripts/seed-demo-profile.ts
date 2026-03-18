/**
 * Seed Carlos Méndez — 30 rondas exactas con grosses fijos
 * avg ~72.0 · mejor 70 · peor 76 · GWI target ~100
 * Ejecutar: npx tsx src/scripts/seed-demo-profile.ts
 */
import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'

config({ path: '.env.local' })

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!URL || !KEY) { console.error('❌ Faltan vars de entorno'); process.exit(1) }

const sb = createClient(URL, KEY, { auth: { autoRefreshToken: false, persistSession: false } })

const CARLOS_EMAIL = 'carlos-mendez@demo.golfers.plus'
const PARS    = [4,5,3,4,3,4,4,3,5, 4,5,4,3,5,4,5,3,4]
const CANCHAS = ['Los Leones','Los Leones','Prince of Wales','La Dehesa','Los Leones','Prince of Wales']

// Fijo cronológico — avg 72.0 · mejor 70 · peor 76
const GROSSES = [76,74,75,73,74,72,75,73,71,74,73,72,74,71,73,72,70,73,72,71,74,71,72,70,73,71,72,70,71,70]

function distribuirCarlos(totalGross: number): Record<string, number> {
  const scores: Record<string, number> = {}
  for (let h = 1; h <= 18; h++) scores[h] = PARS[h - 1]

  let remaining = totalGross - 72
  const order = Array.from({ length: 18 }, (_, i) => i + 1).sort(() => Math.random() - 0.5)

  for (const h of order) {
    if (remaining === 0) break
    const delta = remaining > 0 ? 1 : -1
    const newScore = scores[h] + delta
    if (newScore >= 1 && newScore <= PARS[h - 1] + 2) {
      scores[h] = newScore
      remaining -= delta
    }
  }

  const total = Object.values(scores).reduce((a, b) => a + b, 0)
  if (total !== totalGross) scores[18] += (totalGross - total)

  return scores
}

async function seedCarlos() {
  console.log('🌱 Seed Carlos Méndez — 30 rondas exactas\n')

  // Find Carlos's user_id
  const { data: users } = await sb.auth.admin.listUsers({ perPage: 1000 })
  const carlos = users?.users?.find(u => u.email === CARLOS_EMAIL)
  if (!carlos) {
    console.error('❌ Carlos Méndez no encontrado en auth.users — ejecuta seed-demo-data primero')
    process.exit(1)
  }
  const carlosId = carlos.id
  console.log(`  Carlos ID: ${carlosId.substring(0, 8)}...`)

  // Borrar rondas previas
  const { error: delErr } = await sb.from('historical_rounds').delete().eq('user_id', carlosId)
  if (delErr) console.warn('⚠ No se pudieron borrar rondas previas:', delErr.message)
  else console.log('  ✅ Rondas previas borradas')

  const now = new Date()
  let ok = 0
  const errores: string[] = []

  for (let i = 0; i < GROSSES.length; i++) {
    const gross = GROSSES[i]
    const playedAt = new Date(now)
    playedAt.setDate(playedAt.getDate() - (GROSSES.length - i) * 7)
    playedAt.setHours(8, 0, 0, 0)

    const cancha = CANCHAS[i % CANCHAS.length]
    const scores = distribuirCarlos(gross)

    const sumaScores = Object.values(scores).reduce((a, b) => a + b, 0)
    if (sumaScores !== gross) {
      console.error(`  ❌ Integridad fallida ronda ${i + 1}: ${sumaScores} ≠ ${gross}`)
      continue
    }

    const { error } = await sb.from('historical_rounds').insert({
      user_id: carlosId,
      course_name: cancha,
      played_at: playedAt.toISOString(),
      total_gross: gross,
      total_neto: gross - 2,
      scores,
      privacy: 'private',
    })

    if (error) { errores.push(`Ronda ${i + 1}: ${error.message}`); process.stdout.write('✗') }
    else { ok++; process.stdout.write('.') }
  }

  const avg = GROSSES.reduce((a, b) => a + b, 0) / GROSSES.length
  console.log(`\n\n════════════════════════════════`)
  console.log(`✅ ${ok}/${GROSSES.length} rondas insertadas`)
  console.log(`📊 avg: ${avg.toFixed(1)} · mejor: ${Math.min(...GROSSES)} · peor: ${Math.max(...GROSSES)}`)
  if (errores.length > 0) {
    console.log(`⚠ Errores (${errores.length}):`)
    errores.forEach(e => console.log(`  - ${e}`))
  }
}

seedCarlos().catch(e => { console.error('❌ Seed falló:', e); process.exit(1) })
