#!/usr/bin/env node
/**
 * Smoke test del cerebro de tAIger+ — ejercita las piezas internas con la
 * data REAL de un usuario en Supabase prod. NO pasa por HTTP, no consume
 * rate limit ni cuota Anthropic.
 *
 * Cubre:
 *  1. Conexión a BD + lookup del usuario
 *  2. buildPlayerContext con sus rondas reales
 *  3. executeTool('get_latest_round', ...) con sus datos
 *  4. executeTool('get_recent_rounds', ...)
 *  5. executeTool('get_all_rounds_summary')
 *  6. narrateEvent sobre eventos sintéticos de cada tipo
 *  7. validateResponse contra una respuesta inventada vs real
 *  8. decide(...) del decision engine con sus patrones
 *
 * Uso:
 *   node --env-file=.env.local scripts/test-coach-e2e.mjs [email]
 *   (default email: juanjoselamarca@gmail.com)
 */

import { createClient } from '@supabase/supabase-js'

const email = process.argv[2] || 'juanjoselamarca@gmail.com'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !serviceKey) {
  console.error('FAIL: falta NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const admin = createClient(url, serviceKey)

const results = []
function log(name, ok, detail) {
  const status = ok ? '✓' : '✗'
  results.push({ name, ok })
  console.log(`${status} ${name}${detail ? ` · ${detail}` : ''}`)
}

// ============== 1. Lookup del usuario ==============

const { data: profile } = await admin
  .from('profiles')
  .select('id, name, indice, indice_golfers, role')
  .eq('email', email)
  .maybeSingle()

if (!profile) {
  console.error(`FAIL: no encontré profile con email ${email}`)
  // intentar por auth.users si email no está en profiles
  const { data: authUsers } = await admin.auth.admin.listUsers()
  const authUser = authUsers?.users?.find(u => u.email === email)
  if (!authUser) {
    console.error(`No hay user en auth.users tampoco. ABORT.`)
    process.exit(1)
  }
  console.log(`  encontrado en auth.users: ${authUser.id}, intentando profile por id…`)
  const { data: p2 } = await admin.from('profiles').select('*').eq('id', authUser.id).maybeSingle()
  if (!p2) { console.error('No hay profile asociado, ABORT'); process.exit(1) }
  Object.assign(profile ?? {}, p2)
}

const userId = profile.id
log('Lookup usuario', true, `${profile.name} (idx ${profile.indice ?? '—'}) ${userId}`)

// ============== 2. Conteo de rondas + patterns ==============

const [{ count: histCount }, { count: libreCount }, { count: patternsCount }, { count: planActivos }] = await Promise.all([
  admin.from('historical_rounds').select('id', { count: 'exact', head: true }).eq('user_id', userId),
  admin.from('rondas_libres').select('id', { count: 'exact', head: true }).neq('estado', 'cancelada'),
  admin.from('player_patterns').select('id', { count: 'exact', head: true }).eq('user_id', userId).eq('status', 'active'),
  admin.from('coach_plans').select('id', { count: 'exact', head: true }).eq('user_id', userId).eq('status', 'active'),
])
log('Datos del jugador', true, `${histCount} históricas · ${patternsCount} patterns · ${planActivos} plan activo`)

// ============== 3. buildPlayerContext (importamos el módulo compilado) ==============

let contextString = ''
let ctx = null
try {
  const { buildPlayerContext } = await import('../src/golf/coach/context.ts')
  const { buildContextString } = await import('../src/golf/coach/prompts.ts')
  ctx = await buildPlayerContext(admin, userId)
  contextString = buildContextString(ctx)
  log('buildPlayerContext', true, `${contextString.length} chars · ${ctx.recent_rounds?.length ?? 0} rondas en context`)
} catch (e) {
  log('buildPlayerContext', false, e.message)
}

// ============== 4. executeTool con sus datos reales ==============

const toolCtx = { supabase: admin, userId, defaultRondaId: null, sessionId: null }
let toolMod
try {
  toolMod = await import('../src/golf/coach/tools.ts')
} catch (e) {
  log('Importar tools', false, e.message); process.exit(1)
}

for (const toolName of ['get_latest_round', 'get_recent_rounds', 'get_all_rounds_summary']) {
  try {
    const t0 = Date.now()
    const r = await toolMod.executeTool(toolName, toolName === 'get_recent_rounds' ? { limit: 5 } : {}, toolCtx)
    const ms = Date.now() - t0
    if (r.ok) {
      log(`executeTool ${toolName}`, true, `${ms}ms`)
    } else {
      log(`executeTool ${toolName}`, false, r.error)
    }
  } catch (e) {
    log(`executeTool ${toolName}`, false, `THROW: ${e.message}`)
  }
}

// ============== 5. narrateEvent — eventos sintéticos ==============

try {
  const { narrateEvent } = await import('../src/lib/coach-event-narrator.ts')
  const samples = [
    { type: 'plan_assigned', payload: { pattern_id: 'three_putt_frequency' }, created_at: new Date().toISOString() },
    { type: 'tool_called', payload: { tool_name: 'get_latest_round', ok: true, ms: 120 }, created_at: new Date().toISOString() },
    { type: 'hallucination_check', payload: { flagged: true, warnings: [{ kind: 'unknown_number', evidence: '92' }] }, created_at: new Date().toISOString() },
  ]
  let allOk = true
  for (const s of samples) {
    const out = narrateEvent(s)
    if (!out.title || !out.icon) { allOk = false; break }
  }
  log('narrateEvent (3 tipos)', allOk)
} catch (e) {
  log('narrateEvent', false, e.message)
}

// ============== 6. decide — decision engine con sus patrones ==============

try {
  const { decide } = await import('../src/golf/coach/decision-engine.ts')
  const { data: rawPats } = await admin
    .from('player_patterns')
    .select('id, pattern_type, confidence, data_points, status, created_at')
    .eq('user_id', userId)
    .eq('status', 'active')
  const { PATTERNS } = await import('../src/golf/coach/patterns.ts')
  const enriched = (rawPats ?? []).map(r => {
    const def = PATTERNS.find(p => p.id === r.pattern_type)
    if (!def) return null
    return {
      id: r.id,
      pattern_id: r.pattern_type,
      confidence: r.confidence,
      data_points: r.data_points,
      severity: def.severity,
      status: r.status,
      created_at: r.created_at,
    }
  }).filter(Boolean)
  const decision = decide({ patterns: enriched, activePlan: null })
  log('decide engine', true, `winner=${decision.winningPattern?.pattern_id ?? 'none'} reason=${decision.reason}`)
} catch (e) {
  log('decide engine', false, e.message)
}

// ============== 7. validateResponse — heurística anti-alucinación ==============

try {
  const { validateResponse } = await import('../src/golf/coach/hallucination-validator.ts')
  const knownCourses = (ctx?.recent_rounds ?? []).map(r => r.course_name).filter(Boolean)
  // Test 1: respuesta legítima con datos del contexto
  const out1 = validateResponse({
    response: 'Trabajá en mantener concentración hoyo a hoyo.',
    contextString,
    toolResultsConcat: '',
    knownCourseNames: knownCourses,
  })
  // Test 2: respuesta con número inventado
  const out2 = validateResponse({
    response: 'Tu última ronda fue de 999 golpes en Hurlingham.',
    contextString,
    toolResultsConcat: '',
    knownCourseNames: knownCourses,
  })
  log('validateResponse', !out1.flagged && out2.flagged, `legit=${out1.flagged?'flag':'ok'} inventado=${out2.flagged?'flag':'miss'}`)
} catch (e) {
  log('validateResponse', false, e.message)
}

// ============== 8. Schema validator del endpoint ==============

try {
  const { z } = await import('zod')
  const schema = z.object({
    message: z.string().min(1).max(2000).optional(),
    messages: z.array(z.object({
      role: z.string(),
      content: z.string().max(2000),
    })).max(50).optional(),
    session_id: z.string().uuid().optional(),
  })
  // Carga sesión real del usuario y simula sanitización del cliente
  const { data: session } = await admin
    .from('taiger_sessions')
    .select('messages')
    .eq('user_id', userId)
    .eq('is_primary', true)
    .maybeSingle()
  const allMsgs = Array.isArray(session?.messages) ? session.messages : []
  const safeMessages = allMsgs
    .filter(m => typeof m.content === 'string' && m.content.trim().length > 0)
    .slice(-30)
    .map(m => ({ role: m.role, content: m.content.length > 2000 ? m.content.slice(0, 2000) : m.content }))
  const r = schema.safeParse({ messages: [...safeMessages, { role: 'user', content: 'analiza mi última ronda' }] })
  log('Schema acepta payload sanitizado', r.success, r.success ? `${safeMessages.length+1} mensajes` : r.error.issues[0]?.message)
} catch (e) {
  log('Schema check', false, e.message)
}

// ============== Resumen ==============

const passed = results.filter(r => r.ok).length
const failed = results.filter(r => !r.ok).length
console.log(`\n${'='.repeat(50)}`)
console.log(`Resultado: ${passed}/${results.length} pasaron · ${failed} fallaron`)
process.exit(failed > 0 ? 1 : 0)
