import { NextRequest, NextResponse } from 'next/server'
import { createClient as createServerClient } from '@/utils/supabase/server'
import { createAdminClient } from '@/lib/supabaseAdmin'
import { fetchJoinInfo, registerPlayerAndRound } from '@/lib/data/tournaments/joinFlow'
import { resolverCourseHandicap } from '@/golf/core/course-handicap'

export const dynamic = 'force-dynamic'

export async function POST(_req: NextRequest, { params }: { params: { slug: string } }) {
  const supabase = await createServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const admin = createAdminClient()
  const info = await fetchJoinInfo(admin, params.slug, user.id)
  if (!info) return NextResponse.json({ error: 'not_found' }, { status: 404 })

  if (info.alreadyRegistered)
    return NextResponse.json(
      { error: 'already_registered', message: 'Ya estás inscrito en este torneo.' },
      { status: 409 }
    )

  // Invariante CERO FALLOS: sin índice de handicap el neto sale corrupto (net = gross).
  // La UI ya bloquea el caso normal, pero el write-path es la puerta real — igual que
  // el cupo, que se enforcea en la UI Y atómicamente en el RPC. Se rechaza acá también
  // (POST directo / estado rancio / carrera). `== null` deja pasar índice 0 y plus (<0)
  // legítimos. Sólo aplica a la auto-inscripción del jugador: el organizador inscribe
  // invitados sin índice por otras rutas (por eso el guard vive acá, no en enrollPlayer).
  if (info.profile?.indice == null)
    return NextResponse.json(
      {
        error: 'missing_index',
        message: 'Necesitas tu índice de handicap para inscribirte. Cárgalo en tu perfil y vuelve por este link.',
      },
      { status: 400 }
    )

  // WHS: guardar ÍNDICE crudo. `resolveScoringCourseHcp(mode='whs')` recalcula
  // el course handicap usando el tee del jugador en scoring/leaderboard.
  // Legacy (raw): guardar COURSE HANDICAP pre-convertido porque
  // `resolveScoringCourseHcp(mode!='whs')` devuelve handicap_at_registration
  // directo sin recalcular.
  // Sin esta distinción, WHS sufre doble conversión: índice 15 en slope 142 →
  // CH 22 guardado → leaderboard calcula CH de "índice 22" → 31. Error: +9.
  const indice = info.profile?.indice ?? null
  const course = info.tournament.courses
  const isWhs = info.tournament.hcp_calc_mode === 'whs'
  const handicapValue = indice != null
    ? isWhs
      ? indice
      : resolverCourseHandicap(
          indice,
          course && course.slope_rating != null && course.course_rating != null
            ? { slope: course.slope_rating, courseRating: course.course_rating, par: course.par_total ?? 72 }
            : null
        )
    : null

  const result = await registerPlayerAndRound(admin, {
    tournamentId: info.tournament.id,
    tournamentStatus: info.tournament.status,
    userId: user.id,
    courseHandicap: handicapValue,
  })

  if (!result.ok) {
    const status =
      result.reason === 'already_registered'
        ? 409
        : result.reason === 'not_inscribible'
        ? 409
        : result.reason === 'tournament_full'
        ? 409
        : result.reason === 'forbidden'
        ? 403
        : 400
    return NextResponse.json({ error: result.reason, message: result.message }, { status })
  }

  return NextResponse.json({ ok: true, playerId: result.playerId })
}
