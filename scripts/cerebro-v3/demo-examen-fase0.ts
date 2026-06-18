/**
 * Demo de la Fase 0 — examen-máquina del coach (regla #4, sin gastar créditos
 * de Anthropic). El coach-bajo-examen necesita Anthropic (hoy en 0), pero el JUEZ
 * de 6 piezas corre sobre Gemini (gratis) → esta demo lo ejerce de verdad:
 *
 *  1. Juez de 6 piezas (Gemini real) sobre una respuesta de coaching COMPLETA → 6/6.
 *  2. Juez de 6 piezas sobre una respuesta INCOMPLETA (sin delta ni acción) → baja.
 *  3. Scorecard + gate: detecta una regresión simulada (pass-rate y cobertura).
 *  4. Tabla coach_eval_traces viva en prod (conteo).
 *
 * Uso: npx tsx --env-file=.env.local scripts/cerebro-v3/demo-examen-fase0.ts
 */
import { createClient } from '@supabase/supabase-js'
import { judgeSixPieces } from '@/golf/coach/v3/exam/quality-judge'
import { buildScorecard, compareToBaseline, type CaseResult } from '@/golf/coach/v3/exam/scorecard'
import { EXAM_CASES } from '@/golf/coach/v3/exam/fixtures'

const RESP_COMPLETA =
  'Juanjo, mirando tus últimas rondas en Lomas, tu mayor fuga está en los par 3: ' +
  'promediás 4.25 golpes cuando para tu índice lo normal es 3.59. Eso te está costando ' +
  'casi un golpe por ronda solo ahí, y es lo que más te separa de tu meta de handicap 7 ' +
  '(hoy estás en 9.6, te faltan ~2.6). Esta semana enfocate en una sola cosa: en cada par 3, ' +
  'elegí el palo para el centro del green, no para la bandera. Tee de seguridad, dos putts, par.'

const RESP_INCOMPLETA =
  'En los par 3 estás promediando 4.25 golpes, por encima de lo esperable para tu nivel. ' +
  'Es claramente una debilidad a trabajar.' // sin identidad clara por nombre, sin target/delta/acción concreta

async function main() {
  console.log('═══ DEMO Fase 0 — examen-máquina del coach ═══\n')

  console.log('① Juez de 6 piezas (Gemini real) sobre una respuesta de coaching COMPLETA:')
  const buena = await judgeSixPieces({ userMessage: '¿En qué me enfoco para bajar mi handicap?', finalText: RESP_COMPLETA })
  console.log(`   score: ${buena.score}/6 · faltan: ${buena.missing.join(', ') || '(ninguna)'}`)
  console.log(`   piezas: ${JSON.stringify(buena.pieces)}\n`)

  console.log('② Juez de 6 piezas sobre una respuesta INCOMPLETA (sin target/delta/acción):')
  const mala = await judgeSixPieces({ userMessage: '¿En qué me enfoco para bajar mi handicap?', finalText: RESP_INCOMPLETA })
  console.log(`   score: ${mala.score}/6 · faltan: ${mala.missing.join(', ') || '(ninguna)'}\n`)

  console.log('③ Scorecard + gate: regresión simulada vs un baseline sano.')
  const baselineSano = buildScorecard([
    { caseId: 'a', tags: [], correctnessPass: true, sixPiecesApplicable: true, sixPiecesScore: 6 },
    { caseId: 'b', tags: [], correctnessPass: true, sixPiecesApplicable: true, sixPiecesScore: 6 },
    { caseId: 'c', tags: [], correctnessPass: true, sixPiecesApplicable: false, sixPiecesScore: null },
  ])
  const corridaRegresada: CaseResult[] = [
    { caseId: 'a', tags: [], correctnessPass: true, sixPiecesApplicable: true, sixPiecesScore: 6 },
    { caseId: 'b', tags: [], correctnessPass: false, sixPiecesApplicable: true, sixPiecesScore: 3 }, // empeoró
    { caseId: 'c', tags: [], correctnessPass: true, sixPiecesApplicable: false, sixPiecesScore: null },
  ]
  const sc = buildScorecard(corridaRegresada)
  const cmp = compareToBaseline(sc, baselineSano, { passRateTol: 0.05, sixPiecesTol: 0.3 })
  console.log(`   baseline: ${(baselineSano.correctnessPassRate * 100).toFixed(0)}% / 6-piezas ${baselineSano.sixPiecesAvg.toFixed(2)}`)
  console.log(`   corrida:  ${(sc.correctnessPassRate * 100).toFixed(0)}% / 6-piezas ${sc.sixPiecesAvg.toFixed(2)}`)
  console.log(`   ¿REGRESÓ? ${cmp.regressed ? 'SÍ (el gate bloquea el merge)' : 'no'}`)
  cmp.reasons.forEach((r) => console.log(`     - ${r}`))

  console.log('\n   Colapso de cobertura (se borraron casos):')
  const cmpCobertura = compareToBaseline(
    buildScorecard(corridaRegresada.slice(0, 1)),
    { ...baselineSano, total: 21 },
    { passRateTol: 0.05, sixPiecesTol: 0.3 },
  )
  console.log(`   ¿REGRESÓ? ${cmpCobertura.regressed ? 'SÍ' : 'no'} — ${cmpCobertura.reasons.join(' | ')}`)

  console.log(`\n④ Banco golden: ${EXAM_CASES.length} casos (${EXAM_CASES.filter((c) => c.sixPieces?.applicable).length} evalúan 6 piezas).`)

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const svc = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (url && svc) {
    const admin = createClient(url, svc)
    const { count, error } = await admin.from('coach_eval_traces').select('*', { count: 'exact', head: true })
    if (error) console.log(`   tabla coach_eval_traces: ERROR ${error.message}`)
    else console.log(`   tabla coach_eval_traces viva en prod ✅ (filas hoy: ${count ?? 0})`)
  }
  console.log('\n═══ fin demo ═══')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
