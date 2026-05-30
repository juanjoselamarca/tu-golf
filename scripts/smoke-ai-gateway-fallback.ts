/**
 * Smoke del FALLBACK del AI Gateway a Gemini para la ruta del asistente de torneo.
 * Verifica que, cuando Anthropic cae y la cadena salta a Gemini, el proveedor de
 * fallback devuelve JSON parseable con el shape que la ruta espera
 * ({config_partial, explanation, needs_confirmation}). Protege CERO FALLOS en el
 * path de degradación (que un golfista nunca reciba 502 por JSON inválido).
 *
 * Uso:
 *   node --env-file=.env.local ./node_modules/tsx/dist/cli.mjs scripts/smoke-ai-gateway-fallback.ts
 */
import { callLLM } from '../src/lib/ai/index'
import { TOURNAMENT_ASSISTANT_PROMPT_V1 } from '../src/lib/prompts/tournament-assistant-v1'

const currentConfig = { format: null, pending_confirmations: [] as string[] }
const message = 'Quiero un torneo stableford para 24 jugadores, en equipos de 2 personas.'

async function main() {
  const r = await callLLM({
    role: 'evaluator',
    chain: ['google/gemini-2.5-flash-lite'], // fuerza el path de fallback
    system:
      TOURNAMENT_ASSISTANT_PROMPT_V1 + `\n\nConfig actual:\n${JSON.stringify(currentConfig, null, 2)}`,
    messages: [{ role: 'user', content: message }],
    maxTokens: 1024,
    temperature: 1,
    responseJson: true,
    timeoutMs: 20000,
  })
  console.log(
    `provider=${r.provider} model=${r.model} tokens=${r.tokensIn}/${r.tokensOut} latency=${r.latencyMs}ms`,
  )

  // Replica el parsing EXACTO de la ruta.
  const start = r.text.indexOf('{')
  const end = r.text.lastIndexOf('}')
  const json = JSON.parse(r.text.slice(start, end + 1))
  const okShape =
    typeof json === 'object' &&
    json !== null &&
    typeof json.config_partial === 'object' &&
    typeof json.explanation === 'string'

  console.log('config_partial keys:', Object.keys(json.config_partial ?? {}))
  console.log('needs_confirmation:', json.needs_confirmation)
  if (!okShape) {
    console.error('❌ SHAPE INVÁLIDO — Gemini NO sirve como fallback sin ajuste')
    process.exit(1)
  }
  console.log('✅ Gemini fallback produce JSON parseable con shape correcto')
}

main().catch((e) => {
  console.error('❌ smoke falló:', e?.message ?? e)
  process.exit(1)
})
