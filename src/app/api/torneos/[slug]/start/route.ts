// src/app/api/torneos/[slug]/start/route.ts
//
// POST — Inicia el torneo: materializa rondas, ronda_libre, ronda_libre_jugadores,
// ronda_equipos (si formato por equipos) y actualiza status a 'in_progress'.
//
// Antes esta lógica vivía 100% client-side en useTournamentLifecycle.ts (~60
// llamadas secuenciales a Supabase). Si la conexión se cortaba, el torneo quedaba
// medio-creado. Ahora corre server-side con service role y es TODO O NADA
// (`@/lib/data/tournaments/startTournament`): si una tarjeta no se arma, se
// deshacen todas las de esta llamada, el torneo NO pasa a 'in_progress' y
// reintentar es seguro. Dos inicios a la vez (doble toque, dos organizadores
// con la misma cuenta): el estado pasa a 'in_progress' con compare-and-set y
// nadie deshace tarjetas de un torneo que ya está en juego.
//
// GET — Lo que la confirmación de inicio muestra (motivo + jugadores sin índice).
//
// Auth: solo el organizer_id del torneo puede iniciar (y consultar el GET).

import { NextRequest, NextResponse } from 'next/server'
import { createClient as createServerClient } from '@/utils/supabase/server'
import { createAdminClient } from '@/lib/supabaseAdmin'
import { captureError } from '@/lib/error-tracking'
import { checkRateLimit, rateLimitHeaders } from '@/lib/rate-limit'
import { fetchRoundPlayConfig } from '@/lib/data/tournaments/rounds'
import {
  deshacerGrupo,
  ensureRound1Cards,
  ERROR_OTRO_INICIO,
  ERROR_CAMBIO_DE_ESTADO,
  ERROR_ESTADO_DESCONOCIDO,
  ERROR_SIN_DESHACER,
  estadoAntesDeDeshacer,
  fetchContextoHcpDeEquipos,
  fetchStartGroups,
  gruposSinTarjeta,
  materializeGroupScorecard,
  type GrupoArmado,
  ponerEnJuego,
  soloAprobados,
  completarIndicesInscritos,
} from '@/lib/data/tournaments/startTournament'
import { leerParaIniciar } from '@/lib/data/tournaments/leer-para-iniciar'
import {
  avisoSinIndice,
  CODIGO_CONFIRMAR_SIN_INDICE,
  sinIndiceNoVistos,
} from '@/lib/data/tournaments/motivo-para-no-iniciar'

export const dynamic = 'force-dynamic'

/**
 * GET — Lo que el panel muestra en la confirmación de inicio: por qué no se puede
 * iniciar (`motivo`, o null) y quiénes jugarán sin índice (`sinIndice`). Misma
 * lectura que el POST. Solo lee: no gasta cupo de rate limit.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Debes iniciar sesión' }, { status: 401 })

  const lectura = await leerParaIniciar(createAdminClient(), slug, user.id)
  if (!lectura.ok) return NextResponse.json({ error: lectura.error }, { status: lectura.status })
  return NextResponse.json({ motivo: lectura.motivo, sinIndice: lectura.sinIndice })
}

/** Ids de los sin índice que el organizador vio en la confirmación. Body ausente o malo → ninguno. */
async function leerSinIndiceVistos(request: NextRequest): Promise<string[]> {
  try {
    const body = (await request.json()) as { sinIndiceVistos?: unknown } | null
    const v = body?.sinIndiceVistos
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []
  } catch {
    return []
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params

  // Auth: verificar sesión
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Debes iniciar sesión' }, { status: 401 })
  }

  const svc = createAdminClient()
  const lectura = await leerParaIniciar(svc, slug, user.id)
  if (!lectura.ok) return NextResponse.json({ error: lectura.error }, { status: lectura.status })
  const { torneo: t, aprobados: approvedPlayers, grupos: groups, motivo } = lectura

  if (motivo) return NextResponse.json({ error: motivo }, { status: 400 })

  // Sin índice NO bloquea (decisión de producto 16-nov-2026), pero el organizador
  // tiene que haberlos visto: si alguno no estaba en su confirmación (se inscribió
  // o cambió entre el GET y el POST, o el panel es una versión vieja), 409 con la
  // lista para que confirme de nuevo. Antes del rate limit y de toda escritura.
  const noVistos = sinIndiceNoVistos(lectura.sinIndice, await leerSinIndiceVistos(request))
  if (noVistos.length > 0) {
    return NextResponse.json(
      {
        // El panel actual usa `codigo` y no muestra `error`; un panel abierto antes
        // del deploy solo conoce `error`: tiene que decirle cómo seguir.
        error: `${avisoSinIndice(lectura.sinIndice, t.hcp_calc_mode)} Recarga la página para confirmar e iniciar.`,
        codigo: CODIGO_CONFIRMAR_SIN_INDICE,
        sinIndice: lectura.sinIndice,
      },
      { status: 409 },
    )
  }

  // Después de las validaciones: corregir un grupo y reintentar no gasta cupo.
  // Holgado porque reintentar es seguro; solo frena un bucle.
  const rl = checkRateLimit(`start-torneo:${user.id}`, 10, 10 * 60 * 1000)
  if (!rl.allowed) {
    return NextResponse.json(
      { error: 'Demasiados intentos seguidos. Espera unos minutos y vuelve a intentar.' },
      { status: 429, headers: rateLimitHeaders(rl) },
    )
  }

  // Grupos armados en ESTA llamada: si algo falla después, se deshacen todos.
  const armados: GrupoArmado[] = []
  const deshacerArmados = async (): Promise<boolean> => {
    let ok = true
    for (const a of armados.splice(0)) {
      if (!(await deshacerGrupo(svc, a.groupId, a.rondaId, a.jugadorRondaIds))) ok = false
    }
    return ok
  }
  const fallar = async (error: string, status: number) => {
    // Si otro inicio ya puso el torneo en juego, lo armado aquí es lo que se
    // está usando en la cancha: no se deshace. Si no se sabe, tampoco (lo
    // armado está completo y un reintento lo salta).
    const estado = armados.length > 0 ? await estadoAntesDeDeshacer(svc, t.id) : 'sin-iniciar'
    if (estado === 'en-juego') return NextResponse.json({ error: ERROR_OTRO_INICIO }, { status: 409 })
    if (estado === 'otro-estado') return NextResponse.json({ error: ERROR_CAMBIO_DE_ESTADO }, { status: 409 })
    if (estado === 'desconocido') {
      return NextResponse.json({ error: error === ERROR_SIN_DESHACER ? error : ERROR_ESTADO_DESCONOCIDO }, { status })
    }
    return NextResponse.json({ error: (await deshacerArmados()) ? error : ERROR_SIN_DESHACER }, { status })
  }

  try {
    // WHS: un aprobado sin índice inscrito que hoy lo tiene en su perfil queda con él,
    // antes de armar tarjetas y equipos (si no, jugaría con 0 sin aviso).
    if (!(await completarIndicesInscritos(svc, t.hcp_calc_mode, approvedPlayers))) {
      return NextResponse.json({ error: 'No se pudo guardar el índice de los jugadores. Intenta de nuevo.' }, { status: 500 })
    }
    if (!(await ensureRound1Cards(svc, t.id, approvedPlayers))) {
      return NextResponse.json({ error: 'No se pudieron crear las tarjetas de los jugadores. Intenta de nuevo.' }, { status: 500 })
    }

    // Iniciar el torneo materializa la RONDA 1: cancha, hoyos y fecha salen de
    // la fuente única (`@/golf/tournament-rounds`), que para la ronda 1 es el
    // torneo mismo. (Las rondas 2..N de un torneo por equipos no se
    // materializan todavía — ver follow-up en REORDENAMIENTO_TRACKING.)
    const ronda1 = await fetchRoundPlayConfig(svc, t, 1)
    // Scramble/foursome: ratings, tees y par de la ronda para el handicap de
    // equipo, una sola vez para todos los grupos (null en otros formatos).
    const hcpEquipos = await fetchContextoHcpDeEquipos(svc, t, ronda1)

    for (const group of groups.filter((g) => !g.ronda_libre_id && g.players.length > 0)) {
      const res = await materializeGroupScorecard(svc, { tournament: t, group, players: approvedPlayers, ronda1, creatorId: user.id, hcpEquipos })
      // Otro inicio ganó este grupo: lo ya armado aquí está completo y es
      // válido (el otro lo saltó al leer) → NO se deshace; el otro termina.
      if (!res.ok && res.conflicto) return NextResponse.json({ error: res.error }, { status: 409 })
      // Un grupo sin tarjeta no puede anotar: el torneo no se inicia.
      if (!res.ok) return fallar(res.error, 500)
      armados.push(res)
    }

    // Antes de poner el torneo en juego, se relee: si otro inicio en paralelo
    // deshizo un grupo que esta llamada saltó por "ya armado", no se inicia.
    // Igual que en el conflicto, lo propio está completo y NO se deshace.
    const { groups: finales, error: fErr } = await fetchStartGroups(svc, t.id)
    if (fErr) return fallar('No se pudo verificar las tarjetas. Intenta de nuevo.', 500)
    if (gruposSinTarjeta(soloAprobados(finales, approvedPlayers)).length > 0) return NextResponse.json({ error: ERROR_OTRO_INICIO }, { status: 409 })

    // ÚLTIMO: estado a in_progress, solo si todas las tarjetas quedaron armadas
    // y el torneo sigue sin iniciar. Si otro inicio ganó, lo propio no se deshace.
    const enJuego = await ponerEnJuego(svc, t.id)
    if (enJuego === 'otro-gano') {
      const ahora = await estadoAntesDeDeshacer(svc, t.id)
      return NextResponse.json({ error: ahora === 'otro-estado' ? ERROR_CAMBIO_DE_ESTADO : ERROR_OTRO_INICIO }, { status: 409 })
    }
    if (enJuego === 'error') return fallar('No se pudo actualizar el estado del torneo. Intenta de nuevo.', 500)

    return NextResponse.json({ success: true, status: 'in_progress' })
  } catch (err) {
    void captureError(err, { context: 'start-tournament', level: 'error', meta: { slug } })
    return fallar('Error interno al iniciar el torneo. Intenta de nuevo.', 500)
  }
}
