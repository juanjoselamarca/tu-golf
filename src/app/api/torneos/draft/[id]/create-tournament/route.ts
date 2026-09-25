// src/app/api/torneos/draft/[id]/create-tournament/route.ts
//
// POST — publica un draft como torneo. Handler delgado (regla "el que toca,
// ordena"): auth + gates + respuesta. La orquestación de inserts vive en
// `src/lib/data/tournaments/publishDraft.ts`; los mapeos wizard→tabla en
// `createTournament.ts`, `categories.ts`, `prizes.ts` y `rounds.ts`.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { createAdminClient } from '@/lib/supabaseAdmin'
import { captureError } from '@/lib/error-tracking'
import { upgradeConfig } from '@/lib/draft/upgrade-config'
import { tournamentConfigSchema } from '@/lib/draft/schema'
import { validateGolfRules } from '@/golf/tournament-config-validator'
import { publishTournamentFromConfig } from '@/lib/data/tournaments/publishDraft'
import { canchasNoAptasParaTorneo } from '@/lib/data/course-aptitud'
import { checkFeatureAccess } from '@/golf/billing/require-feature'
import { NETO_FEATURE_BY_FORMAT } from '@/golf/billing/plans'

export const dynamic = 'force-dynamic'

export async function POST(_req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  // Owner-only
  const { data: d, error: dErr } = await supabase
    .from('tournament_drafts')
    .select('owner_id, config, status')
    .eq('id', params.id)
    .single()
  if (dErr || !d) return NextResponse.json({ error: 'No encontrado' }, { status: 404 })
  if (d.owner_id !== user.id) return NextResponse.json({ error: 'Solo owner puede crear' }, { status: 403 })
  if (d.status !== 'draft') return NextResponse.json({ error: 'Draft no editable' }, { status: 409 })

  const config = upgradeConfig(d.config)

  // Validación dura (zod + reglas de golf, fechas incluidas: es la MISMA
  // función que corre en el footer del wizard, así que lo que bloquea acá ya
  // se vio en pantalla antes de apretar "Crear torneo").
  const z = tournamentConfigSchema.safeParse(config)
  if (!z.success) return NextResponse.json({ error: 'Config invalido', details: z.error.issues }, { status: 400 })

  const v = validateGolfRules(config)
  if (v.errors.length > 0) return NextResponse.json({ error: 'Reglas de golf', details: v.errors }, { status: 400 })
  if (!v.isReadyToCreate) return NextResponse.json({ error: 'Faltan campos requeridos' }, { status: 400 })

  // Gate Pro: modo neto en formatos gateados requiere plan Pro del organizador
  const netoFeature = NETO_FEATURE_BY_FORMAT[config.format]
  if (config.modo === 'neto' && netoFeature) {
    const access = await checkFeatureAccess(supabase, user.id, netoFeature)
    if (!access.allowed) {
      return NextResponse.json(
        { error: 'pro_required', feature: netoFeature, requiredTier: access.requiredTier },
        { status: 403 },
      )
    }
  }

  // Guardarrail de datos de cancha. Es el gate DURO: el wizard también avisa,
  // pero acá pasan todos los caminos (wizard, draft duplicado, POST directo).
  // Juzga la cancha de CADA ronda: un torneo multi-ronda puede jugar cada una
  // en una cancha distinta, y una sola con el rating roto reparte handicaps
  // injustos en esa ronda.
  const noAptas = await canchasNoAptasParaTorneo(supabase, config.rounds, config)
  if (noAptas.length > 0) {
    return NextResponse.json(
      { error: noAptas[0].mensaje, details: noAptas },
      { status: 400 },
    )
  }

  // Lock: status=creating
  await supabase.from('tournament_drafts').update({ status: 'creating' }).eq('id', params.id)

  const service = createAdminClient()

  try {
    const { tournamentId, slug } = await publishTournamentFromConfig(service, config, {
      organizerId: user.id,
    })

    // Marca el draft como created — última operación. Si falla, el torneo ya
    // existe y es válido; el draft queda en 'creating' y el cliente puede
    // reintentar el cierre. Mejor eso que un torneo sin crear.
    const { error: uErr } = await service
      .from('tournament_drafts')
      .update({ status: 'created', tournament_id: tournamentId })
      .eq('id', params.id)
    if (uErr) {
      void captureError(uErr, {
        context: 'create-tournament.draft-status',
        level: 'warning',
        meta: { draftId: params.id, tournamentId },
      })
    }

    return NextResponse.json({ ok: true, tournament_id: tournamentId, slug })
  } catch (err: unknown) {
    // `publishTournamentFromConfig` ya compensó (borró el torneo a medias).
    // Volver el draft a 'draft' para que el organizador pueda reintentar.
    await service
      .from('tournament_drafts')
      .update({ status: 'draft' })
      .eq('id', params.id)
    void captureError(err, {
      context: 'create-tournament.publish',
      level: 'error',
      meta: { draftId: params.id, userId: user.id },
    })
    const msg = err instanceof Error ? err.message : 'Error creando torneo'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
