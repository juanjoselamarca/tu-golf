import { redirect } from 'next/navigation'
import { isCerebroAdmin } from '@/lib/cerebro/admin-auth'
import { listKnowledgeSources } from '@/lib/cerebro/knowledge-sources'
import { FuentesPanel } from './FuentesPanel'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export default async function CerebroFuentesPage() {
  if (!(await isCerebroAdmin())) {
    redirect('/login?next=/admin/cerebro/fuentes')
  }
  const sources = await listKnowledgeSources()
  return (
    <main className="mx-auto max-w-5xl px-4 py-8 space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">Fuentes de conocimiento — Cerebro V3</h1>
        <p className="text-sm text-neutral-500">
          Corpus RAG de reglas oficiales (USGA / R&amp;A / WHS / FedeGolf Chile). El
          coach v3 consulta estos chunks vía <code>search_knowledge_chunks</code>. El
          re-indexado marca la fuente como <code>ingesting</code>; la ingesta real se
          dispara con <code>ingest-rules.mjs</code>.
        </p>
      </header>
      <FuentesPanel initialSources={sources} />
    </main>
  )
}
