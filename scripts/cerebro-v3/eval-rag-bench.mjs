#!/usr/bin/env node
/**
 * eval-rag-bench.mjs — Banco de regresión del retrieval RAG (sub-ola 1e, Task 24).
 *
 * 20 queries reales de reglas/handicap. Gate: ≥90% (18/20) con ≥2 chunks
 * sobre final_score 0.4. Se corre tras la ingesta real (Task 26) y en cada
 * cambio del parser/embedding/alpha para detectar regresiones.
 *
 * Uso:
 *   node_modules/.bin/tsx --env-file=.env.local scripts/cerebro-v3/eval-rag-bench.mjs
 *
 * Importa el motor de retrieval TypeScript real vía tsx. Default-import: tsx
 * transpila el .ts a CJS (proyecto CJS), exports vienen en el default.
 */
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import retrieval from '../../src/golf/coach/v3/retrieval/index.ts'
const { searchKnowledgeChunks } = retrieval

const SCORE_FLOOR = 0.4
const MIN_CHUNKS = 2
const GATE = 0.9

const here = dirname(fileURLToPath(import.meta.url))
const queries = JSON.parse(
  await readFile(resolve(here, 'eval-rag-bench.queries.json'), 'utf8'),
)

// Espaciado entre queries: el retrieval ahora corre el reranker (Gemini). En
// corridas rápidas seguidas el free tier rate-limitea → timeouts falsos. 4s
// mantiene bajo el RPM. En prod las queries van de a una (no aplica).
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const QUERY_GAP_MS = 4000

let pass = 0
let fail = 0
const results = []

for (const { id, query, expect_topic } of queries) {
  let chunks = []
  try {
    chunks = await searchKnowledgeChunks(query, { topK: 5 })
  } catch (e) {
    console.log(`✗ ${id}  ${query}  (ERROR: ${e.message})`)
    fail++
    results.push({ id, query, expect_topic, ok: false, error: e.message })
    continue
  }
  const above = chunks.filter((c) => c.scores.final > SCORE_FLOOR)
  const ok = above.length >= MIN_CHUNKS
  ok ? pass++ : fail++
  const top = chunks[0]
  results.push({
    id,
    query,
    expect_topic,
    ok,
    topScore: top?.scores.final ?? null,
    top1: top?.breadcrumb ?? null,
  })
  console.log(
    `${ok ? '✓' : '✗'} ${id}  ${query}  top=${top?.scores.final?.toFixed(2) ?? '-'}  (${top?.breadcrumb ?? '—'})`,
  )
  await sleep(QUERY_GAP_MS)
}

const total = pass + fail
const rate = total > 0 ? pass / total : 0
console.log(`\n${pass}/${total} (${(rate * 100).toFixed(1)}%) PASS`)

if (rate < GATE) {
  console.error(`Gate FAILED: ${(rate * 100).toFixed(1)}% < ${GATE * 100}% requerido`)
  process.exit(1)
}
console.log(`Gate OK: ≥${GATE * 100}%`)
