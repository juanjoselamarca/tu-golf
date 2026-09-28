// src/app/api/torneos/draft/duplicate-from/[tournamentId]/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { configFromTournament, type SourceCategory } from '@/lib/draft/duplicate-config'

export const dynamic = 'force-dynamic'

export async function POST(_req: NextRequest, props: { params: Promise<{ tournamentId: string }> }) {
  const params = await props.params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const { data: src, error: sErr } = await supabase
    .from('tournaments')
    .select('id, name, format, modo_juego, hole_count, tees, use_handicap, course_id, organizer_id')
    .eq('id', params.tournamentId)
    .single()

  if (sErr || !src) return NextResponse.json({ error: 'Torneo origen no encontrado' }, { status: 404 })
  if (src.organizer_id !== user.id) return NextResponse.json({ error: 'Solo el organizador puede duplicar' }, { status: 403 })

  // Categorias del torneo origen
  const { data: srcCats } = await supabase
    .from('categories')
    .select('name, handicap_min, handicap_max')
    .eq('tournament_id', params.tournamentId)

  // format/modo_juego se normalizan contra el schema del borrador: un valor
  // legacy en `tournaments` no puede crear un borrador con base inválida.
  const config = configFromTournament(
    {
      format: (src.format as string | null) ?? null,
      modo_juego: (src.modo_juego as string | null) ?? null,
      use_handicap: (src.use_handicap as boolean | null) ?? null,
      course_id: (src.course_id as string | null) ?? null,
      hole_count: (src.hole_count as number | null) ?? null,
    },
    (srcCats ?? []) as SourceCategory[],
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
