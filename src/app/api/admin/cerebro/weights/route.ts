import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getAllWeights, setWeight } from '@/lib/cerebro/weights'
import { invalidateLocal } from '@/lib/cerebro/weights-cache'
import { isCerebroAdmin } from '@/lib/cerebro/admin-auth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const PutSchema = z.object({
  parameter_type: z.enum(['block', 'pattern', 'source', 'user_cluster']),
  parameter_key: z.string().min(1).max(100),
  new_weight: z.number().min(0).max(1),
})

export async function GET(_req: NextRequest) {
  if (!(await isCerebroAdmin())) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }
  const weights = await getAllWeights()
  return NextResponse.json({ weights })
}

export async function PUT(req: NextRequest) {
  if (!(await isCerebroAdmin())) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }
  const parsed = PutSchema.safeParse(await req.json())
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.format() }, { status: 400 })
  }
  const { parameter_type, parameter_key, new_weight } = parsed.data
  await setWeight(parameter_type, parameter_key, new_weight, 'manual')
  invalidateLocal()
  return NextResponse.json({ ok: true })
}
