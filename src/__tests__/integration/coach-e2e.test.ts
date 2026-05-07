/**
 * Test de integración del cerebro de tAIger+ contra Supabase prod
 * con la data REAL del usuario.
 *
 * Ejercita las piezas internas (sin HTTP) para confirmar que cada capa
 * funciona end-to-end contra datos reales:
 *  1. buildPlayerContext con sus rondas reales
 *  2. executeTool sobre sus rondas
 *  3. decide() del decision engine con sus patrones reales
 *  4. validateResponse con su lista de canchas
 *  5. Schema del endpoint acepta payload sanitizado de su sesión actual
 *
 * Uso:
 *   npx vitest run src/__tests__/integration/coach-e2e.test.ts
 *
 * Skipea automáticamente si no hay SUPABASE_SERVICE_ROLE_KEY (no rompe CI).
 */

import { describe, it, expect, beforeAll } from 'vitest'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { buildPlayerContext } from '@/golf/coach/context'
import { buildContextString } from '@/golf/coach/prompts'
import { executeTool } from '@/golf/coach/tools'
import { decide, type PatternRow } from '@/golf/coach/decision-engine'
import { PATTERNS } from '@/golf/coach/patterns'
import { validateResponse } from '@/golf/coach/hallucination-validator'
import { narrateEvent } from '@/lib/coach-event-narrator'
import { z } from 'zod'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
const TEST_EMAIL = process.env.COACH_E2E_EMAIL ?? 'juanjoselamarca@gmail.com'

const skipIfNoEnv = !url || !serviceKey

describe.skipIf(skipIfNoEnv)('Coach E2E — cerebro contra prod', () => {
  // El cuerpo de describe.skipIf se evalúa aunque skip=true, pero los hooks
  // (beforeAll) y los it() solo corren si el describe NO está skipeado.
  // Diferir createClient acá evita el crash "supabaseUrl is required" en CI
  // sin necesidad de URLs placeholder.
  let admin: SupabaseClient
  let userId: string
  let userName: string

  beforeAll(() => {
    admin = createClient(url!, serviceKey!)
  })

  it('encuentra al usuario en profiles', async () => {
    const { data: profile } = await admin
      .from('profiles')
      .select('id, name, indice')
      .eq('email', TEST_EMAIL)
      .maybeSingle()
    expect(profile, `No se encontró ${TEST_EMAIL}`).toBeTruthy()
    userId = profile!.id
    userName = profile!.name
  })

  it('tiene rondas y patterns para alimentar el cerebro', async () => {
    const [{ count: rounds }, { count: patterns }] = await Promise.all([
      admin.from('historical_rounds').select('id', { count: 'exact', head: true }).eq('user_id', userId),
      admin.from('player_patterns').select('id', { count: 'exact', head: true }).eq('user_id', userId).eq('status', 'active'),
    ])
    console.log(`  → ${userName}: ${rounds} rondas históricas, ${patterns} patterns activos`)
    expect(rounds).toBeGreaterThan(0)
  })

  it('buildPlayerContext arma contexto sin errores', async () => {
    const ctx = await buildPlayerContext(admin, userId)
    expect(ctx).toBeTruthy()
    expect(ctx.player.name).toBeTruthy()
    expect(Array.isArray(ctx.recent_rounds)).toBe(true)
    const str = buildContextString(ctx)
    expect(str.length).toBeGreaterThan(100)
    console.log(`  → contexto: ${str.length} chars · ${ctx.recent_rounds.length} rondas · plan_activo=${!!ctx.active_plan}`)
  }, 20000)

  it('executeTool get_latest_round trae la última ronda finalizada (o no la hay)', async () => {
    const r = await executeTool('get_latest_round', {}, {
      supabase: admin, userId, defaultRondaId: null, sessionId: null,
    })
    if (!r.ok) {
      console.log(`  → sin ronda libre finalizada (no es error real): ${r.error}`)
      expect(r.error).toMatch(/no tiene rondas libres|no encontrada/i)
    } else {
      console.log(`  → ronda OK`)
      expect(r.data).toBeTruthy()
    }
  }, 15000)

  it('executeTool get_recent_rounds devuelve resumen', async () => {
    const r = await executeTool('get_recent_rounds', { limit: 5 }, {
      supabase: admin, userId, defaultRondaId: null, sessionId: null,
    })
    expect(r.ok, r.ok ? '' : (r as { error: string }).error).toBe(true)
  }, 15000)

  it('executeTool get_all_rounds_summary computa agregados', async () => {
    const r = await executeTool('get_all_rounds_summary', {}, {
      supabase: admin, userId, defaultRondaId: null, sessionId: null,
    })
    expect(r.ok, r.ok ? '' : (r as { error: string }).error).toBe(true)
  }, 15000)

  it('decide engine elige un patrón ganador (vía decideForUser end-to-end)', async () => {
    const { decideForUser } = await import('@/golf/coach/decision-engine')
    const out = await decideForUser(admin, userId)
    console.log(`  → winner=${out.winningPattern?.pattern_id ?? 'none'} reason=${out.reason}`)
    // Si tiene patterns activos, el decision engine debe elegir uno.
    const { count: activeCount } = await admin
      .from('player_patterns')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('status', 'active')
    if ((activeCount ?? 0) > 0) {
      // Permitido: el winner es null SOLO si todos los patterns están fuera del registry.
      // Si hay >0 patterns Y todos en registry → debe haber winner.
      const knownIds = new Set(PATTERNS.map(p => p.id))
      const { data: all } = await admin
        .from('player_patterns')
        .select('pattern_type')
        .eq('user_id', userId)
        .eq('status', 'active')
      const known = (all ?? []).filter(p => knownIds.has(p.pattern_type)).length
      if (known > 0) {
        expect(out.winningPattern, 'Hay patterns activos en el registry pero no hay winner').toBeTruthy()
      }
    }
  }, 15000)

  it('validateResponse: legítimo no flaguea, inventado sí', async () => {
    const ctx = await buildPlayerContext(admin, userId)
    const knownCourses = ctx.recent_rounds.map(r => r.course_name).filter((s): s is string => !!s)
    const ok = validateResponse({
      response: 'Trabajá en tu rutina pre-shot esta semana.',
      contextString: buildContextString(ctx),
      toolResultsConcat: '',
      knownCourseNames: knownCourses,
    })
    expect(ok.flagged).toBe(false)
    const invented = validateResponse({
      response: 'Tu última ronda fue de 999 golpes en una cancha que no jugaste.',
      contextString: buildContextString(ctx),
      toolResultsConcat: '',
      knownCourseNames: knownCourses,
    })
    expect(invented.flagged).toBe(true)
  }, 15000)

  it('narrateEvent funciona con eventos sintéticos típicos', () => {
    const a = narrateEvent({ type: 'plan_assigned', payload: { pattern_id: 'three_putt_frequency' }, created_at: new Date().toISOString() })
    expect(a.title).toMatch(/plan/i)
    const b = narrateEvent({ type: 'tool_called', payload: { tool_name: 'get_latest_round', ok: true, ms: 100 }, created_at: new Date().toISOString() })
    expect(b.title).toMatch(/última ronda/i)
  })

  it('schema del endpoint acepta payload sanitizado de la sesión real', async () => {
    const schema = z.object({
      message: z.string().min(1).max(2000).optional(),
      messages: z.array(z.object({ role: z.string(), content: z.string().max(2000) })).max(50).optional(),
      session_id: z.string().uuid().optional(),
    })
    const { data: session } = await admin
      .from('taiger_sessions')
      .select('messages')
      .eq('user_id', userId)
      .eq('is_primary', true)
      .maybeSingle()
    const allMsgs = (Array.isArray(session?.messages) ? session.messages : []) as Array<{ role: string; content: string }>
    const safeMessages = allMsgs
      .filter(m => typeof m.content === 'string' && m.content.trim().length > 0)
      .slice(-30)
      .map(m => ({ role: m.role, content: m.content.length > 2000 ? m.content.slice(0, 2000) : m.content }))
    const result = schema.safeParse({ messages: [...safeMessages, { role: 'user', content: 'analiza mi última ronda' }] })
    if (!result.success) {
      console.error('Schema rechazó:', result.error.issues[0])
    }
    expect(result.success, result.success ? '' : `Schema rechaza: ${result.error.issues[0]?.message}`).toBe(true)
    console.log(`  → sesión actual: ${allMsgs.length} mensajes · payload sanitizado: ${safeMessages.length+1} mensajes`)
  }, 15000)
})
