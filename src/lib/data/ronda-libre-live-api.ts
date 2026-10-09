// ─── Vista en vivo de una ronda libre desde el navegador ────────────────────
// Única forma en que el navegador obtiene los datos en vivo de una ronda libre:
// los pide ya armados a `/api/ronda-libre/[codigo]/live` (cacheable en el CDN).
// Reemplaza a la lectura directa a Supabase + Realtime (incidente 04-oct-2026).

import type { LoadRondaResult } from '@/app/ronda-libre/[codigo]/types'

import { conTimeout } from '@/lib/red/con-timeout'

/** Una consulta colgada (base o red lenta) no puede bloquear el polling: se corta a los 8 s. */
export const TIMEOUT_EN_VIVO_MS = 8_000

/** El servidor respondió 2xx pero el cuerpo no es JSON: es un `error`, no un corte de red. */
class JsonInvalidoError extends Error {}

/**
 * `fetch` + lectura del CUERPO bajo UN solo plazo: fuente única `conTimeout`
 * (red/con-timeout.ts) + un AbortController propio que se aborta si vence. El plazo
 * cubre también el cuerpo: con 4G degradado llegan los headers y el cuerpo queda a
 * medias; si sólo se cubrieran los headers, `res.json()` colgaría el polling para
 * siempre (useLivePoll espera la consulta en curso). Sin `AbortSignal.timeout`, que
 * no existe en iOS 15. El cuerpo sólo se lee si `res.ok`.
 *
 * Lanza `JsonInvalidoError` si el cuerpo no es JSON; cualquier otra excepción es de
 * red o de plazo.
 */
async function fetchJsonConPlazo(url: string, init: RequestInit): Promise<{ res: Response; json: unknown }> {
  const control = new AbortController()
  const tarea = (async () => {
    const res = await fetch(url, { ...init, signal: control.signal })
    if (!res.ok) {
      // Cuerpo que no se va a leer (401/404/5xx): se descarta para liberar la conexión
      // (si no, queda abierta hasta que el GC la recoja).
      void res.body?.cancel().catch(() => {})
      return { res, json: undefined }
    }
    const texto = await res.text()
    try {
      return { res, json: JSON.parse(texto) as unknown }
    } catch {
      throw new JsonInvalidoError('Respuesta no es JSON')
    }
  })()
  try {
    return await conTimeout(tarea, TIMEOUT_EN_VIVO_MS)
  } catch (e) {
    control.abort()
    throw e
  }
}

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
    ({ res, json } = await fetchJsonConPlazo(`/api/ronda-libre/${encodeURIComponent(codigo)}/live`, { credentials: 'omit' }))
  } catch (e) {
    // JSON inválido = la respuesta está mal (error); red caída o plazo = transient.
    return { status: e instanceof JsonInvalidoError ? 'error' : 'transient' }
  }
  if (res.status === 404) return { status: 'not_found' }
  if (!res.ok) return { status: 'transient' }
  if (!esPayloadEnVivo(json)) return { status: 'error' }
  const edad = Number(res.headers.get('age'))
  return { status: 'ok', ...json, edadSegundos: Number.isFinite(edad) && edad > 0 ? edad : 0 }
}

/** Handicaps que ve un visor CON SESIÓN (incluye el índice de perfil). */
export interface HcpConSesion {
  courseHcpMap: Record<string, number>
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
    const { res, json } = await fetchJsonConPlazo(`/api/ronda-libre/${encodeURIComponent(codigo)}/hcp`, {})
    if (res.status === 401) return { status: 'sin-sesion' }
    if (!res.ok) return { status: 'error' }
    const j = json as Partial<HcpConSesion> | null
    if (!j || typeof j.courseHcpMap !== 'object' || typeof j.displayHcpMap !== 'object' || !Array.isArray(j.sinIndice)) {
      return { status: 'error' }
    }
    return { status: 'ok', data: j as HcpConSesion }
  } catch {
    return { status: 'error' }
  }
}

/**
 * Lo público con los handicaps del visor con sesión encima, jugador por jugador:
 * para los ids que la ruta privada resolvió, manda ella.
 */
export function aplicarHcpConSesion(
  publico: Pick<HcpConSesion, 'courseHcpMap' | 'displayHcpMap' | 'sinIndice'>,
  conSesion: HcpConSesion | null,
): Pick<HcpConSesion, 'courseHcpMap' | 'displayHcpMap' | 'sinIndice'> {
  if (!conSesion) return publico
  const resueltos = new Set(Object.keys(conSesion.courseHcpMap))
  return {
    courseHcpMap: { ...publico.courseHcpMap, ...conSesion.courseHcpMap },
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
