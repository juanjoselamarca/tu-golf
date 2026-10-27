// Database layer of the coaching-corpus-1cd canary: the strategy and psychology corpus is seeded in prod with
// embeddings, and the real read-path returns it. The read-path test also needs GEMINI_API_KEY.
import { describe, it, expect } from 'vitest'
import { createClient } from '@supabase/supabase-js'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { buscarVoseo } from '../../../scripts/lib/voseo.mjs'

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

  // Este es el único control que mira lo que el coach CITA DE VERDAD. El canario
  // del repo (`src/__tests__/canary-sin-voseo.test.ts`) revisa los archivos, y
  // mergear no cambia una sola fila de `knowledge_chunks`: el corpus llega a
  // prod cuando alguien corre `scripts/cerebro-v3/ingest-coaching.mjs`. Entre el
  // merge y esa corrida, el repo está impecable y el coach sigue hablando
  // argentino — que es exactamente lo que pasó el 27-oct-2026, con 11 chunks en
  // voseo contestando en producción.
  //
  // Solo el corpus que escribimos nosotros, y por SLUG, no por
  // `jurisdiction = 'coaching'`: los slugs salen de los mismos JSON que ingesta
  // el script, así que una fuente de coaching que algún día se ingeste de
  // afuera (un libro rioplatense, un apunte de un coach argentino) no deja este
  // canario rojo para siempre por texto que nadie puede reescribir. Es el mismo
  // argumento por el que quedan fuera las reglas (`usga`, `randa`,
  // `fedegolf_chile`): son traducciones oficiales que se citan como vienen.
  it.skipIf(!hasDb)('ningún chunk del corpus de coaching habla en voseo', async () => {
    const sb = createClient(url!, serviceKey!)

    const corpus = join('scripts', 'cerebro-v3', 'data', 'coaching')
    const slugs = readdirSync(corpus)
      .filter((f) => f.endsWith('.json'))
      .map((f) => JSON.parse(readFileSync(join(corpus, f), 'utf8')).source?.slug as string)
      .filter(Boolean)
    expect(slugs.length, `${corpus} no trae los slugs del corpus`).toBeGreaterThanOrEqual(2)

    const { data: fuentes, error: errFuentes } = await sb
      .from('knowledge_sources')
      .select('id, slug')
      .in('slug', slugs)
    if (errFuentes) throw errFuentes
    expect(
      fuentes?.map((f) => f.slug).sort(),
      'prod no tiene todas las fuentes del corpus: el canario estaría revisando menos de lo que hay',
    ).toEqual([...slugs].sort())

    const porSlug = new Map((fuentes ?? []).map((f) => [f.id, f.slug]))
    const hallazgos: string[] = []
    let revisados = 0
    // Paginación por cursor sobre `id`: PostgREST corta en su `db-max-rows` sin
    // avisar y `.range()` no lo levanta, así que se avanza con `.gt('id', …)`
    // hasta la primera página vacía.
    let cursor: string | null = null
    for (;;) {
      let q = sb
        .from('knowledge_chunks')
        .select('id, source_id, breadcrumb, content')
        .in('source_id', [...porSlug.keys()])
        .order('id', { ascending: true })
        .limit(500)
      if (cursor) q = q.gt('id', cursor)

      const { data, error } = await q
      if (error) throw error
      if (!data?.length) break

      for (const fila of data) {
        revisados++
        // El `breadcrumb` también: la tool de búsqueda se lo devuelve al modelo
        // como cita ("Returns relevant chunks with breadcrumb citations"), así
        // que un título en vos —"Elegí el lado seguro"— llega al jugador igual
        // que el cuerpo. Los 24 breadcrumbs vivos en prod hoy están en voseo.
        const formas = buscarVoseo(`${fila.breadcrumb ?? ''}\n${fila.content ?? ''}`)
        if (formas.length) {
          hallazgos.push(
            `${porSlug.get(fila.source_id) ?? fila.source_id} · ${fila.breadcrumb}: ${formas.join(', ')}`,
          )
        }
      }
      cursor = data[data.length - 1].id
    }

    expect(
      revisados,
      'el corpus de coaching trae menos chunks que el piso conocido (24 por fuente): ' +
        'o la ingesta quedó a medias o el filtro dejó de alcanzarlo',
    ).toBeGreaterThanOrEqual(40)
    expect(
      hallazgos,
      'hay chunks en voseo VIVOS en prod: re-ingestar el corpus con ' +
        'scripts/cerebro-v3/ingest-coaching.mjs --all',
    ).toEqual([])
  })
})
