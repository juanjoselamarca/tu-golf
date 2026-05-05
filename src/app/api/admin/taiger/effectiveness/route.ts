/**
 * Effectiveness endpoint — KPIs agregados del cerebro de tAIger+.
 *
 * Solo admin. GET /api/admin/taiger/effectiveness
 *
 * Spec: docs/superpowers/plans/2026-05-05-cerebro-v2.md §7.1
 */

import { NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { createAdminClient } from '@/lib/supabaseAdmin'
import { isAdmin } from '@/lib/admin'
import { computePlanEffectiveness } from '@/golf/coach/plan-effectiveness'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!(await isAdmin(user?.id, supabase))) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }

  const admin = createAdminClient()
  const kpis = await computePlanEffectiveness(admin)
  return NextResponse.json(kpis)
}
