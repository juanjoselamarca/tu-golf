import { NextRequest, NextResponse } from 'next/server'
import { getAllWeights } from '@/lib/cerebro/weights'
import { invalidateLocal } from '@/lib/cerebro/weights-cache'
import { isCerebroAdmin } from '@/lib/cerebro/admin-auth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(_req: NextRequest) {
  if (!(await isCerebroAdmin())) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }
  invalidateLocal()
  const weights = await getAllWeights()
  return NextResponse.json({
    invalidated_at: new Date().toISOString(),
    weights_active: weights.map(w => ({
      type: w.parameter_type,
      key: w.parameter_key,
      weight: w.current_weight,
    })),
  })
}
