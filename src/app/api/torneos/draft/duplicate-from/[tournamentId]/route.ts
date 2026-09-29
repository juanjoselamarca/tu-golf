// src/app/api/torneos/draft/duplicate-from/[tournamentId]/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { configFromTournament, type SourceCategory } from '@/lib/draft/duplicate-config'
import { fetchAllRoundPlayConfigs } from '@/lib/data/tournaments/rounds'

export const dynamic = 'force-dynamic'

export async function POST(_req: NextRequest, props: { params: Promise<{ tournamentId: string }> }) {
  const params = await props.params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const { data: src, error: sErr } = await supabase
    .from('tournaments')
    .select('id, name, format, modo_juego, hole_count, tees, use_handicap, course_id, organizer_id, total_rounds, date_start')
    .eq('id', params.tournamentId)
    .single()

  if (sErr || !src) return NextResponse.json({ error: 'Torneo origen no encontrado' }, { status: 404 })
  if (src.organizer_id !== user.id) return NextResponse.json({ error: 'Solo el organizador puede duplicar' }, { status: 403 })

  // Categorías (con género y tee por defecto) + las rondas del torneo origen
  // resueltas por la MISMA fuente que usa el motor (`resolveRoundPlayConfig`).
  const [{ data: srcCats }, rondas] = await Promise.all([
    supabase
      .from('categories')
      .select('name, handicap_min, handicap_max, gender, default_tee_color')
      .eq('tournament_id', params.tournamentId),
    fetchAllRoundPlayConfigs(supabase, src),
  ])

  // format/modo_juego se normalizan contra el schema del borrador (un valor
  // legacy no puede crear un borrador con base inválida); rondas, género y tee
  // por categoría se copian del origen. Lógica en duplicate-config.ts.
  const config = configFromTournament(
    {
      format: (src.format as string | null) ?? null,
      modo_juego: (src.modo_juego as string | null) ?? null,
      use_handicap: (src.use_handicap as boolean | null) ?? null,
    },
    (srcCats ?? []) as SourceCategory[],
    rondas,
  )

  const { data: draft, error: dErr } = await supabase
    .from('tournament_drafts')
    .insert({
      owner_id: user.id,
      config,
      status: 'draft',
      version: 1,
    })
    .select('id, version, config, status')
    .single()
  if (dErr || !draft) return NextResponse.json({ error: 'Error creando draft' }, { status: 500 })

  await supabase.from('tournament_draft_collaborators').insert({
    draft_id: draft.id, user_id: user.id, role: 'owner', added_by: user.id,
  })

  return NextResponse.json({ ok: true, draft })
}
