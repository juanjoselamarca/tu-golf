#!/usr/bin/env node
/**
 * Harness baseline del cerebro v3.
 *
 * Corre 5 perfiles sintéticos × N casos canario contra el system prompt v2
 * actual usando Anthropic SDK directo (sin pasar por /api/taiger/chat que
 * requiere auth y no acepta profile_override).
 *
 * Esto es la BASELINE de Ola 0 — el número que salga es el punto de
 * partida. Olas siguientes intentan superarlo con cerebro v3.
 *
 * Uso:
 *   node --env-file=.env.local scripts/evaluate-cerebro.mjs
 *
 * Env requerido:
 *   ANTHROPIC_API_KEY
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *
 * Costo aproximado: ~5 perfiles × 8 casos × ~2k tokens = 80k tokens haiku ≈ $0.04 USD.
 */
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@supabase/supabase-js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const profiles = JSON.parse(
  await fs.readFile(path.join(__dirname, 'cerebro/synthetic-profiles.json'), 'utf8'),
)
const cases = JSON.parse(
  await fs.readFile(path.join(__dirname, 'cerebro/canary-cases.json'), 'utf8'),
)

// Cargar el system prompt v2 actual. Lo leemos del barrel para ya validar
// que la refactorización de Task 10 no rompió la composición.
const promptModule = await import('../src/golf/coach/prompts/index.ts').catch(() => null)

let TAIGER_SYSTEM_PROMPT
if (promptModule?.TAIGER_SYSTEM_PROMPT) {
  TAIGER_SYSTEM_PROMPT = promptModule.TAIGER_SYSTEM_PROMPT
} else {
  // Fallback: leer del archivo crudo. ESM no carga .ts directo desde mjs sin loader.
  const raw = await fs.readFile(
    path.join(__dirname, '..', 'src', 'golf', 'coach', 'prompts.ts'),
    'utf8',
  )
  // El re-export apunta a ./prompts/index. Concatenamos los submódulos manualmente.
  const sections = await Promise.all([
    fs.readFile(path.join(__dirname, '..', 'src', 'golf', 'coach', 'prompts', 'identidad.ts'), 'utf8'),
    fs.readFile(path.join(__dirname, '..', 'src', 'golf', 'coach', 'prompts', 'anti_hallucination.ts'), 'utf8'),
    fs.readFile(path.join(__dirname, '..', 'src', 'golf', 'coach', 'prompts', 'plantillas.ts'), 'utf8'),
  ])
  const extractBacktick = src => {
    const m = src.match(/export const \w+ = `([\s\S]*?)`\s*$/m)
    return m ? m[1] : ''
  }
  const [identidad, antiHall, plantillas] = sections.map(extractBacktick)
  TAIGER_SYSTEM_PROMPT = [identidad, antiHall, plantillas, '{PLAYER_CONTEXT}'].join('\r\n\r\n')
}

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
)

function buildPlayerContextForProfile(profile) {
  return `Nombre: ${profile.name}
Handicap actual: ${profile.handicap}
Target: ${profile.target}
Frecuencia de juego: ${profile.frequency}
Tipo de jugador: ${profile.type}
Resumen: ${profile.context_summary}`
}

async function callCoach(profile, question) {
  const systemPrompt = TAIGER_SYSTEM_PROMPT.replace(
    '{PLAYER_CONTEXT}',
    buildPlayerContextForProfile(profile),
  )
  try {
    const resp = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1024,
      system: systemPrompt,
      messages: [{ role: 'user', content: question }],
    })
    const text = resp.content
      .filter(b => b.type === 'text')
      .map(b => b.text)
      .join('\n')
    return { ok: true, text, usage: resp.usage }
  } catch (e) {
    return { ok: false, error: e.message }
  }
}

function gradeResponse(testCase, response) {
  if (!response.ok) {
    return { pass: false, issues: [`call_failed: ${response.error}`] }
  }
  const text = response.text.toLowerCase()
  const issues = []

  if (testCase.must_not_invent) {
    for (const word of testCase.must_not_invent) {
      if (text.includes(word.toLowerCase())) {
        issues.push(`mentioned forbidden phrase "${word}"`)
      }
    }
  }

  if (testCase.must_say_one_of) {
    const matched = testCase.must_say_one_of.some(p => text.includes(p.toLowerCase()))
    if (!matched) {
      issues.push(`did not include any of: ${testCase.must_say_one_of.join(' | ')}`)
    }
  }

  return { pass: issues.length === 0, issues }
}

async function runHarness() {
  const results = []
  const total = profiles.length * cases.length
  let done = 0

  for (const profile of profiles) {
    for (const c of cases) {
      const resp = await callCoach(profile, c.question)
      const grade = gradeResponse(c, resp)
      results.push({
        profile: profile.name,
        case_id: c.id,
        pass: grade.pass,
        issues: grade.issues,
        response_snippet: (resp.text ?? resp.error ?? '').slice(0, 200),
        input_tokens: resp.usage?.input_tokens ?? null,
        output_tokens: resp.usage?.output_tokens ?? null,
      })
      done++
      process.stdout.write(grade.pass ? '.' : 'F')
      if (done % 10 === 0) process.stdout.write(` ${done}/${total} `)
    }
  }
  process.stdout.write('\n')

  const passed = results.filter(r => r.pass).length
  console.log(`\nBaseline harness: ${passed}/${results.length} pass (${((passed / results.length) * 100).toFixed(1)}%)`)

  const failByCase = {}
  for (const r of results.filter(r => !r.pass)) {
    failByCase[r.case_id] = (failByCase[r.case_id] || 0) + 1
  }
  if (Object.keys(failByCase).length > 0) {
    console.log('Failures por caso:')
    for (const [id, n] of Object.entries(failByCase).sort((a, b) => b[1] - a[1])) {
      console.log(`  ${id}: ${n}/${profiles.length}`)
    }
  }

  const { error } = await supabase.from('evaluation_runs').insert({
    triggered_by: 'baseline_ola_0',
    ola_version: 'baseline_v2',
    profiles_evaluated: profiles.map(p => p.name),
    results,
    pass: passed === results.length,
    evaluator_notes: `Baseline run de Ola 0 contra cerebro v2 actual con Haiku 4.5. ${passed}/${results.length} canarios pasan. Esto es el punto de partida — olas siguientes apuntan a 100%.`,
  })
  if (error) console.error('Error persistiendo run:', error.message)
  else console.log('Run persistido en evaluation_runs.')
}

runHarness().catch(e => {
  console.error(e)
  process.exit(1)
})
