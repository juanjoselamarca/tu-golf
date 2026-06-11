/**
 * Examen del coach (causa H) — runner ON-DEMAND.
 *
 * Corre el coach REAL (Anthropic, modelo coachModel()) contra la data sembrada
 * en memoria de cada captura y juzga cada respuesta con el juez semántico
 * (Gemini, gratis). Imprime PASS/FAIL por captura con la razón. Pensado para
 * validar el examen apenas vuelvan los créditos de Anthropic (la API key de la
 * app), sin esperar a un PR.
 *
 * Uso: npx tsx --env-file=.env.local scripts/cerebro-v3/run-coach-exam.ts
 *
 * Requiere ANTHROPIC_API_KEY (con saldo) + GEMINI_API_KEY en .env.local.
 */
import Anthropic from '@anthropic-ai/sdk'
import { runExamTurn } from '@/golf/coach/v3/exam/tool-loop'
import { buildMockExecuteTool } from '@/golf/coach/v3/exam/mock-executor'
import { makeAnthropicExamLLM } from '@/golf/coach/v3/exam/anthropic-llm'
import { judgeResponse } from '@/golf/coach/v3/exam/judge'
import { EXAM_CASES } from '@/golf/coach/v3/exam/fixtures'
import { TAIGER_SYSTEM_PROMPT } from '@/golf/coach/prompts'
import { TOOLS_INSTRUCTION } from '@/golf/coach/prompts/tools-instruction'
import { TAIGER_TOOLS } from '@/golf/coach/tools'

async function main() {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) throw new Error('Falta ANTHROPIC_API_KEY')
  if (!process.env.GEMINI_API_KEY) throw new Error('Falta GEMINI_API_KEY (juez)')

  const anthropic = new Anthropic({ apiKey })
  const llm = makeAnthropicExamLLM(anthropic)
  const system = `${TAIGER_SYSTEM_PROMPT}\n\nINSTRUCCIÓN DE SESIÓN:\nResponde la consulta del jugador.${TOOLS_INSTRUCTION}`

  let passed = 0
  const failures: string[] = []
  for (const caso of EXAM_CASES) {
    const exec = buildMockExecuteTool(caso.seed)
    const turn = await runExamTurn({
      system,
      userMessage: caso.userMessage,
      tools: [...TAIGER_TOOLS] as unknown[],
      executeTool: exec,
      llm,
    })
    const verdict = await judgeResponse({
      userMessage: caso.userMessage,
      finalText: turn.finalText,
      toolsUsed: turn.toolsUsed,
      rubric: caso.rubric,
    })
    if (verdict.pass) {
      passed++
      console.log(`✅ ${caso.id}  (tools: ${turn.toolsUsed.join(', ') || 'ninguna'})`)
    } else {
      failures.push(caso.id)
      console.log(`❌ ${caso.id}`)
      console.log(`   razones: ${verdict.reasons.join(' | ')}`)
      console.log(`   respuesta: "${turn.finalText.slice(0, 240)}"`)
    }
  }

  console.log(`\nExamen: ${passed}/${EXAM_CASES.length} capturas PASS`)
  if (failures.length) {
    console.log(`Capturas que FALLAN (hueco real del coach): ${failures.join(', ')}`)
    process.exit(1)
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
