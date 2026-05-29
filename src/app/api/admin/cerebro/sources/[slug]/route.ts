import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { isCerebroAdmin } from '@/lib/cerebro/admin-auth'
import { updateKnowledgeSource } from '@/lib/cerebro/knowledge-sources'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const STATUSES = ['pending', 'ingesting', 'ready', 'stale', 'error', 'unavailable'] as const

const PatchSchema = z
  .object({
    priority_rank: z.number().int().min(0).max(1000).optional(),
    status: z.enum(STATUSES).optional(),
    is_authoritative_for: z.array(z.string()).optional(),
    legal_basis: z.string().max(500).optional(),
  })
  .refine((o) => Object.keys(o).length > 0, { message: 'no_fields' })

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  if (!(await isCerebroAdmin())) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }
  const { slug } = await params
  const parsed = PatchSchema.safeParse(await req.json())
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.format() }, { status: 400 })
  }
  try {
    const source = await updateKnowledgeSource(slug, parsed.data)
    return NextResponse.json({ source })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'update_failed'
    return NextResponse.json({ error: msg }, { status: 400 })
  }
}
