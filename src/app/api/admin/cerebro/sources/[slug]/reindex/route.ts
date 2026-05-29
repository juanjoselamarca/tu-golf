import { NextRequest, NextResponse } from 'next/server'
import { isCerebroAdmin } from '@/lib/cerebro/admin-auth'
import { markSourceForReindex } from '@/lib/cerebro/knowledge-sources'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(_req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  if (!(await isCerebroAdmin())) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }
  const { slug } = await params
  try {
    const found = await markSourceForReindex(slug)
    if (!found) {
      return NextResponse.json({ error: 'source_not_found' }, { status: 404 })
    }
    // 1e: solo marca status='ingesting'. La ingesta real la dispara el operador
    // con ingest-rules.mjs. Cron automático (Vercel Queues) en sub-ola posterior.
    return NextResponse.json({ enqueued: true, slug })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'reindex_failed'
    return NextResponse.json({ error: msg }, { status: 400 })
  }
}
