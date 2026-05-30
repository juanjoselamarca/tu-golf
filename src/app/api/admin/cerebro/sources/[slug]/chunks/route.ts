import { NextRequest, NextResponse } from 'next/server'
import { isCerebroAdmin } from '@/lib/cerebro/admin-auth'
import { getSourceChunksPreview } from '@/lib/cerebro/knowledge-sources'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(_req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  if (!(await isCerebroAdmin())) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }
  const { slug } = await params
  const chunks = await getSourceChunksPreview(slug)
  if (chunks === null) {
    return NextResponse.json({ error: 'source_not_found' }, { status: 404 })
  }
  return NextResponse.json({ chunks })
}
