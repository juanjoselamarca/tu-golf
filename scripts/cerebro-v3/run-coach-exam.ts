/**
 * Examen del coach (Fase 0 Combo IA) — runner LIVE puntuado.
 *
 * Corre el coach REAL (Anthropic, coachModel() o COACH_EXAM_MODEL) contra la data
 * sembrada de cada caso golden; juzga cada respuesta con (1) el juez de correctness
 * (must/mustNot) y (2) el juez de las 6 piezas; escribe una traza por caso en
 * coach_eval_traces; computa el scorecard y lo compara contra docs/cerebro-v3/
 * exam-baseline.json. Sale ≠0 si la calidad regresó (gate).
 *
 *   npx tsx --env-file=.env.local scripts/cerebro-v3/run-coach-exam.ts
 *   npx tsx --env-file=.env.local scripts/cerebro-v3/run-coach-exam.ts --update-baseline
 *
 * Requiere ANTHROPIC_API_KEY (con saldo) + GEMINI_API_KEY (jueces) +
 * NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (trazas) en .env.local.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@supabase/supabase-js'
import { runExamTurn } from '@/golf/coach/v3/exam/tool-loop'
import { buildMockExecuteTool } from '@/golf/coach/v3/exam/mock-executor'
import { makeAnthropicExamLLM } from '@/golf/coach/v3/exam/anthropic-llm'
import { judgeResponse } from '@/golf/coach/v3/exam/judge'
import { judgeSixPieces } from '@/golf/coach/v3/exam/quality-judge'
import { EXAM_CASES } from '@/golf/coach/v3/exam/fixtures'
import { buildExamSystem } from '@/golf/coach/v3/exam/build-exam-system'
import { TAIGER_TOOLS } from '@/golf/coach/tools'
import { coachModel } from '@/golf/coach/model'
import { writeExamTraces, type ExamTraceRow } from '@/golf/coach/v3/exam/exam-traces'
import { buildScorecard, compareToBaseline, type CaseResult, type Scorecard } from '@/golf/coach/v3/exam/scorecard'

const BASELINE_PATH = resolve(process.cwd(), 'docs/cerebro-v3/exam-baseline.json')
const TOL = { passRateTol: 0.05, sixPiecesTol: 0.3 }

async function main() {
  const updateBaseline = process.argv.includes('--update-baseline')
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) throw new Error('Falta ANTHROPIC_API_KEY')
  if (!process.env.GEMINI_API_KEY) throw new Error('Falta GEMINI_API_KEY (jueces)')
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const svc = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !svc) throw new Error('Faltan NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY (trazas)')

  const model = process.env.COACH_EXAM_MODEL || coachModel()
  const anthropic = new Anthropic({ apiKey })
  const llm = makeAnthropicExamLLM(anthropic)
  const admin = createClient(url, svc)
  // run_id por timestamp (pasable por env; Date no está disponible en algunos harness).
  const runId = process.env.COACH_EXAM_RUN_ID || `exam-${new Date().toISOString()}`

  const results: CaseResult[] = []
  const traces: ExamTraceRow[] = []

  for (const caso of EXAM_CASES) {
    const exec = buildMockExecuteTool(caso.seed)
    const turn = await runExamTurn({
      system: buildExamSystem(caso.seed),
      userMessage: caso.userMessage,
      tools: [...TAIGER_TOOLS] as unknown[],
      executeTool: exec,
      llm,
    })
    const correctness = await judgeResponse({
      userMessage: caso.userMessage,
      finalText: turn.finalText,
      toolsUsed: turn.toolsUsed,
      rubric: caso.rubric,
    })
    let sixScore: number | null = null
    let sixMissing: string[] = []
    if (caso.sixPieces?.applicable) {
      const six = await judgeSixPieces({ userMessage: caso.userMessage, finalText: turn.finalText })
      sixScore = six.score
      sixMissing = six.missing
    }
    // correctnessPass del caso: el juez must/mustNot Y (si aplica) el umbral de 6 piezas.
    const sixOk = !caso.sixPieces?.applicable || (sixScore ?? 0) >= caso.sixPieces.minScore
    const casePass = correctness.pass && sixOk

    results.push({
      caseId: caso.id,
      tags: caso.tags,
      correctnessPass: casePass,
      sixPiecesApplicable: !!caso.sixPieces?.applicable,
      sixPiecesScore: sixScore,
    })
    traces.push({
      run_id: runId,
      case_id: caso.id,
      tags: caso.tags,
      coach_model: model,
      user_message: caso.userMessage,
      final_text: turn.finalText,
      tools_used: turn.toolsUsed,
      correctness_pass: correctness.pass,
      correctness_reasons: correctness.reasons,
      six_pieces_applicable: !!caso.sixPieces?.applicable,
      six_pieces_score: sixScore,
      six_pieces_missing: sixMissing,
    })
    const tag = casePass ? '✅' : '❌'
    console.log(`${tag} ${caso.id} [${caso.tags.join(',')}] (tools: ${turn.toolsUsed.join(', ') || 'ninguna'})`)
    if (!casePass) {
      if (correctness.reasons.length) console.log(`   correctness: ${correctness.reasons.join(' | ')}`)
      if (sixMissing.length) console.log(`   6-piezas faltantes: ${sixMissing.join(', ')}`)
    }
  }

  await writeExamTraces(admin, traces)
  const scorecard = buildScorecard(results)
  console.log(
    `\nScorecard: correctness ${(scorecard.correctnessPassRate * 100).toFixed(0)}% · 6-piezas ${scorecard.sixPiecesAvg.toFixed(2)}/6 · ${scorecard.total} casos · trazas escritas (run ${runId})`,
  )

  if (updateBaseline) {
    const out: Scorecard = scorecard
    writeFileSync(BASELINE_PATH, JSON.stringify(out, null, 2) + '\n')
    console.log(`\n📌 Baseline actualizado en ${BASELINE_PATH}`)
    return
  }

  const baseline = JSON.parse(readFileSync(BASELINE_PATH, 'utf8')) as Scorecard
  const cmp = compareToBaseline(scorecard, baseline, TOL)
  if (cmp.regressed) {
    console.log(`\n❌ REGRESIÓN de calidad del coach:\n - ${cmp.reasons.join('\n - ')}`)
    process.exit(1)
  }
  console.log(`\n✅ Sin regresión vs baseline (tol pass-rate ${TOL.passRateTol}, 6-piezas ${TOL.sixPiecesTol}).`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
