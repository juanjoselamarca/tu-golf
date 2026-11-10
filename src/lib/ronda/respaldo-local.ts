// src/lib/ronda/respaldo-local.ts
//
// Respaldo offline de los golpes (`golfers_score_<codigo>_<jugador>`): lo escribe el
// scorer ANTES de mandar al servidor y queda `sincronizado: false` hasta que el
// servidor confirma esa tarjeta. Lo usan el scorer individual (vía `useScoreSync`),
// el de torneo (con el slug como código) y el banner "Sincronizando…".

import { borrarClavesConPrefijo } from '@/lib/local-storage-prefijo'

export const PREFIJO_RESPALDO = 'golfers_score_'

export interface RespaldoLocal {
  scores: Record<number, number>
  timestamp: number
  sincronizado: boolean
  codigoRonda: string
  jugadorId: string
}

export const claveDelRespaldo = (codigoRonda: string, jugadorId: string) => `${PREFIJO_RESPALDO}${codigoRonda}_${jugadorId}`

/** Todos los respaldos del teléfono (de rondas libres y de torneos), sin los corruptos. */
function leerTodos(): RespaldoLocal[] {
  const out: RespaldoLocal[] = []
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)
      if (!k?.startsWith(PREFIJO_RESPALDO)) continue
      try {
        const data = JSON.parse(localStorage.getItem(k) ?? 'null') as RespaldoLocal | null
        if (data && typeof data === 'object') out.push(data)
      } catch { /* entrada corrupta: se ignora */ }
    }
  } catch { /* modo privado */ }
  return out
}

const estaPendiente = (r: RespaldoLocal) => !r.sincronizado && !!r.scores && Object.keys(r.scores).length > 0

/** La tarjeta del respaldo que el servidor todavía no confirmó, o null si no hay nada pendiente. */
export function leerRespaldoPendiente(codigoRonda: string, jugadorId: string): Record<number, number> | null {
  try {
    const raw = localStorage.getItem(claveDelRespaldo(codigoRonda, jugadorId))
    if (!raw) return null
    const data: RespaldoLocal = JSON.parse(raw)
    return estaPendiente(data) ? data.scores : null
  } catch { return null }
}

/** Hoyos que el servidor todavía no confirmó, sumando todos los respaldos (lo que muestra el banner). */
export function contarHoyosPendientes(): number {
  return leerTodos().filter(estaPendiente).reduce((n, r) => n + Object.keys(r.scores).length, 0)
}

/**
 * Formato del código de una ronda libre: mayúsculas y dígitos (en prod hay de 5 a 9 caracteres;
 * el generador da hasta 6 y su respaldo 8; los de prueba, más). Los slugs de torneo, que también
 * escriben respaldos con este prefijo, van en minúsculas y con guiones: nunca calzan.
 */
export const CODIGO_RONDA_LIBRE = /^[A-Z0-9]{4,12}$/

/** Códigos de ronda libre con algún respaldo sin sincronizar (sin repetir). */
export function codigosConRespaldoPendiente(): string[] {
  const codigos = new Set<string>()
  for (const r of leerTodos()) {
    if (estaPendiente(r) && typeof r.codigoRonda === 'string' && CODIGO_RONDA_LIBRE.test(r.codigoRonda)) codigos.add(r.codigoRonda)
  }
  return [...codigos]
}

/** Con `enviados`, marca sólo si el respaldo sigue siendo esa tarjeta: una más nueva queda pendiente. */
export function marcarRespaldoSincronizado(codigoRonda: string, jugadorId: string, enviados?: Record<number, number>): void {
  const key = claveDelRespaldo(codigoRonda, jugadorId)
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return
    const data: RespaldoLocal = JSON.parse(raw)
    // Las claves son hoyos (enteros): JSON.stringify las ordena igual en las dos.
    if (enviados && JSON.stringify(data.scores) !== JSON.stringify(enviados)) return
    data.sincronizado = true
    localStorage.setItem(key, JSON.stringify(data))
  } catch { /* silencioso */ }
}

/**
 * Borra los respaldos de TODOS los jugadores de una ronda (los que anotó este teléfono). Sólo con
 * la ronda confirmada como borrada o cerrada por el servidor: nunca por una lectura sin señal o una
 * sesión vencida. El `_` final del prefijo evita tocar otra ronda cuyo código empiece igual (ABC vs ABCD).
 */
export function borrarRespaldosDeRonda(codigoRonda: string): void {
  borrarClavesConPrefijo(claveDelRespaldo(codigoRonda, ''))
}
