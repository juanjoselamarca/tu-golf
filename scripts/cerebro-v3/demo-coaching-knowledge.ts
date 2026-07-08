/**
 * DEMO 1c/1d (regla #4) — el coach cita estrategia + psicología desde el RAG.
 *
 * Parte 1 (sin créditos Anthropic — solo Gemini free tier): muestra qué chunks
 *   del corpus de coaching devuelve el read-path REAL (searchKnowledgeChunks)
 *   para una consulta de estrategia y una de psicología. Prueba que el corpus
 *   es alcanzable end-to-end (embed → hybrid → rerank → hydrate).
 * Parte 2 (LLM en vivo, best-effort): el coach REAL (Sonnet) con RAG_SECTION +
 *   la tool, respondiendo una consulta que mezcla estrategia y mente. Si no hay
 *   saldo Anthropic, se reporta y la Parte 1 igual demuestra el valor.
 *
 * Uso: npx tsx --env-file=.env.local scripts/cerebro-v3/demo-coaching-knowledge.ts
 */
import Anthropic from '@anthropic-ai/sdk'
import { searchKnowledgeChunks } from '@/golf/coach/v3/retrieval'
import { SEARCH_KNOWLEDGE_TOOL } from '@/golf/coach/v3/tools/search-knowledge-chunks-tool'
import { handleToolUse } from '@/golf/coach/v3/tools/handle-tool-use'
import { RAG_SECTION } from '@/golf/coach/v3/prompts'

const log = (s: string) => process.stdout.write(s + '\n')

async function showRetrieval(label: string, query: string, blockKey: string) {
  log(`\n  ── ${label} ──`)
  log(`  query: "${query}"`)
  const chunks = await searchKnowledgeChunks(query, { blockKey, topK: 3 })
  if (!chunks.length) {
    log(`    (sin chunks sobre el piso de relevancia)`)
    return
  }
  chunks.forEach((c, i) => {
    const snippet = c.content.length > 160 ? c.content.slice(0, 157) + '…' : c.content
    log(`    ${i + 1}. [${c.sourceJurisdiction}] ${c.breadcrumb}`)
    log(`       final=${c.scores.final.toFixed(3)} · ${snippet}`)
  })
}

async function part1() {
  log(`\n══ PARTE 1 — read-path real del corpus de coaching (Gemini, sin créditos) ══`)
  await showRetrieval(
    'ESTRATEGIA (1c)',
    'cómo conviene jugar un par 5 largo cuando no llego al green en dos golpes',
    'strategy',
  )
  await showRetrieval(
    'PSICOLOGÍA (1d)',
    'me pongo muy nervioso en el primer tee y en los últimos hoyos, ¿qué hago?',
    'psychology',
  )
}

async function part2() {
  log(`\n══ PARTE 2 — coach REAL citando (Anthropic, best-effort) ══`)
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    log(`  (sin ANTHROPIC_API_KEY — se salta; la Parte 1 ya prueba el read-path)`)
    return
  }
  const client = new Anthropic({ apiKey })
  const model = process.env.COACH_MODEL || 'claude-sonnet-4-5'
  const system = `Eres tAIger+, un entrenador de golf chileno. Hablás en tú/vos chileno, cálido y directo.\n\n${RAG_SECTION}`
  const userMsg =
    'Tengo un par 5 largo en el 7 que siempre arruino intentando llegar en dos, y encima me pongo muy nervioso en los últimos hoyos cuando voy bien. ¿Cómo lo encaro?'

  const messages: Anthropic.MessageParam[] = [{ role: 'user', content: userMsg }]

  try {
    let hops = 0
    while (hops < 4) {
      hops++
      const resp = await client.messages.create({
        model,
        max_tokens: 900,
        system,
        tools: [SEARCH_KNOWLEDGE_TOOL],
        messages,
      })
      const toolUses = resp.content.filter((b): b is Anthropic.ToolUseBlock => b.type === 'tool_use')
      const texts = resp.content.filter((b): b is Anthropic.TextBlock => b.type === 'text')

      if (toolUses.length) {
        messages.push({ role: 'assistant', content: resp.content })
        const results = []
        for (const tu of toolUses) {
          log(`  → tool_use: ${tu.name}(${JSON.stringify(tu.input)})`)
          const tr = await handleToolUse(
            { tool_use_id: tu.id, name: tu.name, input: tu.input as { query?: string } },
            {},
          )
          const parsed = JSON.parse(tr.content) as { chunks?: Array<{ breadcrumb: string }> }
          log(`     ← ${parsed.chunks?.length ?? 0} chunks (${(parsed.chunks ?? []).map((c) => c.breadcrumb).join(' | ')})`)
          results.push({ type: 'tool_result' as const, tool_use_id: tu.id, content: tr.content })
        }
        messages.push({ role: 'user', content: results })
        continue
      }

      log(`\n  ── Respuesta del coach ──`)
      log(texts.map((t) => t.text).join('\n'))
      break
    }
  } catch (e) {
    log(`  (Anthropic no disponible: ${(e as Error).message} — la Parte 1 igual prueba el valor)`)
  }
}

async function main() {
  log(`\n╔══ DEMO Cerebro V3 · Sub-olas 1c (estrategia) + 1d (psicología) ══╗`)
  await part1()
  await part2()
  log(`\n╚══ fin demo ══╝\n`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
