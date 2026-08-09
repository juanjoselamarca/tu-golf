/**
 * Replay de la conversación real de Nicolás Claro contra el coach v3.
 *
 * Objetivo: ver qué respondería el coach v3 (cerebro_v3_enabled = true) a los
 * MISMOS 5 turnos de Nico, usando su data REAL (125 rondas) — sin tocar prod.
 *
 * Fidelidad:
 *  - system + tools = fuente única de prod (buildCoachSystem / buildCoachTools).
 *  - contexto = buildPlayerContext real sobre su user_id.
 *  - modelo = coachModel() (igual que prod).
 *  - executor: READS reales (executeTool / handleToolUse); los 3 WRITE-tools
 *    (set_target, remember_fact, save_plan) se INTERCEPTAN con no-op → 0 escritura.
 *
 * Uso:
 *   npx tsx --env-file=.env.local scripts/replay-nico-v3.ts
 */
import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@supabase/supabase-js'
import { buildPlayerContext } from '@/golf/coach/context'
import { buildContextString } from '@/golf/coach/prompts'
import { buildCoachSystem, buildCoachTools } from '@/golf/coach/build-system'
import { getOnboardingState } from '@/golf/coach/v3/onboarding'
import { executeTool } from '@/golf/coach/tools'
import { handleToolUse } from '@/golf/coach/v3/tools/handle-tool-use'
import { makeAnthropicExamLLM } from '@/golf/coach/v3/exam/anthropic-llm'
import { MAX_TOOL_ITERS } from '@/golf/coach/loop-config'
import { coachModel } from '@/golf/coach/model'

const NICO_ID = 'a6e0df09-e259-4229-bdb0-f1cb0558e98b'

// Los 5 turnos REALES de Nico (de taiger_sessions 4c2119ba).
const NICO_TURNS = [
  'Nada en particular, quiero bajar mis scores evitando tonteras',
  'En general reseteo bien, pero mi dificultad va mucho con fierros 150+ yardas o menos de 100',
  'Para 150+ tiene que ver con lograr distancia con los fierros y principalmente contacto. Siento que mi swing es o muy corto o malo porque en general pego fierros muy cortos.',
  'Si, en general lo tengo claro, pero dependo mucho del contacto',
  'Me cuesta el manejo de palo bajo 100. A veces es de contacto, pero en general es distancia',
]

const WRITE_TOOLS = new Set(['set_target', 'remember_fact', 'save_plan'])

async function main() {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) throw new Error('Falta ANTHROPIC_API_KEY')
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const svc = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !svc) throw new Error('Falta NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY')

  const supabase = createClient(url, svc)
  const anthropic = new Anthropic({ apiKey })
  const llm = makeAnthropicExamLLM(anthropic)

  console.log(`\n=== REPLAY Nico Claro vs coach v3 — modelo: ${coachModel()} ===\n`)

  // Contexto real + flag ON + onboarding real.
  const ctx = await buildPlayerContext(supabase, NICO_ID)
  const contextString = buildContextString(ctx)
  const ob = await getOnboardingState(supabase, NICO_ID).catch(() => ({ onboarded: true }))
  const systemFinal = buildCoachSystem({ contextString, cerebroV3Enabled: true, onboarded: ob.onboarded })
  const tools = buildCoachTools({ cerebroV3Enabled: true })

  console.log(`onboarded=${ob.onboarded} · contexto=${contextString.length} chars · tools=${tools.length}\n`)

  const toolCtx = { supabase, userId: NICO_ID, defaultRondaId: null, sessionId: null }

  // Executor: reads reales, writes no-op, RAG por handleToolUse.
  const execute = async (name: string, input: Record<string, unknown>): Promise<unknown> => {
    if (WRITE_TOOLS.has(name)) {
      return { ok: true, data: { saved: true, _noop: true, echo: input } }
    }
    if (name === 'search_knowledge_chunks') {
      const tr = await handleToolUse(
        { tool_use_id: 'x', name, input: input as { query?: string } },
        { userId: NICO_ID },
      )
      try { return JSON.parse(tr.content) } catch { return { raw: tr.content } }
    }
    return await executeTool(name, input, toolCtx)
  }

  // Driver multi-turn: conserva historial entre los 5 turnos.
  const conversation: Array<{ role: 'user' | 'assistant'; content: unknown }> = []

  for (let t = 0; t < NICO_TURNS.length; t++) {
    const userTurn = NICO_TURNS[t]
    conversation.push({ role: 'user', content: userTurn })
    console.log(`\n────────────────────────────────────────────────────────`)
    console.log(`👤 NICO (turno ${t + 1}): ${userTurn}`)

    const toolsUsed: string[] = []
    let finalText = ''

    for (let iter = 0; iter < MAX_TOOL_ITERS; iter++) {
      const resp = await llm({ system: systemFinal, messages: conversation, tools: tools as unknown[] })
      if (resp.stopReason === 'tool_use' && resp.toolUses.length > 0) {
        conversation.push({ role: 'assistant', content: resp.assistantBlocks })
        const toolResults: Array<{ type: 'tool_result'; tool_use_id: string; content: string }> = []
        for (const tu of resp.toolUses) {
          toolsUsed.push(tu.name)
          const result = await execute(tu.name, tu.input)
          toolResults.push({ type: 'tool_result', tool_use_id: tu.id, content: JSON.stringify(result) })
        }
        conversation.push({ role: 'user', content: toolResults })
        continue
      }
      finalText = resp.text
      break
    }

    // Reemplazar los bloques intermedios por el texto final como assistant limpio,
    // para que el próximo turno vea un historial natural user/assistant.
    // (dejamos los tool_use/tool_result en el historial: son válidos para la API)
    conversation.push({ role: 'assistant', content: finalText })

    console.log(`🛠️  tools: ${toolsUsed.length ? toolsUsed.join(', ') : '(ninguna)'}`)
    console.log(`\n🤖 COACH v3:\n${finalText}\n`)
  }

  console.log(`\n=== FIN REPLAY ===\n`)
}

main().catch((e) => {
  console.error('REPLAY ERROR:', e)
  process.exit(1)
})
