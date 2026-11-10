// src/lib/ronda/respaldo-local.ts
//
// Respaldo offline de los golpes (`golfers_score_<codigo>_<jugador>`): lo escribe el
// scorer ANTES de mandar al servidor y queda `sincronizado: false` hasta que el
// servidor confirma esa tarjeta. Lo usan el scorer individual (vía `useScoreSync`),
// el de torneo (con el slug como código) y el banner "Sincronizando…".

import { borrarClavesConPrefijo } from '@/lib/local-storage-prefijo'

export const PREFIJO_RESPALDO = 'golfers_score_'

const DIA_MS = 24 * 60 * 60 * 1000
/** Un respaldo ya confirmado por el servidor se guarda una semana más y se barre. */
export const DIAS_RETENCION_RESPALDO_SINCRONIZADO = 7
/**
 * Un respaldo sin enviar de una ronda CERRADA no se borra al tiro: la ronda se puede reabrir
 * (reabrir un torneo devuelve sus rondas a 'en_curso') y esos golpes son lo único que hay.
 * Pasado este plazo desde que se vio cerrada, se barre.
 */
export const DIAS_RETENCION_RESPALDO_RONDA_CERRADA = 30

export interface RespaldoLocal {
  scores: Record<number, number>
  timestamp: number
  sincronizado: boolean
  codigoRonda: string
  jugadorId: string
  /**
   * Cuándo el conciliador vio la ronda 'finalizada' con esta tarjeta sin enviar. Mientras esté,
   * el banner no la cuenta (no hay a dónde subirla), pero el scorer la sigue leyendo: si la ronda
   * se reabre, la mezcla y la reenvía. El conciliador la quita si la ronda vuelve a 'en_curso'.
   */
  rondaCerradaEn?: number
}

export const claveDelRespaldo = (codigoRonda: string, jugadorId: string) => `${PREFIJO_RESPALDO}${codigoRonda}_${jugadorId}`

/** Todos los respaldos del teléfono (de rondas libres y de torneos), sin los corruptos. */
function leerTodos(): { clave: string; r: RespaldoLocal }[] {
  const out: { clave: string; r: RespaldoLocal }[] = []
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const clave = localStorage.key(i)
      if (!clave?.startsWith(PREFIJO_RESPALDO)) continue
      try {
        const r = JSON.parse(localStorage.getItem(clave) ?? 'null') as RespaldoLocal | null
        if (r && typeof r === 'object') out.push({ clave, r })
      } catch { /* entrada corrupta: se ignora */ }
    }
  } catch { /* modo privado */ }
  return out
}

/**
 * Formato del código de una ronda libre: mayúsculas y dígitos (en prod hay de 5 a 9 caracteres;
 * el generador da hasta 6 y su respaldo 8; los de prueba, más). Los slugs de torneo, que también
 * escriben respaldos con este prefijo, van en minúsculas y con guiones: nunca calzan.
 */
export const CODIGO_RONDA_LIBRE = /^[A-Z0-9]{4,12}$/

/** Golpes que el servidor no confirmó (de una ronda abierta o cerrada). */
const sinEnviar = (r: RespaldoLocal) => !r.sincronizado && !!r.scores && Object.keys(r.scores).length > 0
/** Lo que el banner cuenta como "por sincronizar": sin enviar y con la ronda abierta. */
const estaPendiente = (r: RespaldoLocal) => sinEnviar(r) && r.rondaCerradaEn == null
const esDeRondaLibre = (r: RespaldoLocal) => typeof r.codigoRonda === 'string' && CODIGO_RONDA_LIBRE.test(r.codigoRonda)

/**
 * La tarjeta del respaldo que el servidor todavía no confirmó, o null si no hay nada sin enviar.
 * Incluye las de una ronda vista cerrada: si se reabre, el scorer las mezcla y las reenvía.
 */
export function leerRespaldoPendiente(codigoRonda: string, jugadorId: string): Record<number, number> | null {
  try {
    const raw = localStorage.getItem(claveDelRespaldo(codigoRonda, jugadorId))
    if (!raw) return null
    const data: RespaldoLocal = JSON.parse(raw)
    return sinEnviar(data) ? data.scores : null
  } catch { return null }
}

/** Hoyos que el servidor todavía no confirmó, sumando todos los respaldos (lo que muestra el banner). */
export function contarHoyosPendientes(): number {
  return leerTodos().filter(({ r }) => estaPendiente(r)).reduce((n, { r }) => n + Object.keys(r.scores).length, 0)
}

/** Códigos de ronda libre con algún respaldo que el banner cuenta (sin repetir). */
export function codigosConRespaldoPendiente(): string[] {
  return [...new Set(leerTodos().filter(({ r }) => estaPendiente(r) && esDeRondaLibre(r)).map(({ r }) => r.codigoRonda))]
}

/** Códigos de ronda libre con respaldos sin enviar de una ronda vista cerrada (sin repetir). */
export function codigosConRespaldoDeRondaCerrada(): string[] {
  return [...new Set(leerTodos().filter(({ r }) => sinEnviar(r) && r.rondaCerradaEn != null && esDeRondaLibre(r)).map(({ r }) => r.codigoRonda))]
}

/** Reescribe los respaldos de una ronda para los que `cambia` devuelve algo. Devuelve si cambió alguno. */
function reescribirRespaldosDeRonda(codigoRonda: string, cambia: (r: RespaldoLocal) => RespaldoLocal | null): boolean {
  const prefijo = claveDelRespaldo(codigoRonda, '')
  let cambio = false
  for (const { clave, r } of leerTodos()) {
    if (!clave.startsWith(prefijo)) continue
    const nuevo = cambia(r)
    if (!nuevo) continue
    try { localStorage.setItem(clave, JSON.stringify(nuevo)); cambio = true } catch { /* cuota / modo privado */ }
  }
  return cambio
}

/** La ronda está cerrada: sus tarjetas sin enviar salen del banner, pero NO se borran. */
export function marcarRespaldosDeRondaCerrada(codigoRonda: string, ahora = Date.now()): boolean {
  return reescribirRespaldosDeRonda(codigoRonda, r => (sinEnviar(r) && r.rondaCerradaEn == null ? { ...r, rondaCerradaEn: ahora } : null))
}

/** La ronda se reabrió: sus tarjetas sin enviar vuelven al banner (y el scorer las reenvía). */
export function desmarcarRespaldosDeRondaCerrada(codigoRonda: string): boolean {
  return reescribirRespaldosDeRonda(codigoRonda, r => {
    if (r.rondaCerradaEn == null) return null
    const resto = { ...r }
    delete resto.rondaCerradaEn
    return resto
  })
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
    delete data.rondaCerradaEn
    localStorage.setItem(key, JSON.stringify(data))
  } catch { /* silencioso */ }
}

/**
 * Barre lo que ya no sirve: respaldos confirmados por el servidor hace más de
 * `DIAS_RETENCION_RESPALDO_SINCRONIZADO` días y los de una ronda vista cerrada hace más de
 * `DIAS_RETENCION_RESPALDO_RONDA_CERRADA`. Lo sin enviar de una ronda abierta no se toca nunca.
 */
export function barrerRespaldosViejos(ahora = Date.now()): void {
  // Primero se juntan las claves: borrar mientras se recorre localStorage corre los índices.
  const viejas = leerTodos().filter(({ r }) =>
    (r.sincronizado && ahora - r.timestamp > DIAS_RETENCION_RESPALDO_SINCRONIZADO * DIA_MS) ||
    (!r.sincronizado && r.rondaCerradaEn != null && ahora - r.rondaCerradaEn > DIAS_RETENCION_RESPALDO_RONDA_CERRADA * DIA_MS),
  ).map(({ clave }) => clave)
  for (const clave of viejas) {
    try { localStorage.removeItem(clave) } catch { /* silencioso */ }
  }
}

/**
 * Borra los respaldos de TODOS los jugadores de una ronda (los que anotó este teléfono). Sólo con
 * la ronda confirmada como borrada por el servidor: nunca por una lectura sin señal, una sesión
 * vencida o una ronda cerrada (se puede reabrir). El `_` final del prefijo evita tocar otra ronda
 * cuyo código empiece igual (ABC vs ABCD).
 */
export function borrarRespaldosDeRonda(codigoRonda: string): void {
  borrarClavesConPrefijo(claveDelRespaldo(codigoRonda, ''))
}
