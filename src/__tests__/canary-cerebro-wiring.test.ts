/**
 * CANARIO ANTI-DECORACIÓN — wiring real de cerebro v3
 *
 * Creado 2026-06-02 tras la auditoría de wiring
 * (docs/cerebro-v3-auditoria-wiring-2026-06-02.md).
 *
 * Regla permanente (memoria feedback_anti_decoracion_wiring): ninguna pieza de
 * cerebro v3 puede declararse "completa" sin un consumidor en el camino de
 * ejecución real del coach. Este test:
 *   - PROTEGE lo que YA está vivo: si alguien lo desconecta, el build se cae.
 *   - DOCUMENTA con it.todo lo que todavía NO está enchufado, para que nadie lo
 *     marque hecho antes de tiempo. Cuando una pieza se conecta, se mueve su
 *     contrato de `todo` a `enforced` (assertion real).
 *
 * Si este test falla, una pieza viva quedó huérfana → NO se puede pushear.
 */
import { describe, it, expect } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'

const SRC = path.resolve(__dirname, '..')

function readSrc(relativePath: string): string {
  const full = path.join(SRC, relativePath)
  if (!fs.existsSync(full)) {
    throw new Error(`Pieza de wiring no existe: ${relativePath}`)
  }
  return fs.readFileSync(full, 'utf-8')
}

/**
 * Contrato de wiring: una pieza (símbolo/módulo) que DEBE estar referenciada por
 * un archivo del request path real. needles = strings que prueban el consumo.
 */
interface WiringContract {
  piece: string
  consumer: string
  needles: string[]
}

const ENFORCED: WiringContract[] = [
  {
    piece: 'RAG reglas (tool search_knowledge_chunks)',
    consumer: 'app/api/taiger/chat/route.ts',
    needles: ['handle-tool-use', 'search-knowledge-chunks-tool'],
  },
  {
    piece: 'Sección engagement v3 en el system prompt',
    consumer: 'app/api/taiger/chat/route.ts',
    needles: ['ENGAGEMENT_SECTION'],
  },
  {
    piece: 'Retrieval RAG consumido por la tool',
    consumer: 'golf/coach/v3/tools/handle-tool-use.ts',
    needles: ['searchKnowledgeChunks'],
  },
  {
    piece: 'Contexto del coach lee planes + patrones v2',
    consumer: 'golf/coach/context.ts',
    needles: ['coach_plans', 'player_patterns'],
  },
]

describe('Canario wiring cerebro v3: piezas VIVAS no se desconectan', () => {
  ENFORCED.forEach(({ piece, consumer, needles }) => {
    it(`"${piece}" sigue consumida por ${consumer}`, () => {
      const src = readSrc(consumer)
      needles.forEach((needle) => {
        expect(
          src.includes(needle),
          `DECORACIÓN: "${piece}" perdió su consumidor. ${consumer} ya no referencia "${needle}". ` +
            `Reconectar o el build se cae (ver feedback_anti_decoracion_wiring).`,
        ).toBe(true)
      })
    })
  })
})

describe('Canario wiring cerebro v3: piezas PENDIENTES de enchufar', () => {
  // Cada una pasa a ENFORCED (assertion real) cuando se conecta en su ola.
  // Hasta entonces queda como todo para que no se declare "hecha".
  it.todo('cerebro_weights leído en runtime por el motor de foco (Ola 2)')
  it.todo('coach con fallback degradado a gateway/Gemini ante fallo Anthropic (P0)')
  it.todo('métricas golf/coach/metrics consumidas en runtime (conectar o borrar)')
  it.todo('tabla cerebro_events escrita/leída en runtime (conectar o borrar)')
})
