// src/lib/api/gestion-en-juego.ts
//
// Lo HTTP de la gestión de inscritos con el torneo en juego (#814 · PR3), compartido por las rutas
//   PUT    /api/torneos/[slug]/players/[playerId]/grupo
//   DELETE /api/torneos/[slug]/players/[playerId]
//   POST   /api/torneos/[slug]/players  (con `groupId`)
// Auth: sesión + `organizer_id` del torneo, igual que /start y /players/[playerId]/handicap (no existe otro rol con
// permiso sobre el torneo). Escribe con service role vía `colocarInscrito`.

import { NextResponse } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createAdminClient } from '@/lib/supabaseAdmin'
import { checkRateLimit, rateLimitHeaders } from '@/lib/rate-limit'
import { TORNEO_PARA_EDITAR_SELECT, type TorneoParaEditar } from '@/lib/data/tournaments/editarHandicapInscrito'
import type { ResultadoColocar } from '@/lib/data/tournaments/colocarInscrito'

export type TorneoDelOrganizador =
  | { ok: true; svc: SupabaseClient; torneo: TorneoParaEditar; userId: string }
  | { ok: false; respuesta: NextResponse }

/** Cambios de grupo por organizador cada 10 minutos: holgado para reordenar un torneo, frena un bucle. */
const CAMBIOS_POR_VENTANA = 120
const VENTANA_MS = 10 * 60 * 1000

/** Tope de cambios y torneo del organizador (por slug). La ruta ya validó la sesión (`usuarioDeLaSesion`). */
export async function torneoDelOrganizador(slug: string, user: { id: string }): Promise<TorneoDelOrganizador> {

  const rl = checkRateLimit(`gestion-en-juego:${user.id}`, CAMBIOS_POR_VENTANA, VENTANA_MS)
  if (!rl.allowed) {
    return {
      ok: false,
      respuesta: NextResponse.json(
        { error: 'Demasiados cambios seguidos. Espera unos minutos y vuelve a intentar.' },
        { status: 429, headers: rateLimitHeaders(rl) },
      ),
    }
  }

  const svc = createAdminClient()
  const torneo = await leerTorneoParaColocar(svc, slug)
  if (torneo === 'error') return { ok: false, respuesta: NextResponse.json({ error: 'No se pudo leer el torneo. Intenta de nuevo.' }, { status: 500 }) }
  if (!torneo) return { ok: false, respuesta: NextResponse.json({ error: 'Torneo no encontrado' }, { status: 404 }) }
  if (torneo.organizer_id !== user.id) {
    return { ok: false, respuesta: NextResponse.json({ error: 'Solo el organizador puede cambiar los grupos' }, { status: 403 }) }
  }
  return { ok: true, svc, torneo, userId: user.id }
}

/** El torneo con lo que necesita `colocarInscrito` (formato, estado, rondas, equipo). */
export async function leerTorneoParaColocar(svc: SupabaseClient, slug: string): Promise<TorneoParaEditar | null | 'error'> {
  const { data, error } = await svc.from('tournaments').select(TORNEO_PARA_EDITAR_SELECT).eq('slug', slug).maybeSingle()
  if (error) return 'error'
  return (data as unknown as TorneoParaEditar | null) ?? null
}

/** HTTP de un `ResultadoColocar` fallido: 404 si no existe, 500 si falló, 409 para todo lo demás (regla o carrera). */
export function estadoHttpDeColocar(res: Exclude<ResultadoColocar, { ok: true }>): number {
  if (res.motivo === 'no-existe' || res.motivo === 'grupo-no-existe') return 404
  if (res.motivo === 'error') return 500
  return 409
}

/** Cuerpo de un `ResultadoColocar` fallido: `codigo` para la UI (PR5), `error` con el copy del mapa único. */
export function cuerpoDeColocarFallido(res: Exclude<ResultadoColocar, { ok: true }>) {
  return {
    error: res.mensaje,
    codigo: res.motivo,
    ofreceRetirar: res.ofreceRetirar,
    ...('golpes' in res ? { golpes: res.golpes } : {}),
    // Conflicto: otro cambio ganó la carrera; la UI recarga y el organizador reintenta.
    ...(res.motivo === 'conflicto' || res.motivo === 'cambio-el-origen' ? { reintentar: true } : {}),
  }
}

/** La respuesta completa de un `ResultadoColocar`. */
export function respuestaDeColocar(res: ResultadoColocar): NextResponse {
  if (res.ok) return NextResponse.json(res)
  return NextResponse.json(cuerpoDeColocarFallido(res), { status: estadoHttpDeColocar(res) })
}
