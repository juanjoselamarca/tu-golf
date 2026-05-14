import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { tournamentConfigPartialSchema, tournamentConfigSchema } from '@/lib/draft/schema'
import { deepMergeConfig } from '@/lib/draft/deep-merge-config'
import { upgradeConfig } from '@/lib/draft/upgrade-config'

export const dynamic = 'force-dynamic'

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const { data, error } = await supabase
    .from('tournament_drafts')
    .select('*, tournament_draft_collaborators(user_id, role)')
    .eq('id', params.id)
    .single()

  if (error || !data) return NextResponse.json({ error: 'No encontrado' }, { status: 404 })
  return NextResponse.json({ ok: true, draft: data })
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const body = await req.json()
  const partialResult = tournamentConfigPartialSchema.safeParse(body.config_partial)
  if (!partialResult.success) {
    return NextResponse.json({ error: 'config_partial inválido', details: partialResult.error.issues }, { status: 400 })
  }
  const expectedVersion = body.version
  if (typeof expectedVersion !== 'number') {
    return NextResponse.json({ error: 'version requerido' }, { status: 400 })
  }

  // Lock del draft para evitar race
  const { data: current, error: cErr } = await supabase
    .from('tournament_drafts')
    .select('config, version, status')
    .eq('id', params.id)
    .single()

  if (cErr || !current) return NextResponse.json({ error: 'No encontrado' }, { status: 404 })
  if (current.status !== 'draft') return NextResponse.json({ error: 'Draft no editable' }, { status: 409 })
  if (current.version !== expectedVersion) {
    return NextResponse.json({ error: 'conflict', current_version: current.version, current_config: current.config }, { status: 409 })
  }

  const upgraded = upgradeConfig(current.config)
  const nextConfig = deepMergeConfig(upgraded, partialResult.data)

  const fullResult = tournamentConfigSchema.safeParse(nextConfig)
  if (!fullResult.success) {
    return NextResponse.json({ error: 'config resultante inválido', details: fullResult.error.issues }, { status: 400 })
  }

  const { data: updated, error: uErr } = await supabase
    .from('tournament_drafts')
    .update({ config: nextConfig, version: current.version + 1 })
    .eq('id', params.id)
    .eq('version', current.version)
    .select('id, version, config')
    .single()

  if (uErr || !updated) {
    return NextResponse.json({ error: 'conflict' }, { status: 409 })
  }

  await supabase.from('tournament_draft_events').insert({
    draft_id: params.id,
    actor_id: user.id,
    config_partial: partialResult.data,
    config_before: current.config,
    source: body.source === 'ai' ? 'ai' : 'manual',
  })

  return NextResponse.json({ ok: true, draft: updated })
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  // Solo owner puede archivar
  const { data: d, error: dErr } = await supabase
    .from('tournament_drafts')
    .select('owner_id, status')
    .eq('id', params.id)
    .single()
  if (dErr || !d) return NextResponse.json({ error: 'No encontrado' }, { status: 404 })
  if (d.owner_id !== user.id) return NextResponse.json({ error: 'Solo el owner puede archivar' }, { status: 403 })

  await supabase
    .from('tournament_drafts')
    .update({ status: 'archived' })
    .eq('id', params.id)

  return NextResponse.json({ ok: true })
}
