// ─── Vista en vivo de una ronda libre desde el navegador ────────────────────
// Única forma en que el navegador obtiene los datos en vivo de una ronda libre:
// los pide ya armados a `/api/ronda-libre/[codigo]/live` (cacheable en el CDN).
// Reemplaza a la lectura directa a Supabase + Realtime (incidente 04-oct-2026).

import type { LoadRondaResult } from '@/app/ronda-libre/[codigo]/types'

import { fetchJsonConPlazo, JsonInvalidoError } from '@/lib/red/fetch-json-con-plazo'
import { TIMEOUT_EN_VIVO_MS } from '@/lib/red/plazos'
import { indiceVieneDelPerfil } from '@/golf/ronda-libre/permisos'

type RespuestaOk = Extract<LoadRondaResult, { status: 'ok' }>

function esPayloadEnVivo(x: unknown): x is Omit<RespuestaOk, 'status' | 'edadSegundos'> {
  const r = x as Partial<RespuestaOk> | null
  return !!r
    && !!r.ronda && Array.isArray(r.ronda.ronda_libre_jugadores)
    && typeof r.parMap === 'object' && r.parMap !== null
    && typeof r.siMap === 'object' && r.siMap !== null
    && typeof r.courseHcpMap === 'object' && r.courseHcpMap !== null
    && typeof r.displayHcpMap === 'object' && r.displayHcpMap !== null
    && Array.isArray(r.sinIndice)
    && Array.isArray(r.equipos)
}

/**
 * Datos en vivo de la ronda `codigo`.
 *
 * `credentials: 'omit'`: la respuesta es la misma para todos; sin cookies el
 * middleware no toca la sesión (no hay `Set-Cookie`) y el CDN puede servirla.
 * NUNCA `cache: 'no-store'`: el navegador mandaría `Pragma: no-cache` y Vercel
 * revalidaría en primer plano → cada poll pegaría a la base.
 *
 * - 404 → `not_found` (código inexistente).
 * - red caída / 5xx → `transient`: la UI conserva lo que ya mostraba y el
 *   próximo poll reintenta.
 * - respuesta con forma inesperada → `error`.
 *
 * `edadSegundos`: header `Age` del CDN (cuánto llevaba guardada la respuesta).
 */
export async function loadRondaLibre(codigo: string): Promise<LoadRondaResult> {
  let res: Response
  let json: unknown
  try {
    ({ res, json } = await fetchJsonConPlazo(`/api/ronda-libre/${encodeURIComponent(codigo)}/live`, { credentials: 'omit' }, TIMEOUT_EN_VIVO_MS))
  } catch (e) {
    // JSON inválido = la respuesta está mal (error); red caída o plazo = transient.
    return { status: e instanceof JsonInvalidoError ? 'error' : 'transient' }
  }
  if (res.status === 404) return { status: 'not_found' }
  if (!res.ok) return { status: 'transient' }
  if (!esPayloadEnVivo(json)) return { status: 'error' }
  const edad = Number(res.headers.get('age'))
  return {
    status: 'ok', ...json,
    // Respuesta de un deploy anterior al handicap de juego (aún en el CDN): sin el
    // mapa completo, la ronda jugaba al 100 % y los dos mapas son el mismo.
    courseHcpCompletoMap: completoOPuntua(json),
    edadSegundos: Number.isFinite(edad) && edad > 0 ? edad : 0,
  }
}

/** `courseHcpCompletoMap` de una respuesta; si no viene (deploy anterior), el que puntúa. */
function completoOPuntua(r: { courseHcpMap: Record<string, number>; courseHcpCompletoMap?: unknown }): Record<string, number> {
  return typeof r.courseHcpCompletoMap === 'object' && r.courseHcpCompletoMap !== null
    ? (r.courseHcpCompletoMap as Record<string, number>)
    : r.courseHcpMap
}

/** Handicaps que ve un visor CON SESIÓN (incluye el índice de perfil). */
export interface HcpConSesion {
  /** Handicap que PUNTÚA (con el % de la ronda). */
  courseHcpMap: Record<string, number>
  /** Course handicap COMPLETO: ajuste WHS de la tarjeta del historial. */
  courseHcpCompletoMap: Record<string, number>
  displayHcpMap: Record<string, number>
  sinIndice: string[]
  /** Índice de la tarjeta por jugador (la ruta pública de una ronda neto no lo trae). */
  handicapPorJugador?: Record<string, number | null>
  /** Handicap de equipo aplicado por el scorer (ídem). */
  handicapPorEquipo?: Record<string, number | null>
}

export type ResultadoHcpConSesion =
  | { status: 'ok'; data: HcpConSesion }
  | { status: 'sin-sesion' }
  | { status: 'error' }

/**
 * Pide a la ruta privada `/api/ronda-libre/[codigo]/hcp` los handicaps que sólo
 * ve un visor con sesión. Con cookies (es por visor) y nunca cacheada.
 * 401 → `sin-sesion` (queda lo público); cualquier otra falla → `error` (se reintenta).
 */
export async function loadHcpConSesion(codigo: string): Promise<ResultadoHcpConSesion> {
  try {
    // Mismo plazo único sobre fetch + cuerpo (si no, el spinner de neto quedaría eterno).
    const { res, json } = await fetchJsonConPlazo(`/api/ronda-libre/${encodeURIComponent(codigo)}/hcp`, {}, TIMEOUT_EN_VIVO_MS)
    if (res.status === 401) return { status: 'sin-sesion' }
    if (!res.ok) return { status: 'error' }
    const j = json as Partial<HcpConSesion> | null
    if (!j || typeof j.courseHcpMap !== 'object' || typeof j.displayHcpMap !== 'object' || !Array.isArray(j.sinIndice)) {
      return { status: 'error' }
    }
    return { status: 'ok', data: { ...(j as HcpConSesion), courseHcpCompletoMap: completoOPuntua(j as HcpConSesion) } }
  } catch {
    return { status: 'error' }
  }
}

/**
 * Lo público con los handicaps del visor con sesión encima, jugador por jugador:
 * para los ids que la ruta privada resolvió, manda ella.
 */
export function aplicarHcpConSesion(
  publico: Pick<HcpConSesion, 'courseHcpMap' | 'courseHcpCompletoMap' | 'displayHcpMap' | 'sinIndice'>,
  conSesion: HcpConSesion | null,
): Pick<HcpConSesion, 'courseHcpMap' | 'courseHcpCompletoMap' | 'displayHcpMap' | 'sinIndice'> {
  if (!conSesion) return publico
  const resueltos = new Set(Object.keys(conSesion.courseHcpMap))
  return {
    courseHcpMap: { ...publico.courseHcpMap, ...conSesion.courseHcpMap },
    courseHcpCompletoMap: { ...publico.courseHcpCompletoMap, ...conSesion.courseHcpCompletoMap },
    displayHcpMap: { ...publico.displayHcpMap, ...conSesion.displayHcpMap },
    sinIndice: [
      ...publico.sinIndice.filter(id => !resueltos.has(id)),
      ...conSesion.sinIndice.filter(id => resueltos.has(id)),
    ].filter((id, i, a) => a.indexOf(id) === i),
  }
}

/**
 * Ronda neto, visor con sesión: devuelve a jugadores y equipos el handicap que la
 * respuesta pública no trae (así el motor calcula el neto como antes).
 */
export function rehidratarHandicaps<R extends { ronda_libre_jugadores: Array<{ id: string; handicap?: number | null }> }, E extends { id: string; handicap_equipo: number | null }>(
  ronda: R,
  equipos: E[],
  conSesion: HcpConSesion,
): { ronda: R; equipos: E[] } {
  const hj = conSesion.handicapPorJugador ?? {}
  const he = conSesion.handicapPorEquipo ?? {}
  return {
    ronda: { ...ronda, ronda_libre_jugadores: ronda.ronda_libre_jugadores.map(j => (j.id in hj ? { ...j, handicap: hj[j.id] } : j)) },
    equipos: equipos.map(e => (e.id in he ? { ...e, handicap_equipo: he[e.id] } : e)),
  }
}

/**
 * Etiqueta del jugador que SABEMOS que no tiene índice (invitado sin índice, o con
 * cuenta y sin índice en el perfil ya leído). Decisión de Juanjo 19-oct-2026: "S/Ind".
 * Distinto de `null` (= el índice existe o puede existir pero este visor no lo ve).
 */
export const SIN_INDICE = 'S/Ind' as const

/** Lo que se pinta en el lugar del HCP: el número, `SIN_INDICE`, o `null` = no se muestra. */
export type HcpMostrado = number | typeof SIN_INDICE | null

/** El HCP que la vista en vivo y el scorer MUESTRAN de un jugador. */
export type HcpAMostrar = (jugadorId: string) => HcpMostrado

/**
 * FUENTE ÚNICA del HCP a mostrar en la vista en vivo y el scorer (columna, scorecard
 * expandido, match play, equipos y selector — #511). Un jugador en `sinIndice` juega
 * con 0, pero ese 0 no es un handicap y nunca se pinta:
 *  - si SABEMOS que no tiene índice → `SIN_INDICE`: su índice no viene del perfil
 *    (invitado, o lo fijó la tarjeta), o el perfil se leyó (`perfilLeido`);
 *  - si no se pudo saber (jugador con cuenta y el visor no lee perfiles: anónimo,
 *    decisión de privacidad 08-oct) → `null`.
 * Sin course handicap resuelto cae al handicap de la tarjeta redondeado; si tampoco
 * hay (ronda neto vista sin sesión: no viaja ninguno) → `null`, nunca un 0 de relleno.
 *
 * `perfilLeido`: `'todos'` si el índice de perfil de todos se leyó (scorer con sesión),
 * o los ids de los jugadores cuyo índice resolvió la ruta con sesión.
 */
export function crearHcpAMostrar(
  jugadores: ReadonlyArray<{ id: string; user_id?: string | null; handicap?: number | null }>,
  displayHcpMap: Readonly<Record<string, number>>,
  sinIndice: readonly string[],
  perfilLeido: ReadonlySet<string> | 'todos',
): HcpAMostrar {
  const sin = new Set(sinIndice)
  const porId = new Map(jugadores.map(j => [j.id, j]))
  return (id) => {
    const j = porId.get(id)
    if (sin.has(id)) {
      const sabemos = !j || !indiceVieneDelPerfil(j) || perfilLeido === 'todos' || perfilLeido.has(id)
      return sabemos ? SIN_INDICE : null
    }
    const display = displayHcpMap[id]
    if (display != null) return display
    const h = j?.handicap ?? null
    return h != null ? Math.round(h) : null
  }
}
