// src/app/api/torneos/draft/[id]/preview/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { checkRateLimit, rateLimitHeaders } from '@/lib/rate-limit'
import { simulate } from '@/lib/draft/simulators'
import { upgradeConfig } from '@/lib/draft/upgrade-config'

export const dynamic = 'force-dynamic'

export async function POST(_req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  // La simulación corre en la función (CPU), no en la base.
  const rl = checkRateLimit(`draft-preview:${user.id}`, 30, 60 * 1000)
  if (!rl.allowed) return NextResponse.json({ error: 'Demasiados intentos. Intenta más tarde.' }, { status: 429, headers: rateLimitHeaders(rl) })

  const { data: d, error: dErr } = await supabase
    .from('tournament_drafts')
    .select('config')
    .eq('id', params.id)
    .single()
  if (dErr || !d) return NextResponse.json({ error: 'No encontrado' }, { status: 404 })

  const config = upgradeConfig(d.config)
  try {
    const result = simulate(config)
    return NextResponse.json({ ok: true, simulation: result, is_simulation: true })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Error simulación'
    return NextResponse.json({ error: msg }, { status: 501 })
  }
}
