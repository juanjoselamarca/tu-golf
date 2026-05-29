import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { isCerebroAdmin } from '@/lib/cerebro/admin-auth'
import { listKnowledgeSources, addKnowledgeSource } from '@/lib/cerebro/knowledge-sources'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const JURISDICTIONS = ['usga', 'ra', 'whs_global', 'usga_committee', 'fedegolf_chile'] as const

const PostSchema = z.object({
  slug: z.string().min(1).max(100),
  title: z.string().min(1).max(300),
  url_source: z.string().url(),
  block_key: z.string().min(1).max(50),
  jurisdiction: z.enum(JURISDICTIONS),
  authors: z.array(z.string()).optional(),
  priority_rank: z.number().int().min(0).max(1000).optional(),
  is_authoritative_for: z.array(z.string()).optional(),
  legal_basis: z.string().max(500).optional(),
})

export async function GET(_req: NextRequest) {
  if (!(await isCerebroAdmin())) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }
  const sources = await listKnowledgeSources()
  return NextResponse.json({ sources })
}

export async function POST(req: NextRequest) {
  if (!(await isCerebroAdmin())) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }
  const parsed = PostSchema.safeParse(await req.json())
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.format() }, { status: 400 })
  }
  try {
    const source = await addKnowledgeSource(parsed.data)
    return NextResponse.json({ source }, { status: 201 })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'insert_failed'
    return NextResponse.json({ error: msg }, { status: 400 })
  }
}
