// Database layer of the coaching-corpus-1cd canary: the strategy and psychology corpus is seeded in prod with
// embeddings, and the real read-path returns it. The read-path test also needs GEMINI_API_KEY.
import { describe, it, expect } from 'vitest'
import { createClient } from '@supabase/supabase-js'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
const hasDb = Boolean(url && serviceKey)
const hasGemini = Boolean(process.env.GEMINI_API_KEY)

describe('coaching corpus is seeded and the read-path returns it', () => {
  it.skipIf(!hasDb)('strategy and psychology have chunks with embeddings', async () => {
    const sb = createClient(url!, serviceKey!)

    for (const block of ['strategy', 'psychology']) {
      const { count } = await sb
        .from('knowledge_chunks')
        .select('*', { count: 'exact', head: true })
        .eq('block_key', block)
        .not('embedding', 'is', null)
      expect(count ?? 0, `block "${block}" has no embedded chunks (missing or orphaned seed)`).toBeGreaterThan(0)
    }
  })

  it.skipIf(!hasDb || !hasGemini)(
    'searchKnowledgeChunks returns coaching corpus chunks',
    async ({ skip }) => {
      const retrieval = await import('@/golf/coach/v3/retrieval')
      let chunks: Awaited<ReturnType<typeof retrieval.searchKnowledgeChunks>>
      try {
        chunks = await retrieval.searchKnowledgeChunks(
          'cómo conviene jugar un par 5 largo cuando no llego al green en dos golpes',
          { blockKey: 'strategy', topK: 5 },
        )
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err)
        if (msg.includes('403') || msg.includes('Forbidden') || msg.includes('denied access')) {
          skip('Gemini API key has no access (403)')
          return
        }
        throw err
      }
      expect(chunks.length, 'the read-path returned no strategy chunks').toBeGreaterThan(0)
      expect(
        chunks.every((c) => c.sourceJurisdiction === 'coaching'),
        'a returned chunk is not from the coaching corpus',
      ).toBe(true)
    },
    60000,
  )
})
