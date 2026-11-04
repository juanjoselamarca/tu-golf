// ─── Capa de datos — vista live de ronda-libre ([codigo]/page.tsx) ──────────
// Arma, en el SERVIDOR, todo lo que muestra la vista pública: la ronda + cancha
// + course handicap + equipos. El navegador ya no lee Supabase directo: pide el
// resultado a `/api/ronda-libre/[codigo]/live` (cacheable en el CDN), que llama a
// `cargarRondaLibreEnVivo` (reemplazo de Supabase Realtime, incidente 04-oct-2026).
//
// El índice de los jugadores se resuelve con un único query batch
// `.in('id', userIds)` en vez de un query por jugador (sin N+1).

import { indiceVieneDelPerfil } from '@/golf/ronda-libre/permisos'
import { parTotalEstandar } from '@/golf/core/round-score'
import { resolverCourseHandicap, resolverHandicapDisplayDeRonda, resolverCourseData, type CourseData } from '@/golf/core/course-handicap'
import { hcpPctDeRonda, resolverHandicapDeJuego } from '@/golf/core/playing-handicap'
import { normalizeStrokeIndexMap } from '@/golf/core/stroke-index'
import { hoyosDeLaVuelta } from '@/golf/courses/vueltas'
import { fetchHoyosDeLaRonda } from './course-holes'
import type { CourseHole, RondaLibre } from '@/types/ronda'
import { conJugadoresOrdenados } from '@/lib/ronda/orden-jugadores'
import type { Equipo, LoadRondaResult } from '@/app/ronda-libre/[codigo]/types'
import { isTeamFormat } from '@/golf/formats'
import type { SupabaseClient } from '@supabase/supabase-js'
import { captureError } from '@/lib/error-tracking'
import { teeDelJugador } from '@/golf/ronda-libre/tee-del-jugador'
import type { LeerIndicesDePerfil } from './indices-de-perfil-lectura'

/**
 * Equipos de una ronda libre (ronda_equipos + sus jugadores en orden). Fuente
 * única: la vista en vivo, el push a seguidores y cualquier board de equipos
 * leen de acá — nunca una segunda query a ronda_equipos.
 */
export async function fetchRondaEquipos(
  supabase: Pick<SupabaseClient, 'from'>,
  rondaId: string,
): Promise<Equipo[]> {
  // Mantiene el comportamiento previo del scorer y del push: un error de lectura
  // equivalía a "sin equipos" (el feed /en-vivo sí lo propaga: ver fetchEquiposDeRondas).
  // Ahora al menos queda registrado.
  try {
    return (await fetchEquiposDeRondas(supabase, [rondaId])).get(rondaId) ?? []
  } catch (err) {
    void captureError(err, { context: 'data.fetchRondaEquipos', level: 'warning', meta: { rondaId } })
    return []
  }
}

/**
 * Equipos de VARIAS rondas en una sola query (el feed /en-vivo lista hasta 50 y
 * en un día de torneo varias son scramble: sin esto, N+1 en un endpoint público).
 * Devuelve ronda_id → equipos en orden de creación; una ronda sin equipos no
 * aparece en el mapa. Un error de PostgREST se LANZA: un mapa vacío por error
 * publicaría todos los scramble del feed como "Thru 0" sin que nadie se entere.
 */
export async function fetchEquiposDeRondas(
  supabase: Pick<SupabaseClient, 'from'>,
  rondaIds: readonly string[],
): Promise<Map<string, Equipo[]>> {
  const porRonda = new Map<string, Equipo[]>()
  if (rondaIds.length === 0) return porRonda
  // `id` desempata equipos insertados en el mismo instante (un solo INSERT comparte
  // now()): sin eso el "1." de dos equipos en cero podía alternar entre requests.
  const { data: eqData, error } = await supabase
    .from('ronda_equipos')
    .select('id, nombre, handicap_equipo, handicap_equipo_juego, scores, ronda_id, ronda_equipo_jugadores(jugador_id, orden)')
    .in('ronda_id', [...rondaIds])
    .order('created_at')
    .order('id')
  if (error) throw error
  for (const e of eqData ?? []) {
    const rondaId = e.ronda_id as string
    const lista = porRonda.get(rondaId) ?? []
    lista.push({
      id: e.id as string,
      nombre: e.nombre as string,
      handicap_equipo: e.handicap_equipo as number | null,
      handicap_equipo_juego: (e.handicap_equipo_juego as number | null) ?? null,
      scores: (e.scores as Record<string, number>) || {},
      jugadorIds: ((e.ronda_equipo_jugadores || []) as Array<{ jugador_id: string; orden: number }>)
        .sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0))
        .map(m => m.jugador_id),
    })
    porRonda.set(rondaId, lista)
  }
  return porRonda
}

type RondaParaHandicap = Pick<RondaLibre, 'course_id' | 'tees' | 'holes' | 'recorridos' | 'hcp_pct'> & {
  ronda_libre_jugadores: Array<{ id: string; user_id?: string | null; handicap?: number | null; tees?: string | null }>
}

/**
 * Índice y course handicap de SCORING de cada jugador de una ronda libre (WHS,
 * tee por jugador; 9 hoyos → índice/2 con ratings de 9). FUENTE ÚNICA: la usan la
 * vista en vivo (`cargarRondaLibreEnVivo`), el scorer y el GWI (`/api/gwi/ronda-libre/[codigo]`,
 * lector de servicio). Antes el GWI repartía golpes con el ÍNDICE crudo, sin
 * slope ni mitad de 9 hoyos.
 *
 * Índice: `handicap` de la tarjeta; si falta y hay cuenta, `profiles.indice`; si
 * no hay índice declarado, 0 (juega sin golpes de ventaja: no se inventan 18).
 * Decisión 01-oct-2026 al unificar con el scorer, que ya usaba 0; en prod los 80
 * invitados sin índice juegan en modo gross, donde no cambia nada.
 * `parDeLaCancha` es el par de la CANCHA (no el de la ronda): escala del rating.
 *
 * Handicap de juego (`rondas_libres.hcp_pct`, lo hereda la tarjeta de un grupo de
 * torneo): `courseHcpMap` es el handicap que PUNTÚA, ya con el % aplicado sobre el
 * course handicap sin redondear (`resolverHandicapDeJuego`, WHS 6.2a). Lo usan el
 * neto, los puntos y el match. `courseHcpCompletoMap` es el course handicap al
 * 100 %: SOLO para los ajustes WHS de la tarjeta que va al índice (doble bogey
 * neto, Regla 3.1b). En una ronda al 100 % los dos mapas son iguales.
 *
 * `leerIndices` (OBLIGATORIO, sin default — #511): quién lee `profiles.indice`.
 * La única policy SELECT de `profiles` es `TO authenticated`: con un cliente
 * anónimo la lectura devuelve 0 filas SIN error y el jugador quedaría con índice 0
 * (neto puntuado como gross). Cada caller decide a conciencia:
 *  - servidor que atiende anónimos → `indicesDePerfil` (`indices-de-perfil.ts`, servicio);
 *  - navegador o ruta con sesión obligatoria → `leerIndicesDelCliente(supabase)` (`indices-de-perfil-lectura.ts`);
 *  - `null` = NO leer perfiles (respuesta pública cacheada): esos jugadores quedan en `sinIndice`.
 * Un jugador cuyo índice no se pudo leer NUNCA sale con índice silencioso: queda en `sinIndice`.
 */
export async function courseHandicapsDeRonda(
  supabase: SupabaseClient,
  ronda: RondaParaHandicap,
  parDeLaCancha: number,
  leerIndices: LeerIndicesDePerfil | null,
): Promise<{
  /** Handicap que PUNTÚA (con el % de la ronda). */
  courseHcpMap: Record<string, number>
  /** Course handicap COMPLETO (100 %): solo ajustes WHS de la tarjeta del historial. */
  courseHcpCompletoMap: Record<string, number>
  indexByJugador: Record<string, number>
  /** Jugadores sin índice declarado (ni en la tarjeta ni en el perfil): juegan con 0, pero WHS 3.1b los topa en par + 5. */
  sinIndice: Set<string>
  courseDataByTee: Record<string, CourseData | null>
}> {
  const idsNeedingIndex = ronda.ronda_libre_jugadores
    .filter(indiceVieneDelPerfil)
    .map(j => j.user_id as string)
  // Lectura que falla CERRADO (`leerIndicesDePerfilCon` lanza ante error): con el
  // error tragado, el jugador quedaría con índice 0 y el neto saldría como gross.
  const indexByUserId: ReadonlyMap<string, number> =
    idsNeedingIndex.length > 0 && leerIndices ? await leerIndices(idsNeedingIndex) : new Map()

  // Course data de cada tee único EN PARALELO (damas/varones = 2 cadenas de hasta 3
  // queries; en serie alargaban la carga en frío del scorer).
  const tees = Array.from(new Set(ronda.ronda_libre_jugadores.map(j => teeDelJugador(j, ronda))))
  const datos = await Promise.all(tees.map(tee => ronda.course_id
    ? resolverCourseData(supabase, ronda.course_id, tee, ronda.holes, parDeLaCancha, (ronda.recorridos as string[] | null) ?? null)
    : Promise.resolve(null)))
  const courseDataByTee: Record<string, CourseData | null> = Object.fromEntries(tees.map((t, i) => [t, datos[i]]))

  const hcpPct = hcpPctDeRonda(ronda)
  const courseHcpMap: Record<string, number> = {}
  const courseHcpCompletoMap: Record<string, number> = {}
  const indexByJugador: Record<string, number> = {}
  const sinIndice = new Set<string>()
  for (const j of ronda.ronda_libre_jugadores) {
    const declarado = indiceVieneDelPerfil(j) ? indexByUserId.get(j.user_id as string) : (j.handicap ?? undefined)
    if (declarado == null) sinIndice.add(j.id)
    const index = declarado ?? 0
    indexByJugador[j.id] = index
    const courseData = courseDataByTee[teeDelJugador(j, ronda)]
    courseHcpMap[j.id] = resolverHandicapDeJuego(index, courseData, ronda.holes, hcpPct)
    courseHcpCompletoMap[j.id] = resolverCourseHandicap(index, courseData, ronda.holes)
  }
  return { courseHcpMap, courseHcpCompletoMap, indexByJugador, sinIndice, courseDataByTee }
}

/** Hoyo de catálogo tal como lo devuelve `fetchHoyosDeLaRonda` (lo que usa la vista en vivo). */
export interface HoyoDeCatalogoEnVivo {
  numero: number
  par: number
  stroke_index: number
}

/**
 * Par y stroke index por hoyo DE LA RONDA para la vista en vivo (función pura).
 *
 * Los hoyos de la RONDA, no los del catálogo: una cancha de 9 hoyos en una ronda
 * de 18 se recorre dos veces y los hoyos 10-18 son los 1-9 otra vez
 * (`@/golf/courses/vueltas`). Tiene que contestar LO MISMO que el scorer: si esta
 * capa dijera par 35 y el scorer 70, el board y la tarjeta del jugador mostrarían
 * netos distintos para la misma ronda.
 *
 * El SI sale normalizado a permutación válida 1..N (un concepto, una fuente):
 * TODOS los consumidores del siMap —leaderboard, tarjeta de compartir, match play,
 * notificaciones y el detalle hoyo-a-hoyo— reparten los golpes de hándicap sobre
 * el MISMO SI. Sin esto, un SI corrupto de catálogo, o el SI 1..18 de una cancha
 * de 18h jugada como loop de 9h, haría que el leaderboard (que normaliza) y la
 * tarjeta de compartir (que no) mostraran netos distintos. Idempotente sobre un SI
 * ya válido. Bug de campo "net +12 Don Jorge" (inbox e6408e3c).
 *
 * Sin catálogo → mapas vacíos (los consumidores usan sus defaults) y `parTotal`
 * estándar de la cantidad de hoyos.
 */
export function parYSiDeLaRonda(
  catalogo: readonly HoyoDeCatalogoEnVivo[],
  totalHoyos: number,
): { parMap: Record<number, number>; siMap: Record<number, number>; parTotal: number } {
  const parMap: Record<number, number> = {}
  let siMap: Record<number, number> = {}
  if (catalogo.length === 0) return { parMap, siMap, parTotal: parTotalEstandar(totalHoyos) }

  const base = catalogo.map((h) => ({ numero: h.numero, par: h.par, stroke_index: h.stroke_index }))
  for (const h of hoyosDeLaVuelta(base, totalHoyos)) {
    parMap[h.numero] = h.par
    siMap[h.numero] = h.stroke_index
  }
  if (Object.keys(siMap).length > 0) siMap = normalizeStrokeIndexMap(siMap, totalHoyos)
  const parTotal = Object.values(parMap).reduce((a, b) => a + b, 0)
  return { parMap, siMap, parTotal }
}

/** Columnas de la ronda que viajan a la vista en vivo (las mismas que leía el navegador). */
export const COLUMNAS_RONDA_EN_VIVO =
  'id, codigo, course_name, course_id, tees, holes, hoyo_inicio, fecha, estado, modo_juego, formato_juego, admin_mode, admin_user_id, creador_id, recorridos, hcp_pct, ronda_libre_jugadores(id, nombre, user_id, scores, handicap, tees)'

/**
 * Arma TODO lo que muestra la vista en vivo de una ronda libre: la ronda + par/SI
 * por hoyo + course handicap (scoring y display) por jugador + equipos.
 * FUENTE ÚNICA: la usa la ruta pública cacheable `/api/ronda-libre/[codigo]/live`
 * (que reemplazó a Supabase Realtime, incidente Los Leones 04-oct-2026).
 *
 * `supabase` lee las tablas públicas (RLS `true` para SELECT). `leerIndices`
 * (obligatorio, contrato de `courseHandicapsDeRonda`) lee SÓLO el índice de los
 * jugadores con cuenta que no lo fijaron en la tarjeta; `null` = no se leen
 * perfiles (esos jugadores quedan en `sinIndice`). Si la lectura falla, la carga
 * devuelve `error` (nunca índice 0). El índice crudo nunca sale de acá.
 *
 * Devuelve un discriminated union que distingue 404 real de error transitorio,
 * para que la UI conserve la data previa ante caídas (CERO FALLOS).
 */
export async function cargarRondaLibreEnVivo(
  supabase: SupabaseClient,
  codigo: string,
  leerIndices: LeerIndicesDePerfil | null,
): Promise<LoadRondaResult> {
  try {
    const { data, error } = await supabase
      .from('rondas_libres')
      .select(COLUMNAS_RONDA_EN_VIVO)
      .eq('codigo', codigo)
      .single()

    if (!data) {
      // 404 real → not_found. Errores transitorios (red/statement timeout) → reintentar.
      if (error?.code === 'PGRST116' || (!error && !data)) {
        return { status: 'not_found' }
      }
      return { status: 'transient' }
    }

    // Orden estable de los jugadores: el embebido llega en orden físico, que cambia con cada guardado.
    const ronda = conJugadoresOrdenados(data as unknown as RondaLibre)

    // Par / stroke-index por hoyo (solo si la ronda está ligada a una cancha).
    // Fuente única de hoyos: ya viene ordenada por la selección de recorridos y
    // renumerada (en los complejos de 27 hoyos el par cuelga de los recorridos hijos).
    const catalogo = ronda.course_id
      ? ((await fetchHoyosDeLaRonda(
          supabase,
          ronda.course_id,
          ronda.recorridos as string[] | null,
          'numero, par, stroke_index, recorrido',
        )) as unknown as CourseHole[])
      : []
    const { parMap, siMap, parTotal: finalParTotal } = parYSiDeLaRonda(catalogo, ronda.holes)

    // Course handicap de SCORING por jugador: fuente única `courseHandicapsDeRonda`
    // (la usa también el GWI server-side, con el lector de servicio).
    const { courseHcpMap, courseHcpCompletoMap, indexByJugador, sinIndice, courseDataByTee } =
      await courseHandicapsDeRonda(supabase, ronda, finalParTotal, leerIndices)

    // Display (columna HCP): el COMPLETO de 18h, para que una ronda de 9h no muestre
    // la mitad y pierda significado (un concepto, una fuente — `course-handicap.ts`).
    const courseDataFullByTee = new Map<string, CourseData | null>()
    const displayHcpMap: Record<string, number> = {}
    for (const j of ronda.ronda_libre_jugadores) {
      const index = indexByJugador[j.id]
      const playerTee = teeDelJugador(j, ronda)
      const courseData9h = courseDataByTee[playerTee] ?? null

      // Display: en rondas de 9h cargamos los ratings de 18h del MISMO tee y
      // resolvemos el course handicap completo. `finalParTotal` ES el par de 18h
      // SÓLO cuando la ronda NO tiene recorridos (la query de course_holes trae
      // los 18 hoyos). En una cancha multi-recorrido jugada como un loop de 9h,
      // `finalParTotal` es el par del loop (~36) y no podemos derivar el de 18h de
      // forma confiable → mostramos round(index) (handicap completo aprox), nunca
      // un valor inflado. Cacheado por tee.
      displayHcpMap[j.id] = await resolverHandicapDisplayDeRonda(
        index,
        courseData9h,
        {
          courseId: ronda.course_id,
          tee: playerTee,
          finalParTotal,
          tieneRecorridos: !!(ronda.recorridos as string[] | null)?.length,
        },
        courseDataFullByTee,
      )
    }

    // Equipos (solo modalidades por equipo).
    const equipos: Equipo[] = isTeamFormat(ronda.formato_juego)
      ? await fetchRondaEquipos(supabase, ronda.id)
      : []

    return {
      status: 'ok', ronda, parMap, siMap, courseHcpMap, courseHcpCompletoMap, displayHcpMap,
      sinIndice: [...sinIndice], equipos,
    }
  } catch {
    return { status: 'error' }
  }
}
