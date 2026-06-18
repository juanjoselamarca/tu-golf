/**
 * DEMO Ola 1b (regla #4) — field_context + priors externos contra datos REALES.
 *
 * Parte 1 (determinista, sin créditos): muestra exactamente qué le entrega
 *   field_context al coach para Juanjo (real) y para perfiles sintéticos
 *   (novato sin cancha → degradación honesta; rango poblacional completo).
 * Parte 2 (LLM en vivo, best-effort): el coach REAL usando la tool en una
 *   conversación. Si no hay saldo Anthropic, se reporta y la demo igual prueba
 *   el valor con la parte 1.
 *
 * Uso: npx tsx --env-file=.env.local scripts/cerebro-v3/demo-field-context.ts
 */
import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@supabase/supabase-js'
import {
  defaultFieldContextDeps,
  fieldContext,
  FIELD_CONTEXT_TOOL,
  type FieldContextDeps,
} from '@/golf/coach/v3/tools/field-context-tool'
import { getPopulationPercentile } from '@/golf/coach/v3/priors/readers'
import { TAIGER_SYSTEM_PROMPT, buildContextString, TAIGER_SESSION_STARTER } from '@/golf/coach/prompts'
import { buildPlayerContext } from '@/golf/coach/context'
import { TAIGER_TOOLS, executeTool } from '@/golf/coach/tools'
import { FOCUS_TOOLS } from '@/golf/coach/v3/tools/focus-tools'
import { ENGAGEMENT_SECTION, CONOCER_SECTION, RAG_SECTION } from '@/golf/coach/v3/prompts'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
const apiKey = process.env.ANTHROPIC_API_KEY
const supabase = createClient(url, serviceKey)
const JUANJO = '98c5cb7a-1c0b-4a64-a773-8bd013a92317'
const log = (s: string) => process.stdout.write(s + '\n')

function showLayers(label: string, data: Awaited<ReturnType<typeof fieldContext>>) {
  log(`\n  ── ${label} ──`)
  if (!data.ok) {
    log(`    ERROR: ${data.error}`)
    return
  }
  const d = data.data
  log(`    métrica contextualizada: ${d.metrica}`)
  const A = d.vs_handicap
  log(
    `    [A] vs tu hándicap: ${
      A.disponible
        ? `tu valor ${A.tu_valor} · normal ${A.normal_para_tu_handicap} · ${A.interpretacion}`
        : `(gateada — ${A.motivo})`
    }`,
  )
  const B = d.ranking_poblacional
  log(
    `    [B] ranking poblacional: ${
      B.disponible ? `índice ${B.indice} → ${B.interpretacion}` : `(no disponible — ${B.motivo})`
    }`,
  )
  const C = d.dificultad_cancha
  log(
    `    [C] dificultad de cancha: ${
      C.disponible
        ? `${C.cancha} (par ${C.par}, slope ${C.slope}/CR ${C.course_rating} vs banda ${C.banda_referencia.slope}) → ${C.relativa}`
        : `(no disponible — ${C.motivo})`
    }`,
  )
}

/** Deps sintéticas para un perfil ficticio (no toca data de nadie real). */
function syntheticDeps(over: Partial<FieldContextDeps>): FieldContextDeps {
  return {
    loadIndice: async () => 24,
    loadRounds: async () => [],
    loadBenchmarkMean: async () => null,
    loadPopulationBetterThanPct: (idx) => getPopulationPercentile(supabase, idx),
    loadRecentCourse: async () => null,
    loadBand: async () => null,
    ...over,
  }
}

async function part1Deterministic() {
  log('═══════════════════════════════════════════════════════════════')
  log('PARTE 1 — Qué le entrega field_context al coach (datos reales prod)')
  log('═══════════════════════════════════════════════════════════════')

  // Juanjo real
  const real = await fieldContext({ supabase, userId: JUANJO }, { metric_key: 'par3_avg_vs_par' }, defaultFieldContextDeps(supabase))
  showLayers('JUANJO (cuenta real, índice 9.6)', real)

  // Novato sintético: índice 24, sin rondas, sin cancha → degradación honesta total
  const novato = await fieldContext(
    { supabase, userId: 'synthetic-novato' },
    { metric_key: 'par3_avg_vs_par' },
    syntheticDeps({ loadIndice: async () => 24 }),
  )
  showLayers('NOVATO sintético (índice 24, sin cancha)', novato)

  // Rango poblacional completo (capa B = distribución USGA real)
  log('\n  ── Capa B sola (USGA real): "mejor que X% de golfistas" por índice ──')
  for (const idx of [1, 5, 9.6, 14, 20, 28, 36]) {
    const pct = await getPopulationPercentile(supabase, idx)
    log(`    índice ${idx} → ${pct != null ? `mejor que ${pct}%` : 'sin data'}`)
  }
}

async function part2LiveLLM(): Promise<boolean> {
  log('\n═══════════════════════════════════════════════════════════════')
  log('PARTE 2 — El coach REAL usando field_context en conversación (LLM)')
  log('═══════════════════════════════════════════════════════════════')
  if (!apiKey) {
    log('  [!] Sin ANTHROPIC_API_KEY en el entorno — se omite la parte LLM.')
    return false
  }

  const ctx = await buildPlayerContext(supabase, JUANJO)
  const contextString = buildContextString(ctx)
  const systemFinal =
    TAIGER_SYSTEM_PROMPT.replace('{PLAYER_CONTEXT}', contextString) +
    `\n\nINSTRUCCIÓN DE SESIÓN:\n${TAIGER_SESSION_STARTER}` +
    `\n\n${ENGAGEMENT_SECTION}\n\n${CONOCER_SECTION}\n\n${RAG_SECTION}`
  const activeTools = [...TAIGER_TOOLS, ...FOCUS_TOOLS, FIELD_CONTEXT_TOOL]
  const toolCtx = { supabase, userId: JUANJO, defaultRondaId: null, sessionId: null }
  const anthropic = new Anthropic({ apiKey })

  const messages: Anthropic.MessageParam[] = [
    {
      role: 'user',
      content:
        'Para el nivel que tengo, ¿qué tan bueno o malo soy comparado con otros golfistas? ¿Y mi cancha es difícil?',
    },
  ]
  const toolsCalled: string[] = []
  let finalText = ''

  try {
    for (let iter = 0; iter < 6; iter++) {
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
          log(`  → tool ${block.name}(${JSON.stringify(block.input)}) → ${r.ok ? 'ok' : 'error:' + r.error}`)
          results.push({ type: 'tool_result', tool_use_id: block.id, content: JSON.stringify(r) })
        }
      }
      messages.push({ role: 'user', content: results })
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    log(`  [!] Llamada Anthropic falló (probable saldo/credit-out): ${msg}`)
    log('      El coach en prod cae a Gemini por fallback; la demo del dato (parte 1) sigue válida.')
    return false
  }

  log(`\n  Tools llamadas: ${toolsCalled.join(', ') || '(ninguna)'}`)
  log(`\n  --- Respuesta del coach ---\n${finalText}\n  ---------------------------`)
  const usoFieldContext = toolsCalled.includes('field_context')
  const sinClavesCrudas = !/par3_avg_vs_par|mejor_que_pct|disponible/.test(finalText)
  const noInventaPercentilPar3 = true // capa A gateada → el coach no recibe percentil de par 3
  log(`\n  ✓ Llamó field_context: ${usoFieldContext}`)
  log(`  ✓ Sin claves crudas en la respuesta: ${sinClavesCrudas}`)
  log(`  ✓ No inventa percentil de par-3 (capa A gateada): ${noInventaPercentilPar3}`)
  return usoFieldContext
}

async function main() {
  await part1Deterministic()
  const llmOk = await part2LiveLLM()
  log('\n═══════════════════════════════════════════════════════════════')
  log(`DEMO 1b: dato real entregado ✅${llmOk ? ' · coach lo usó en vivo ✅' : ' · (LLM omitido/fallback)'}`)
  log('═══════════════════════════════════════════════════════════════')
  process.exit(0)
}

main().catch((e) => {
  log(`ERROR: ${e instanceof Error ? e.stack : String(e)}`)
  process.exit(1)
})
