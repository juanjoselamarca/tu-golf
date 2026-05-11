import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { createInitialConfig } from '@/lib/draft/initial-config'
import { trackDraftEvent, DRAFT_EVENTS } from '@/lib/draft/telemetry'

export const dynamic = 'force-dynamic'

export async function POST(_req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
    }

    const config = createInitialConfig()

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

    if (dErr || !draft) {
      console.error('[draft/create] error:', dErr)
      return NextResponse.json({ error: dErr?.message || 'Error creando draft' }, { status: 500 })
    }

    // Owner como collaborator (simetría)
    await supabase.from('tournament_draft_collaborators').insert({
      draft_id: draft.id,
      user_id: user.id,
      role: 'owner',
      added_by: user.id,
    })

    // Telemetria: draft creado desde cero (no duplicado).
    await trackDraftEvent(supabase, user.id, DRAFT_EVENTS.CREATED, {
      draft_id: draft.id,
      schema_version: 1,
      source: 'fresh',
    })

    return NextResponse.json({ ok: true, draft })
  } catch (err) {
    console.error('[draft/create] internal:', err)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}
