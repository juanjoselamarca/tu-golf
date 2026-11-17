// src/app/api/torneos/[slug]/players/[playerId]/handicap/route.ts
//
// PUT — El organizador corrige el hándicap inscrito de un jugador (Scoring → Resumen), antes o
// después de iniciar el torneo. Con el torneo iniciado la corrección llega también a la tarjeta del
// grupo y al hándicap del equipo (`editarHandicapInscrito`). Body: `{ value, esperado }`, donde
// `esperado` es el hándicap que el organizador vio (null = sin hándicap): si ya no es ese, 409.
//
// Auth: sesión + organizer_id del torneo (igual que /start). Escribe con service role.

import { NextRequest, NextResponse } from 'next/server'
import { createClient as createServerClient } from '@/utils/supabase/server'
import { createAdminClient } from '@/lib/supabaseAdmin'
import { checkRateLimit, rateLimitHeaders } from '@/lib/rate-limit'
import {
  courseDataDeInscripcion,
  esHandicapDeInscripcionValido,
  MENSAJE_HANDICAP_UN_DECIMAL,
  mensajeHandicapFueraDeRango,
  rangoDeHandicapDeInscripcion,
  tieneUnDecimalComoMaximo,
} from '@/golf/handicap-index-range'
import {
  editarHandicapInscrito,
  ERROR_OTRO_CAMBIO,
  TORNEO_PARA_EDITAR_SELECT,
  type TorneoParaEditar,
} from '@/lib/data/tournaments/editarHandicapInscrito'

export const dynamic = 'force-dynamic'

/** `esperado` es obligatorio (null explícito = no tenía); cualquier otra forma es un panel roto. */
function leerEsperado(body: Record<string, unknown>): number | null | undefined {
  if (!('esperado' in body)) return undefined
  const v = body.esperado
  if (v === null) return null
  return typeof v === 'number' && Number.isFinite(v) ? v : undefined
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string; playerId: string }> },
) {
  const { slug, playerId } = await params

  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Debes iniciar sesión' }, { status: 401 })

  let body: Record<string, unknown>
  try {
    const raw = (await request.json()) as unknown
    if (!raw || typeof raw !== 'object') throw new Error('body')
    body = raw as Record<string, unknown>
  } catch {
    return NextResponse.json({ error: 'Datos inválidos' }, { status: 400 })
  }
  const esperado = leerEsperado(body)
  if (esperado === undefined) return NextResponse.json({ error: 'Datos inválidos' }, { status: 400 })

  const svc = createAdminClient()
  const { data, error } = await svc.from('tournaments').select(TORNEO_PARA_EDITAR_SELECT).eq('slug', slug).maybeSingle()
  if (error) return NextResponse.json({ error: 'No se pudo leer el torneo. Intenta de nuevo.' }, { status: 500 })
  if (!data) return NextResponse.json({ error: 'Torneo no encontrado' }, { status: 404 })
  const torneo = data as unknown as TorneoParaEditar
  if (torneo.organizer_id !== user.id) {
    return NextResponse.json({ error: 'Solo el organizador puede corregir el hándicap' }, { status: 403 })
  }

  // El mismo rango que el editor del panel (fuente única): índice en WHS, course handicap en raw.
  const rango = rangoDeHandicapDeInscripcion(torneo.hcp_calc_mode, courseDataDeInscripcion(torneo.courses))
  if (!esHandicapDeInscripcionValido(body.value, rango)) {
    return NextResponse.json({ error: mensajeHandicapFueraDeRango(rango) }, { status: 400 })
  }
  // La columna es numeric(4,1): con dos decimales tarjeta y equipo se calcularían con otro número que el guardado.
  if (!tieneUnDecimalComoMaximo(body.value)) {
    return NextResponse.json({ error: MENSAJE_HANDICAP_UN_DECIMAL }, { status: 400 })
  }

  // Holgado: corregir una planilla entera son decenas de ediciones; solo frena un bucle.
  const rl = checkRateLimit(`editar-hcp:${user.id}`, 120, 10 * 60 * 1000)
  if (!rl.allowed) {
    return NextResponse.json(
      { error: 'Demasiados cambios seguidos. Espera unos minutos y vuelve a intentar.' },
      { status: 429, headers: rateLimitHeaders(rl) },
    )
  }

  const res = await editarHandicapInscrito(svc, torneo, playerId, esperado, body.value)
  if (res.ok) return NextResponse.json({ ok: true, value: res.valor })
  if (res.motivo === 'no-existe') return NextResponse.json({ error: 'Jugador no encontrado en este torneo' }, { status: 404 })
  if (res.motivo === 'conflicto') return NextResponse.json({ error: ERROR_OTRO_CAMBIO, codigo: 'conflicto' }, { status: 409 })
  return NextResponse.json({ error: 'No se pudo guardar el hándicap. Intenta de nuevo.' }, { status: 500 })
}
