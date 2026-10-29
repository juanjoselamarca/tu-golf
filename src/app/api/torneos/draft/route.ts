import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { createInitialConfig } from '@/lib/draft/initial-config'
import { trackDraftEvent, DRAFT_EVENTS } from '@/lib/draft/telemetry'
import { checkRateLimit, rateLimitHeaders } from '@/lib/rate-limit'
import { captureError } from '@/lib/error-tracking'

export const dynamic = 'force-dynamic'

export async function POST(_req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
    }

    // Rate limit: 10 borradores por hora por usuario
    const rl = checkRateLimit(`draft-create:${user.id}`, 10, 60 * 60 * 1000)
    if (!rl.allowed) {
      return NextResponse.json(
        { error: 'Demasiados borradores creados. Intenta de nuevo más tarde.' },
        { status: 429, headers: rateLimitHeaders(rl) },
      )
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
      await captureError(dErr ?? new Error('draft/create: insert sin fila'), {
        context: 'draft/create',
        userId: user.id,
      })
      return NextResponse.json({ error: dErr?.message || 'Error creando draft' }, { status: 500 })
    }

    // Owner como collaborator (simetría). En la base lo garantiza el trigger
    // trg_tournament_drafts_dueno_colaborador; acá se mantiene para que el borrador quede completo
    // aunque el código se deploye antes de aplicar la migración, y el error ya no se traga: sin esta
    // fila el dueño no puede transferir el borrador nunca más (pasaba en 6 de 268 borradores de prod).
    const { error: colErr } = await supabase
      .from('tournament_draft_collaborators')
      .upsert(
        { draft_id: draft.id, user_id: user.id, role: 'owner', added_by: user.id },
        { onConflict: 'draft_id,user_id', ignoreDuplicates: true },
      )

    if (colErr) {
      await captureError(colErr, {
        context: 'draft/create: fila de colaborador del dueño',
        userId: user.id,
        meta: { draft_id: draft.id },
      })
      return NextResponse.json({ error: 'Error creando draft' }, { status: 500 })
    }

    // Telemetria: draft creado desde cero (no duplicado).
    await trackDraftEvent(supabase, user.id, DRAFT_EVENTS.CREATED, {
      draft_id: draft.id,
      schema_version: 1,
      source: 'fresh',
    })

    return NextResponse.json({ ok: true, draft })
  } catch (err) {
    await captureError(err, { context: 'draft/create: error interno' })
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}
