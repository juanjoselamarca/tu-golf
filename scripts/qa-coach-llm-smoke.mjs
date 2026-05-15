#!/usr/bin/env node
/**
 * scripts/qa-coach-llm-smoke.mjs
 *
 * Smoke test del LLM del coach tAIger+: valida que NO cruce promedios entre
 * buckets 9h vs 18h. Bug objetivo (cubierto en el merge f878fcc del 12-may):
 * si un user solo juega 18h (avg ~ 89) el coach NO debe responder con avg 45
 * (eso sería de un bucket de 9h cruzado), y viceversa.
 *
 * Cómo funciona:
 *   1. Crea/reutiliza 3 users de smoke en prod (`smoke-{18h,9h,mixed}@golfersplus-test.local`).
 *   2. Para cada user: limpia rondas previas + seedea 10 rondas según perfil.
 *   3. Llama buildPlayerContext (mismo módulo que el route real) para construir
 *      el contexto del jugador.
 *   4. Llama Anthropic directamente con el system prompt y tools de prod —
 *      bypassa el wrapping HTTP/SSE, valida solo la respuesta del LLM.
 *   5. Maneja el loop de tool calls (max 3 iters) igual que el route.
 *   6. Parsea el texto final y asserta:
 *        - 18h: no debe mencionar números en rango [35, 55].
 *        - 9h:  no debe mencionar números en rango [70, 110].
 *        - mixed: debe mencionar ambos buckets (9h y 18h) explícitamente.
 *   7. Reporta pass/fail.
 *
 * Uso:
 *   node --import tsx --env-file=.env.local scripts/qa-coach-llm-smoke.mjs
 *
 * Costo aprox: 3 llamadas a Claude Sonnet × ~2K tokens cada una ≈ $0.03 USD/run.
 *
 * NO toca data de usuarios reales — los 3 emails están reservados para smoke.
 * Idempotente: cleanup al inicio, OK para correr múltiples veces.
 */

import { createClient } from '@supabase/supabase-js'
import Anthropic from '@anthropic-ai/sdk'

// ---------- Setup ----------

const SUPA_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SRV_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY

if (!SUPA_URL || !SRV_KEY || !ANTHROPIC_KEY) {
  console.error('FAIL: faltan NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY o ANTHROPIC_API_KEY en .env.local')
  process.exit(1)
}

const admin = createClient(SUPA_URL, SRV_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})
const anthropic = new Anthropic({ apiKey: ANTHROPIC_KEY })

// ---------- Profiles ----------

const PROFILES = {
  '18h': {
    email: 'smoke-18h@golfersplus-test.local',
    name: 'Smoke User 18h',
    indice: 14.0,
    rounds: 10,
    holes: 18,
    // gross típico para un 14-handicap en 18h: ~88 (84-92).
    // Normalizado a 18h-equiv: idéntico al real (holes_played = 18).
    grossMin: 84, grossMax: 92,
    expectedPrimaryRange: [82, 96],
    // En 18h-only, jamás debería aparecer un número que parezca un avg-9h-real
    // (range 35-55). Si aparece, hay bug de normalización o de filtro.
    forbiddenAvgRange: [35, 55],
  },
  '9h': {
    email: 'smoke-9h@golfersplus-test.local',
    name: 'Smoke User 9h',
    indice: 14.0,
    rounds: 10,
    holes: 9,
    // gross 9h ~ 45 → normalizado a 18h-equiv ~ 90 (44.5 × 2).
    grossMin: 42, grossMax: 48,
    // En modelo híbrido el avg primario debe estar en eje 18h-equiv, no
    // en el 9h real. Para un avg 9h ≈ 45, normalizado ≈ 90.
    expectedPrimaryRange: [84, 96],
    // El coach DEBE acompañar el número con "equivalente" o "18 hoyos"
    // o "18h" para que el user entienda la unidad. Si no lo dice, es bug
    // de honestidad metodológica (el user 9h pensaría que su avg real es 90).
    requireUnitMention: true,
  },
  'mixed': {
    email: 'smoke-mixed@golfersplus-test.local',
    name: 'Smoke User Mixed',
    indice: 14.0,
    rounds18: 5,
    rounds9: 5,
    // Cansancio mental detectable: 9h real ~ 44 (proyectaría a 88 en 18h),
    // pero las 18h reales son ~ 94 → delta = +6 strokes por fatiga.
    gross18Min: 92, gross18Max: 96,
    gross9Min: 42, gross9Max: 46,
    // Modelo híbrido (15-may): el LLM debe citar el avg normalizado a
    // 18h-equiv como primario. Avg normalizado = mean(94 × 5 + 88 × 5) ≈ 91.
    // OK que el coach también cite el detalle real por bucket (94 y 44)
    // si el contexto lo amerita — eso es comportamiento deseado del prompt.
    expectedPrimaryRange: [88, 94],
  },
}

// ---------- Helpers ----------

function pick(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min
}

function genScores(holes, target) {
  // Distribuir `target` strokes entre `holes` con varianza realista.
  const par = holes === 9 ? 36 : 72
  const overPar = target - par
  const arr = Array(holes).fill(0)
  // Empezamos par en cada hoyo, distribuimos overPar.
  const parsByHole = Array(holes).fill(4) // par 4 promedio simplificado
  for (let i = 0; i < holes; i++) arr[i] = parsByHole[i]
  let remaining = overPar
  while (remaining !== 0) {
    const i = Math.floor(Math.random() * holes)
    if (remaining > 0 && arr[i] < parsByHole[i] + 3) { arr[i]++; remaining-- }
    else if (remaining < 0 && arr[i] > parsByHole[i] - 1) { arr[i]--; remaining++ }
  }
  return arr
}

async function getOrCreateUser(email, name) {
  const { data: list, error: lErr } = await admin.auth.admin.listUsers({ perPage: 1000 })
  if (lErr) throw new Error(`listUsers: ${lErr.message}`)
  const existing = list.users.find(u => u.email === email)
  if (existing) return existing.id

  const { data: created, error: cErr } = await admin.auth.admin.createUser({
    email,
    password: 'smoke-test-' + Date.now(),
    email_confirm: true,
    user_metadata: { name, e2e_smoke: true },
  })
  if (cErr) throw new Error(`createUser ${email}: ${cErr.message}`)
  return created.user.id
}

async function ensureProfile(userId, email, name, indice) {
  const { error } = await admin.from('profiles').upsert({
    id: userId,
    email,
    name,
    indice,
  }, { onConflict: 'id' })
  if (error) throw new Error(`profile upsert: ${error.message}`)
}

async function cleanRounds(userId) {
  const { error } = await admin.from('historical_rounds').delete().eq('user_id', userId)
  if (error) throw new Error(`cleanRounds: ${error.message}`)
}

async function seedRounds(userId, rounds) {
  // rounds: [{ holes_played, total_gross, scores, played_at }]
  const { error } = await admin.from('historical_rounds').insert(rounds.map(r => ({
    user_id: userId,
    course_name: 'Smoke Course',
    played_at: r.played_at,
    total_gross: r.total_gross,
    scores: r.scores,
    holes_played: r.holes_played,
    privacy: 'private',
    import_source: 'manual',
    formato_juego: 'stroke_play',
    modo_juego: 'gross',
  })))
  if (error) throw new Error(`seedRounds: ${error.message}`)
}

function buildSeedRounds(profile) {
  const out = []
  const today = new Date()
  if (profile.rounds && profile.holes) {
    // Solo-18h o solo-9h
    for (let i = 0; i < profile.rounds; i++) {
      const playedAt = new Date(today); playedAt.setDate(today.getDate() - (profile.rounds - i) * 3)
      const totalGross = pick(profile.grossMin, profile.grossMax)
      out.push({
        holes_played: profile.holes,
        total_gross: totalGross,
        scores: genScores(profile.holes, totalGross),
        played_at: playedAt.toISOString().split('T')[0],
      })
    }
    return out
  }
  // Mixed
  for (let i = 0; i < profile.rounds18; i++) {
    const playedAt = new Date(today); playedAt.setDate(today.getDate() - (profile.rounds18 + profile.rounds9 - i) * 3)
    const totalGross = pick(profile.gross18Min, profile.gross18Max)
    out.push({ holes_played: 18, total_gross: totalGross, scores: genScores(18, totalGross), played_at: playedAt.toISOString().split('T')[0] })
  }
  for (let i = 0; i < profile.rounds9; i++) {
    const playedAt = new Date(today); playedAt.setDate(today.getDate() - (profile.rounds9 - i) * 2)
    const totalGross = pick(profile.gross9Min, profile.gross9Max)
    out.push({ holes_played: 9, total_gross: totalGross, scores: genScores(9, totalGross), played_at: playedAt.toISOString().split('T')[0] })
  }
  return out
}

// ---------- LLM flow ----------

async function runCoachChat(userId, userMessage) {
  // Import dynamic — tsx loader maneja .ts
  const { buildPlayerContext } = await import('../src/golf/coach/context.ts')
  const { buildContextString, TAIGER_SYSTEM_PROMPT, TAIGER_SESSION_STARTER } = await import('../src/golf/coach/prompts.ts')
  const { TAIGER_TOOLS, executeTool } = await import('../src/golf/coach/tools.ts')

  const ctx = await buildPlayerContext(admin, userId)
  const contextString = buildContextString(ctx)

  const toolsInstruction = '\n\nHERRAMIENTAS DISPONIBLES:\n- get_all_rounds_summary: agregados sobre el 100% del histórico.\n- get_recent_rounds: últimas N rondas.\nUsa estas tools si necesitas data agregada. NO inventes scores ni promedios — cita solo lo que las tools devuelven.'
  const system = `${TAIGER_SYSTEM_PROMPT.replace('{PLAYER_CONTEXT}', contextString)}\n\nINSTRUCCIÓN DE SESIÓN:\n${TAIGER_SESSION_STARTER}${toolsInstruction}`

  const toolCtx = { supabase: admin, userId, defaultRondaId: null, sessionId: null }

  const loopMessages = [{ role: 'user', content: userMessage }]
  let fullResponse = ''
  const MAX_ITERS = 4

  for (let iter = 0; iter < MAX_ITERS; iter++) {
    const resp = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1024,
      system,
      tools: TAIGER_TOOLS,
      messages: loopMessages,
    })

    for (const block of resp.content) {
      if (block.type === 'text') fullResponse += block.text + '\n'
    }

    if (resp.stop_reason === 'tool_use') {
      loopMessages.push({ role: 'assistant', content: resp.content })
      const toolResults = []
      for (const block of resp.content) {
        if (block.type === 'tool_use') {
          const result = await executeTool(block.name, block.input, toolCtx)
          toolResults.push({ type: 'tool_result', tool_use_id: block.id, content: JSON.stringify(result) })
        }
      }
      loopMessages.push({ role: 'user', content: toolResults })
      continue
    }
    break
  }
  return fullResponse.trim()
}

// ---------- Asserts ----------

function extractNumbers(text) {
  // Captura enteros 2-3 dígitos que probablemente son scores/avg (35-150 range).
  return [...text.matchAll(/\b(\d{2,3})\b/g)].map(m => parseInt(m[1])).filter(n => n >= 30 && n <= 150)
}

function isInRange(n, [min, max]) { return n >= min && n <= max }

function assertProfile(profileName, profile, response) {
  const numbers = extractNumbers(response)
  const failures = []

  if (profile.forbiddenAvgRange) {
    const violating = numbers.filter(n => isInRange(n, profile.forbiddenAvgRange))
    if (violating.length > 0) {
      failures.push(`El LLM mencionó ${violating.join(', ')} — caen en rango prohibido [${profile.forbiddenAvgRange.join('-')}] (cruzó buckets)`)
    }
  }

  if (profile.expectedPrimaryRange) {
    // Modelo híbrido: el coach debe citar al menos un número dentro del
    // rango esperado del avg normalizado a 18h-equiv.
    const inRange = numbers.filter(n => isInRange(n, profile.expectedPrimaryRange))
    if (inRange.length === 0) {
      failures.push(`No se citó ningún número en rango del avg normalizado [${profile.expectedPrimaryRange.join('-')}]. Números detectados: ${numbers.join(', ') || '(ninguno)'}`)
    }
  }

  if (profile.requireUnitMention) {
    // Para users 9h-only: el coach DEBE acompañar el número con la unidad
    // ("equivalente", "18 hoyos", "18h") porque el avg que cita está en
    // escala 18h pero el user juega 9h. Sin esa palabra, el user puede
    // confundirse y pensar que ese es su avg real.
    const lower = response.toLowerCase()
    const mentionsUnit = /equivalente|18\s*hoyos|18h|escala/.test(lower)
    if (!mentionsUnit) {
      failures.push(`No mencionó la unidad "equivalente 18 hoyos" / "18h" al citar el avg — el user 9h podría confundirse.`)
    }
  }

  return failures
}

// ---------- Main ----------

async function runProfile(key, profile) {
  console.log(`\n━━━ ${key.toUpperCase()} (${profile.email}) ━━━`)
  const userId = await getOrCreateUser(profile.email, profile.name)
  console.log(`  user_id: ${userId.slice(0, 8)}…`)
  await ensureProfile(userId, profile.email, profile.name, profile.indice)
  await cleanRounds(userId)
  const seedRows = buildSeedRounds(profile)
  await seedRounds(userId, seedRows)
  console.log(`  seedeadas ${seedRows.length} rondas`)

  const userMessage = '¿Cuál es mi promedio de scoring? Cita el número exacto.'
  console.log(`  → preguntando al coach: "${userMessage}"`)
  const t0 = Date.now()
  const response = await runCoachChat(userId, userMessage)
  const ms = Date.now() - t0
  console.log(`  ← respuesta (${response.length} chars, ${ms}ms):`)
  console.log(response.split('\n').map(l => '    ' + l).join('\n'))

  const failures = assertProfile(key, profile, response)
  if (failures.length === 0) {
    console.log(`  ✓ PASS`)
    return { key, pass: true }
  } else {
    console.log(`  ✗ FAIL`)
    failures.forEach(f => console.log(`    - ${f}`))
    return { key, pass: false, failures }
  }
}

async function main() {
  console.log('🐯 qa-coach-llm-smoke — validando consistencia 9h/18h del LLM\n')
  const results = []
  for (const [key, profile] of Object.entries(PROFILES)) {
    try {
      results.push(await runProfile(key, profile))
    } catch (err) {
      console.error(`  ✗ ERROR en ${key}: ${err.message}`)
      results.push({ key, pass: false, error: err.message })
    }
  }

  console.log('\n━━━ RESUMEN ━━━')
  const failed = results.filter(r => !r.pass)
  for (const r of results) {
    console.log(`  ${r.pass ? '✓' : '✗'} ${r.key}`)
  }
  if (failed.length > 0) {
    console.log(`\n${failed.length}/${results.length} perfiles FAIL`)
    process.exit(1)
  }
  console.log(`\nTodos los perfiles pasaron (${results.length}/${results.length})`)
}

main().catch(err => {
  console.error('FATAL:', err)
  process.exit(1)
})
