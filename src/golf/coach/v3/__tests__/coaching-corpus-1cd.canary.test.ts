/**
 * CANARIO 1c/1d — corpus de coaching (estrategia + psicología).
 *
 * Mismo espíritu que orphans-1b: el conocimiento nuevo no vale si el read-path
 * no lo alcanza. Verificado (6-jul) que la afirmación "poblar y listo, sin
 * código" era INEXACTA: el retrieval defaulteaba blockKey='rules', dejando el
 * corpus de coaching inalcanzable. Este canario custodia las 3 piezas que lo
 * desbloquean.
 *
 * The database layer (seeded corpus + real read-path) lives in src/__tests__/prod/coaching-corpus.test.ts.
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
