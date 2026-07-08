/**
 * CANARIO 1c/1d — corpus de coaching (estrategia + psicología).
 *
 * Mismo espíritu que orphans-1b: el conocimiento nuevo no vale si el read-path
 * no lo alcanza. Verificado (6-jul) que la afirmación "poblar y listo, sin
 * código" era INEXACTA: el retrieval defaulteaba blockKey='rules', dejando el
 * corpus de coaching inalcanzable. Este canario custodia las 3 piezas que lo
 * desbloquean + prueba (DB-backed) que el read-path real devuelve los chunks.
 *
 * Dos capas:
 *   1) ESTÁTICA (siempre): las 3 piezas de wiring siguen en su lugar.
 *   2) DB-BACKED (skipIf sin service-role): el corpus está sembrado y el
 *      read-path real lo devuelve. En CI con GEMINI_API_KEY corre el retrieval
 *      completo; local sin env se salta (patrón orphans-1b).
 */
import { describe, it, expect } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'
import { RAG_SECTION } from '../prompts'
import { SEARCH_KNOWLEDGE_TOOL } from '../tools/search-knowledge-chunks-tool'

const V3 = path.resolve(__dirname, '..') // → src/golf/coach/v3

describe('Canario 1c/1d (estático): el corpus de coaching es alcanzable', () => {
  it('la tool search_knowledge_chunks anuncia estrategia + psicología (si no, el LLM no la invoca para coaching)', () => {
    const desc = SEARCH_KNOWLEDGE_TOOL.description ?? ''
    expect(desc.toLowerCase()).toContain('strategy')
    expect(desc.toLowerCase()).toContain('psychology')
    // sigue cubriendo reglas (no perdimos el dominio original)
    expect(desc.toLowerCase()).toContain('rules')
  })

  it('el RAG_SECTION le enseña al coach que el corpus tiene estrategia + psicología', () => {
    expect(RAG_SECTION).toMatch(/ESTRATEGIA/)
    expect(RAG_SECTION).toMatch(/PSICOLOG/i)
    // ancla al jugador, no cita genérica (regla anti-book-to-skill)
    expect(RAG_SECTION).toMatch(/ANCLADO AL JUGADOR/i)
  })

  it('el retrieval ya NO hard-defaultea blockKey a "rules" (bloqueo B resuelto)', () => {
    const src = fs.readFileSync(path.join(V3, 'retrieval/index.ts'), 'utf-8')
    expect(
      src.includes("opts.blockKey ?? 'rules'"),
      'BLOQUEO 1c/1d: el retrieval volvió a defaultear blockKey a "rules" → el corpus de ' +
        'coaching queda inalcanzable. El default debe buscar TODOS los bloques.',
    ).toBe(false)
    expect(src).toContain('const blockKey = opts.blockKey')
  })
})

// ── Capa DB-backed: sólo con service-role en el entorno (CI / local con env) ──
const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
const hasDb = Boolean(url && serviceKey)
const hasGemini = Boolean(process.env.GEMINI_API_KEY)

describe('Canario 1c/1d (DB): el corpus está sembrado y el read-path lo devuelve', () => {
  it.skipIf(!hasDb)('strategy + psychology tienen chunks con embedding en prod', async () => {
    const { createClient } = await import('@supabase/supabase-js')
    const sb = createClient(url!, serviceKey!)

    for (const block of ['strategy', 'psychology']) {
      const { count } = await sb
        .from('knowledge_chunks')
        .select('*', { count: 'exact', head: true })
        .eq('block_key', block)
        .not('embedding', 'is', null)
      expect(
        count ?? 0,
        `corpus 1c/1d: block "${block}" sin chunks embebidos (seed faltante/huérfano)`,
      ).toBeGreaterThan(0)
    }
  })

  it.skipIf(!hasDb || !hasGemini)(
    'el read-path real (searchKnowledgeChunks) devuelve chunks del corpus de coaching',
    async () => {
      const retrieval = await import('../retrieval')
      // Query on-topic de estrategia, acotada al bloque para des-ruidar el canario.
      const chunks = await retrieval.searchKnowledgeChunks(
        'cómo conviene jugar un par 5 largo cuando no llego al green en dos golpes',
        { blockKey: 'strategy', topK: 5 },
      )
      expect(chunks.length, 'el read-path no devolvió chunks de estrategia').toBeGreaterThan(0)
      expect(
        chunks.every((c) => c.sourceJurisdiction === 'coaching'),
        'un chunk devuelto no es del corpus de coaching',
      ).toBe(true)
    },
    60000,
  )
})
