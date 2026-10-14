/**
 * CANARIO ANTI-HUÉRFANOS — Ola 1b "priors externos por capas".
 *
 * Mismo espíritu que canary-cerebro-wiring (2-jun): ninguna pieza de 1b puede
 * declararse "completa" sin un consumidor en el camino de ejecución real.
 *
 * Falla si (spec §5.3):
 *   - `field_context` no está registrado en el dispatcher (tools.ts) u ofrecido al
 *     modelo (route.ts).
 *   - `shrink()` no se invoca desde select-focus.ts (el shrinkage quedaría huérfano).
 *   - el tool no consume los tres readers de capas.
 *
 * Asserts on the source that the pieces are still wired. The database layer lives in
 * src/__tests__/integration/external-priors-readers.test.ts.
 */
import { describe, it, expect } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'

const SRC = path.resolve(__dirname, '../../../..') // → src/

function readSrc(rel: string): string {
  const full = path.join(SRC, rel)
  if (!fs.existsSync(full)) throw new Error(`Pieza de wiring 1b no existe: ${rel}`)
  return fs.readFileSync(full, 'utf-8')
}

interface WiringContract {
  piece: string
  consumer: string
  needles: string[]
}

const ENFORCED: WiringContract[] = [
  {
    piece: 'field_context registrado en el dispatcher de tools del coach',
    consumer: 'golf/coach/tools.ts',
    needles: ["case 'field_context'", 'fieldContext('],
  },
  {
    piece: 'field_context ofrecido al modelo por el builder compartido (gated por el flag)',
    consumer: 'golf/coach/build-system.ts',
    needles: ['FIELD_CONTEXT_TOOL'],
  },
  {
    piece: 'shrinkage empirical-Bayes invocado desde select-focus (no huérfano)',
    consumer: 'golf/coach/v3/focus/select-focus.ts',
    needles: ['shrink(', "from '../priors/shrinkage'"],
  },
  {
    piece: 'priors externos (capa A) cargados por el orquestador de foco',
    consumer: 'golf/coach/v3/focus/get-focus.ts',
    needles: ['getInternalPrior', 'loadPriors'],
  },
  {
    piece: 'field_context consume las TRES capas de readers',
    consumer: 'golf/coach/v3/tools/field-context-tool.ts',
    needles: ['getBenchmarkMeanAtIndex', 'getPopulationPercentile', 'getCourseNorm', 'buildFieldContext'],
  },
  {
    piece: 'field_context computa el valor del jugador con la matemática de golf real',
    consumer: 'golf/coach/v3/tools/field-context-tool.ts',
    needles: ['measureFieldMetric'],
  },
  {
    piece: 'el coach sabe CUÁNDO usar field_context (prompt gated)',
    consumer: 'golf/coach/v3/prompts/sections/conocer.ts',
    needles: ['field_context'],
  },
]

describe('Canario 1b: piezas de priors externos siguen cableadas', () => {
  ENFORCED.forEach(({ piece, consumer, needles }) => {
    it(`"${piece}" sigue consumida por ${consumer}`, () => {
      const src = readSrc(consumer)
      needles.forEach((needle) => {
        expect(
          src.includes(needle),
          `DECORACIÓN 1b: "${piece}" perdió su consumidor. ${consumer} ya no referencia "${needle}". ` +
            `Reconectar o el build se cae (ver feedback_anti_decoracion_wiring).`,
        ).toBe(true)
      })
    })
  })
})
