// src/app/api/torneos/draft/[id]/create-tournament/route.ts
//
// POST — publica un draft como torneo. Handler delgado (regla "el que toca,
// ordena"): auth + gates + respuesta. La orquestación (lock idempotente,
// inserts con compensación, cierre del draft) vive en
// `src/lib/data/tournaments/publishDraft.ts`; los mapeos wizard→tabla en
// `createTournament.ts`, `categories.ts`, `prizes.ts` y `rounds.ts`.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { createAdminClient } from '@/lib/supabaseAdmin'
import { captureError } from '@/lib/error-tracking'
import { upgradeConfig } from '@/lib/draft/upgrade-config'
import { tournamentConfigSchema } from '@/lib/draft/schema'
import { validateGolfRules } from '@/golf/tournament-config-validator'
import {
  DRAFT_FOR_PUBLISH_SELECT,
  creatingIsStale,
  findRecoverableTournament,
  lockAndPublish,
  type DraftForPublish,
} from '@/lib/data/tournaments/publishDraft'
import { canchasNoAptasParaTorneo } from '@/lib/data/course-aptitud'
import { checkFeatureAccess } from '@/golf/billing/require-feature'
import { NETO_FEATURE_BY_FORMAT } from '@/golf/billing/plans'
import { checkRateLimit, rateLimitHeaders } from '@/lib/rate-limit'

export const dynamic = 'force-dynamic'
// Atado a CREATING_STALE_MS (60 s) de publishDraft.ts: si esta función no
// puede vivir más de 30 s, un draft en 'creating' desde hace más de 60 s
// pertenece a un intento MUERTO de verdad, y retomarlo es seguro.
export const maxDuration = 30

export async function POST(_req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  // Rate limit: 5 torneos por hora por usuario (previene creación masiva de torneos)
  const rl = checkRateLimit(`create-tournament:${user.id}`, 5, 60 * 60 * 1000)
  if (!rl.allowed) {
    return NextResponse.json(
      { error: 'Demasiadas creaciones de torneo. Intenta más tarde.' },
      { status: 429, headers: rateLimitHeaders(rl) },
    )
  }

  // Owner-only
  const { data: d, error: dErr } = await supabase
    .from('tournament_drafts')
    .select(DRAFT_FOR_PUBLISH_SELECT)
    .eq('id', params.id)
    .single()
  if (dErr || !d) return NextResponse.json({ error: 'No encontrado' }, { status: 404 })
  const draft = d as unknown as DraftForPublish & { owner_id: string; config: unknown }
  if (draft.owner_id !== user.id) return NextResponse.json({ error: 'Solo owner puede crear' }, { status: 403 })

  const service = createAdminClient()

  // Un intento anterior ya pudo haber creado el torneo: se devuelve ese, sin
  // volver a validar ni a publicar (idempotente).
  const recovered = await findRecoverableTournament(service, draft, new Date())
  if (recovered) return NextResponse.json({ ok: true, tournament_id: recovered.tournamentId, slug: recovered.slug })

  if (draft.status === 'creating' && !creatingIsStale(draft, new Date())) {
    return NextResponse.json({ error: 'El torneo se está creando. Espera unos segundos.' }, { status: 409 })
  }
  if (draft.status !== 'draft' && draft.status !== 'creating') {
    return NextResponse.json({ error: 'Draft no editable' }, { status: 409 })
  }

  const config = upgradeConfig(draft.config as Parameters<typeof upgradeConfig>[0])

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

  try {
    const outcome = await lockAndPublish(service, draft, config, user.id)
    switch (outcome.kind) {
      case 'ok':
        return NextResponse.json({ ok: true, tournament_id: outcome.tournamentId, slug: outcome.slug })
      case 'in_progress':
      case 'lock_lost':
        return NextResponse.json({ error: 'El torneo se está creando. Espera unos segundos.' }, { status: 409 })
      case 'not_draft':
        return NextResponse.json({ error: 'Draft no editable' }, { status: 409 })
    }
  } catch (err: unknown) {
    void captureError(err, {
      context: 'create-tournament.publish',
      level: 'error',
      meta: { draftId: params.id, userId: user.id },
    })
    const msg = err instanceof Error ? err.message : 'Error creando torneo'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
