// ─── Capa de datos de la tarjeta de una ronda guardada ──────────────────────
// La leen las dos pantallas que pintan una ronda del historial: la del dueño
// (`/perfil/historial/[id]`) y la pública del link (`/tarjeta/[id]`). Antes cada
// página hacía sus tres queries por su cuenta (`supabase.from()` en `src/app`),
// y un error de red se mostraba igual que una ronda que no existe.

import type { SupabaseClient } from '@supabase/supabase-js'
import type { ParPerHoleInput } from '@/golf/core/holes'
import type { HoyoDeCatalogo } from '@/golf/courses/vueltas'
import { captureError } from '@/lib/error-tracking'

/**
 * Columnas que viajan a cualquiera que tenga el link. SIN `notes`: son privadas
 * y no deben llegar al cliente de un tercero; se traen aparte sólo para el dueño.
 */
const COLUMNAS_PUBLICAS =
  'id, user_id, course_name, course_id, total_gross, holes_played, played_at, tee_color, scores, par_per_hole, formato_juego, modo_juego'

export interface TarjetaGuardada {
  id: string
  user_id: string
  course_name: string
  course_id: string | null
  total_gross: number | null
  holes_played: number | null
  played_at: string | null
  tee_color: string | null
  scores: (number | null)[] | Record<string, number | null> | null
  par_per_hole: ParPerHoleInput
  formato_juego: string | null
  modo_juego: string | null
  /** Sólo para el dueño; `null` para cualquier otro. */
  notes: string | null
}

export type CargaDeTarjeta =
  | {
      estado: 'ok'
      ronda: TarjetaGuardada
      hoyosDelCatalogo: HoyoDeCatalogo[]
      nombreDelJugador: string | null
      esDueño: boolean
      hayVisitanteConSesion: boolean
    }
  /** La ronda no existe, la borraron o es privada de otro (RLS: 0 filas). */
  | { estado: 'no_existe' }
  /** No se pudo preguntar (red, timeout, base caída): se puede reintentar. */
  | { estado: 'error' }

/** PostgREST `.single()` sin filas. */
const SIN_FILAS = 'PGRST116'

/**
 * `nombrePublico`: cómo saber el nombre del dueño cuando el que mira no tiene
 * sesión (`profiles` sólo se lee con sesión). Sin él, el visitante anónimo ve
 * la tarjeta sin nombre. Ver `tarjeta-nombre-publico.ts`.
 */
export async function cargarTarjetaGuardada(
  supabase: SupabaseClient,
  id: string,
  nombrePublico?: (roundId: string) => Promise<string | null>,
): Promise<CargaDeTarjeta> {
  try {
    const { data: { user } } = await supabase.auth.getUser()

    const { data: r, error } = await supabase
      .from('historical_rounds')
      .select(COLUMNAS_PUBLICAS)
      .eq('id', id)
      .single()

    if (error) {
      if (error.code === SIN_FILAS || error.code === '22P02') return { estado: 'no_existe' }
      void captureError(error, { context: 'tarjeta-guardada.ronda', meta: { roundId: id } })
      return { estado: 'error' }
    }
    if (!r) return { estado: 'no_existe' }

    const ronda = r as unknown as Omit<TarjetaGuardada, 'notes'>
    const esDueño = !!user && user.id === ronda.user_id

    const [notas, nombre, hoyos] = await Promise.all([
      // RLS no filtra columnas: las notas se piden aparte y sólo si es el dueño.
      esDueño
        ? supabase.from('historical_rounds').select('notes').eq('id', id).maybeSingle()
        : Promise.resolve({ data: null, error: null }),
      user
        ? supabase.from('profiles').select('name').eq('id', ronda.user_id).maybeSingle()
          .then(p => (p.data as { name: string | null } | null)?.name ?? null)
        : (nombrePublico?.(id) ?? Promise.resolve(null)),
      ronda.course_id
        ? supabase.from('course_holes').select('numero, par, stroke_index').eq('course_id', ronda.course_id).order('numero')
        : Promise.resolve({ data: [], error: null }),
    ])

    // Sin catálogo (o sin las notas del dueño) la tarjeta saldría sin pares o
    // sin notas como si fuera el dato real: es un error reintentable.
    const fallo = hoyos.error ?? ('error' in notas ? notas.error : null)
    if (fallo) {
      void captureError(fallo, { context: 'tarjeta-guardada.detalle', meta: { roundId: id } })
      return { estado: 'error' }
    }

    return {
      estado: 'ok',
      ronda: { ...ronda, notes: (notas.data as { notes: string | null } | null)?.notes ?? null },
      hoyosDelCatalogo: (hoyos.data as HoyoDeCatalogo[] | null) ?? [],
      nombreDelJugador: nombre,
      esDueño,
      hayVisitanteConSesion: !!user,
    }
  } catch (err) {
    void captureError(err, { context: 'tarjeta-guardada', meta: { roundId: id } })
    return { estado: 'error' }
  }
}

/**
 * `nombrePublico` del navegador: pide el nombre a `/api/tarjeta/[id]/jugador`.
 * Si falla, la tarjeta sale sin nombre (no es motivo para no mostrarla).
 */
export async function nombrePublicoDesdeApi(roundId: string): Promise<string | null> {
  try {
    const res = await fetch(`/api/tarjeta/${encodeURIComponent(roundId)}/jugador`)
    if (!res.ok) return null
    const { nombre } = (await res.json()) as { nombre?: unknown }
    return typeof nombre === 'string' && nombre ? nombre : null
  } catch {
    return null
  }
}
