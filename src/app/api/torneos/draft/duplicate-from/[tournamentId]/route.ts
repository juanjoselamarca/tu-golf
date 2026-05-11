// src/app/api/torneos/draft/duplicate-from/[tournamentId]/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { createInitialConfig } from '@/lib/draft/initial-config'

export const dynamic = 'force-dynamic'

export async function POST(_req: NextRequest, { params }: { params: { tournamentId: string } }) {
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

  const config = createInitialConfig()
  config.format = (src.format as typeof config.format) || 'stroke_play'
  config.modo = (src.modo_juego as typeof config.modo) || 'gross'
  config.use_handicap = !!src.use_handicap
  if (srcCats && srcCats.length > 0) {
    config.categories = srcCats.map(c => ({
      id: crypto.randomUUID(),
      name: c.name,
      handicap_min: c.handicap_min,
      handicap_max: c.handicap_max,
      gender: null,
    }))
  }
  config.rounds[0].course_id = src.course_id
  config.rounds[0].hole_count = ((src.hole_count === 9 ? 9 : 18)) as 9 | 18
  // name, date_start, registration.code: vacios (forzar al user a setearlos)
  config.name = ''
  config.date_start = null
  config.rounds[0].date = null

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
