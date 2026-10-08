// ─── Vista en vivo de una ronda libre desde el navegador ────────────────────
// Única forma en que el navegador obtiene los datos en vivo de una ronda libre:
// los pide ya armados a `/api/ronda-libre/[codigo]/live` (cacheable en el CDN).
// Reemplaza a la lectura directa a Supabase + Realtime (incidente 04-oct-2026).

import type { LoadRondaResult } from '@/app/ronda-libre/[codigo]/types'

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
  try {
    res = await fetch(`/api/ronda-libre/${encodeURIComponent(codigo)}/live`, { credentials: 'omit' })
  } catch {
    return { status: 'transient' }
  }
  if (res.status === 404) return { status: 'not_found' }
  if (!res.ok) return { status: 'transient' }
  try {
    const json: unknown = await res.json()
    if (!esPayloadEnVivo(json)) return { status: 'error' }
    const edad = Number(res.headers.get('age'))
    return { status: 'ok', ...json, edadSegundos: Number.isFinite(edad) && edad > 0 ? edad : 0 }
  } catch {
    return { status: 'error' }
  }
}

/** Course handicap que ve un visor CON SESIÓN (incluye el índice de perfil). */
export interface HcpConSesion {
  courseHcpMap: Record<string, number>
  displayHcpMap: Record<string, number>
  sinIndice: string[]
}

/**
 * Pide a la ruta privada `/api/ronda-libre/[codigo]/hcp` el course handicap con el
 * índice de perfil de los jugadores con cuenta. Con cookies (es por visor) y nunca
 * cacheada. `null` = sin sesión (401) o cualquier falla: se queda lo público.
 */
export async function loadHcpConSesion(codigo: string): Promise<HcpConSesion | null> {
  try {
    const res = await fetch(`/api/ronda-libre/${encodeURIComponent(codigo)}/hcp`)
    if (!res.ok) return null
    const j = (await res.json()) as Partial<HcpConSesion> | null
    if (!j || typeof j.courseHcpMap !== 'object' || typeof j.displayHcpMap !== 'object' || !Array.isArray(j.sinIndice)) return null
    return { courseHcpMap: j.courseHcpMap!, displayHcpMap: j.displayHcpMap!, sinIndice: j.sinIndice }
  } catch {
    return null
  }
}

/**
 * Lo público con el course handicap del visor con sesión encima, jugador por
 * jugador: para los ids que la ruta privada resolvió, manda ella.
 */
export function aplicarHcpConSesion(
  publico: HcpConSesion,
  conSesion: HcpConSesion | null,
): HcpConSesion {
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
