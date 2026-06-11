/**
 * Smoke de Fase 0 (coach data-access): prueba de consumo en runtime contra datos
 * REALES de que el coach AHORA alcanza su data. Determinista (executeTool directo,
 * sin LLM) + 1 vuelta real del LLM para verificar que LLAMA las tools y no inventa.
 *
 * Reproduce el P0 de campo (inbox 2026-06-09): rondas por cancha, pares por nombre,
 * y handicap de juego — todo sin pedirle nada al jugador.
 *
 * Uso: npx tsx --env-file=.env.local scripts/cerebro-v3/smoke-data-access.ts
 */
import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@supabase/supabase-js'
import { executeTool, type ToolExecutionContext } from '@/golf/coach/tools'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
const apiKey = process.env.ANTHROPIC_API_KEY
const supabase = createClient(url, serviceKey)
const log = (s: string) => process.stdout.write(s + '\n')
const j = (x: unknown) => JSON.stringify(x, null, 2)

async function main() {
  // Usuario real con el coach v3 activo (Juanjo).
  const { data: users } = await supabase
    .from('profiles')
    .select('id, name, indice, genero, default_tee_color')
    .eq('cerebro_v3_enabled', true)
    .limit(1)
  const user = users?.[0]
  if (!user) { log('[!] No hay usuario con cerebro_v3_enabled'); process.exit(1) }
  log(`\n=== Usuario real: ${user.name ?? user.id} ===`)
  log(`   índice=${user.indice} · género=${user.genero ?? '∅'} · tee=${user.default_tee_color ?? '∅'}\n`)

  const ctx: ToolExecutionContext = { supabase, userId: user.id, defaultRondaId: null, sessionId: null }

  // 1. find_rounds en una cancha por NOMBRE (antes el coach decía "no aparece nada").
  log('── 1. find_rounds({ course: "Lomas de la Dehesa" }) ──')
  const rounds = await executeTool('find_rounds', { course: 'Lomas de la Dehesa', limit: 5 }, ctx)
  if (rounds.ok) {
    const d = rounds.data as { count: number; rounds: Array<Record<string, unknown>>; resolved_course: unknown }
    log(`   ✅ ${d.count} rondas encontradas (cancha resuelta: ${j(d.resolved_course)})`)
    log(`   primera: ${j(d.rounds[0] ?? null)}`)
  } else log(`   ⚠️  ${rounds.error}`)

  // 2. get_course_scorecard por NOMBRE (antes el coach pedía los pares al jugador).
  log('\n── 2. get_course_scorecard({ course: "Lomas de la Dehesa" }) ──')
  const sc = await executeTool('get_course_scorecard', { course: 'Lomas de la Dehesa' }, ctx)
  if (sc.ok) {
    const d = sc.data as { id?: string; nombre?: string; par_total?: number; hoyos?: unknown[] }
    log(`   ✅ ${d.nombre} (course_id=${d.id}) · par ${d.par_total} · ${d.hoyos?.length ?? 0} hoyos con pares`)
  } else log(`   ⚠️  ${sc.error}`)

  // 3. get_playing_handicap (antes confundía índice con hcp de juego e inventaba).
  log('\n── 3. get_playing_handicap({ course: "Lomas de la Dehesa" }) ──')
  const ph = await executeTool('get_playing_handicap', { course: 'Lomas de la Dehesa' }, ctx)
  if (ph.ok) {
    const d = ph.data as Record<string, unknown>
    log(`   ✅ índice ${d.indice} → handicap de juego ${d.handicap_de_juego} (tee ${d.tee}, CR ${d.course_rating}, slope ${d.slope})`)
  } else log(`   ⚠️  ${ph.error} (degradación honesta, NO inventa)`)

  // 4. Vuelta real del LLM: ¿usa las tools y NO inventa? (cuesta ~1 llamada.)
  if (!apiKey) { log('\n[i] Sin ANTHROPIC_API_KEY — salto la vuelta LLM (los pasos 1-3 ya prueban el acceso a la data).'); return }
  log('\n── 4. Vuelta real del LLM: "¿cuál es mi handicap de juego en Lomas y cuántas rondas tengo ahí?" ──')
  try {
    const anthropic = new Anthropic({ apiKey })
    const tools = (await import('@/golf/coach/tools')).TAIGER_TOOLS as unknown as Anthropic.Tool[]
    const { ANTI_HALLUCINATION } = await import('@/golf/coach/prompts/anti_hallucination')
    const messages: Anthropic.MessageParam[] = [
      { role: 'user', content: `${ANTI_HALLUCINATION}\n\nUsá las tools. Pregunta del jugador: ¿cuál es mi handicap de juego en Lomas de la Dehesa y cuántas rondas tengo ahí?` },
    ]
    const called: string[] = []
    let finalText = ''
    for (let iter = 0; iter < 5; iter++) {
      const resp = await anthropic.messages.create({ model: 'claude-sonnet-4-6', max_tokens: 1024, tools, messages })
      const toolUses = resp.content.filter((c): c is Anthropic.ToolUseBlock => c.type === 'tool_use')
      finalText = resp.content.filter((c): c is Anthropic.TextBlock => c.type === 'text').map(c => c.text).join('')
      if (toolUses.length === 0) break
      messages.push({ role: 'assistant', content: resp.content })
      const results: Anthropic.ToolResultBlockParam[] = []
      for (const tu of toolUses) {
        called.push(tu.name)
        const r = await executeTool(tu.name, tu.input as Record<string, unknown>, ctx)
        results.push({ type: 'tool_result', tool_use_id: tu.id, content: j(r) })
      }
      messages.push({ role: 'user', content: results })
    }
    log(`   tools llamadas: ${called.join(', ') || '(ninguna)'}`)
    log(`   respuesta del coach:\n   "${finalText.trim()}"`)
    const usedHcp = called.includes('get_playing_handicap')
    const usedRounds = called.includes('find_rounds') || called.includes('get_recent_rounds')
    log(`\n   ${usedHcp ? '✅' : '❌'} llamó get_playing_handicap   ${usedRounds ? '✅' : '❌'} buscó rondas con tool`)
  } catch (e) {
    log(`   [i] La llamada Anthropic falló (${e instanceof Error ? e.message : e}). En prod esto dispara el fallback a Gemini.`)
  }
}

main().then(() => process.exit(0))
