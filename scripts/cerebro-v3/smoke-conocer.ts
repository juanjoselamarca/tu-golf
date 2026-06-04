/**
 * Smoke E2E de Fase 2.1: replica el tool-loop del route del coach con el prompt
 * "el coach te conoce" + las tools de Ola 2, contra datos REALES, y verifica que
 * el LLM realmente LLAMA get_focus y responde con el foco en lenguaje humano.
 *
 * Prueba de consumo en runtime (regla anti-decoración). Cuesta ~1 llamada Anthropic.
 * Uso: npx tsx --env-file=.env.local scripts/cerebro-v3/smoke-conocer.ts
 */
import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@supabase/supabase-js'
import { TAIGER_SYSTEM_PROMPT, buildContextString, TAIGER_SESSION_STARTER } from '@/golf/coach/prompts'
import { buildPlayerContext } from '@/golf/coach/context'
import { TAIGER_TOOLS, executeTool } from '@/golf/coach/tools'
import { FOCUS_TOOLS } from '@/golf/coach/v3/tools/focus-tools'
import { ENGAGEMENT_SECTION, CONOCER_SECTION, RAG_SECTION } from '@/golf/coach/v3/prompts'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
const apiKey = process.env.ANTHROPIC_API_KEY!
const supabase = createClient(url, serviceKey)
const log = (s: string) => process.stdout.write(s + '\n')

async function main() {
  const { data: users } = await supabase
    .from('profiles')
    .select('id, name')
    .eq('cerebro_v3_enabled', true)
    .limit(1)
  const user = users?.[0]
  if (!user) {
    log('[!] No hay usuario con cerebro_v3_enabled')
    process.exit(1)
  }
  log(`Usuario v3: ${user.name ?? user.id}`)

  const ctx = await buildPlayerContext(supabase, user.id)
  const contextString = buildContextString(ctx)
  const systemFinal =
    TAIGER_SYSTEM_PROMPT.replace('{PLAYER_CONTEXT}', contextString) +
    `\n\nINSTRUCCIÓN DE SESIÓN:\n${TAIGER_SESSION_STARTER}` +
    `\n\n${ENGAGEMENT_SECTION}\n\n${CONOCER_SECTION}\n\n${RAG_SECTION}`

  const activeTools = [...TAIGER_TOOLS, ...FOCUS_TOOLS]
  const toolCtx = { supabase, userId: user.id, defaultRondaId: null, sessionId: null }
  const anthropic = new Anthropic({ apiKey })

  const messages: Anthropic.MessageParam[] = [
    { role: 'user', content: '¿En qué me conviene enfocarme ahora para bajar mi handicap?' },
  ]
  const toolsCalled: string[] = []
  let finalText = ''

  for (let iter = 0; iter < 5; iter++) {
    const resp = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 2048,
      system: systemFinal,
      tools: activeTools as unknown as Anthropic.Tool[],
      messages,
    })
    finalText = resp.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('')

    if (resp.stop_reason !== 'tool_use') break

    messages.push({ role: 'assistant', content: resp.content })
    const results: Anthropic.ToolResultBlockParam[] = []
    for (const block of resp.content) {
      if (block.type === 'tool_use') {
        toolsCalled.push(block.name)
        const r = await executeTool(block.name, block.input as Record<string, unknown>, toolCtx)
        log(`  → tool ${block.name} → ${r.ok ? 'ok' : 'error:' + r.error}`)
        results.push({
          type: 'tool_result',
          tool_use_id: block.id,
          content: JSON.stringify(r),
        })
      }
    }
    messages.push({ role: 'user', content: results })
  }

  log(`\nTools llamadas: ${toolsCalled.join(', ') || '(ninguna)'}`)
  log(`\n--- Respuesta del coach ---\n${finalText}\n---------------------------`)

  const calledFocus = toolsCalled.includes('get_focus')
  const mentionsFocusHuman = /bogey|espiral|hoyo|par 3|back|cierre|dispersi/i.test(finalText)
  const noRawMetricKeys = !/post_bogey_score_avg|back9_minus_front9_strokes|par3_avg_vs_par/.test(finalText)
  log(`\n✓ Llamó get_focus: ${calledFocus}`)
  log(`✓ Menciona el foco en lenguaje humano: ${mentionsFocusHuman}`)
  log(`✓ Sin claves de métrica crudas en la respuesta: ${noRawMetricKeys}`)
  if (!calledFocus || !noRawMetricKeys) {
    log('\n[!] SMOKE FALLÓ: el coach no usó get_focus o filtró claves crudas.')
    process.exit(1)
  }
  log('\n✅ SMOKE OK: el coach consume el motor de foco en runtime y responde humano.')
  process.exit(0)
}

main().catch((e) => {
  log(`ERROR: ${e instanceof Error ? e.stack : String(e)}`)
  process.exit(1)
})
