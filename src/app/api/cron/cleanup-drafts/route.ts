// src/app/api/cron/cleanup-drafts/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  // Vercel Cron envia un header secreto
  const auth = req.headers.get('authorization')
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const service = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  const cutoff = new Date()
  cutoff.setUTCDate(cutoff.getUTCDate() - 30)

  const { data, error } = await service
    .from('tournament_drafts')
    .update({ status: 'archived' })
    .eq('status', 'draft')
    .lt('updated_at', cutoff.toISOString())
    .select('id')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true, archived: data?.length || 0 })
}
