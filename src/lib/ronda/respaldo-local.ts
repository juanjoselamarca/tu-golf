// src/lib/ronda/respaldo-local.ts
//
// Respaldo offline de los golpes (`golfers_score_<codigo>_<jugador>`): lo escribe el
// scorer ANTES de mandar al servidor y queda `sincronizado: false` hasta que el
// servidor confirma esa tarjeta. Lo usan el scorer individual (vía `useScoreSync`),
// el de torneo (con el slug como código) y el banner "Sincronizando…".

import { borrarClavesConPrefijo } from '@/lib/local-storage-prefijo'

export const PREFIJO_RESPALDO = 'golfers_score_'

export const DIA_MS = 24 * 60 * 60 * 1000
/** Un respaldo ya confirmado por el servidor se guarda una semana más y se barre. */
export const DIAS_RETENCION_RESPALDO_SINCRONIZADO = 7
/**
 * Un respaldo sin enviar de una ronda CERRADA no se borra al tiro: la ronda se puede reabrir
 * (reabrir un torneo devuelve sus rondas a 'en_curso') y esos golpes son lo único que hay.
 * Pasado este plazo desde que se vio cerrada, se barre.
 */
export const DIAS_RETENCION_RESPALDO_RONDA_CERRADA = 30
/**
 * Golpes que el servidor rechazó en firme con la ronda abierta (el jugador ya no está o el valor es inválido):
 * la tarjeta del scorer individual (`rechazadaEn`) y los golpes apartados del scorer de grupo
 * (`apartarRechazados`). Un solo plazo para los dos: junto al golpe inválido pueden viajar golpes válidos
 * (una corrección) que solo viven en el teléfono, así que se guardan lo mismo que un respaldo de ronda cerrada.
 */
export const DIAS_RETENCION_RECHAZADO_EN_FIRME = DIAS_RETENCION_RESPALDO_RONDA_CERRADA

/**
 * Un reloj del teléfono anterior a esta fecha está mal (se reinició sin red y quedó en 2010, por ejemplo). Con
 * ese reloj no se barre nada, y una marca escrita con él no sirve para contar un plazo.
 */
export const RELOJ_MINIMO_PLAUSIBLE = Date.UTC(2026, 0, 1)
export const relojPlausible = (ahora: number): boolean => ahora >= RELOJ_MINIMO_PLAUSIBLE

export type EstadoDelPlazo = 'vigente' | 'vencido' | 'reiniciar'

/**
 * En qué va un plazo de retención que partió en `desde`. Ante la duda se guarda de más, nunca se borra antes:
 * - con el reloj implausible ahora, nada vence;
 * - una marca sin fecha o anterior a `RELOJ_MINIMO_PLAUSIBLE` no sirve para contar: 'reiniciar' (desde `ahora`);
 * - una marca futura se deja como está: no se sabe si el reloj estaba adelantado al escribirla o está atrasado
 *   ahora (Android sin red arranca en la fecha de compilación del sistema, que pasa el piso). Reescribirla con un
 *   `ahora` atrasado la haría vencer apenas vuelva la hora real. Vence cuando la hora real la alcance más el plazo.
 */
export function estadoDelPlazo(desde: number | null | undefined, ahora: number, dias: number): EstadoDelPlazo {
  if (!relojPlausible(ahora)) return 'vigente'
  if (desde == null || !Number.isFinite(desde) || desde < RELOJ_MINIMO_PLAUSIBLE) return 'reiniciar'
  if (desde > ahora) return 'vigente'
  return ahora - desde > dias * DIA_MS ? 'vencido' : 'vigente'
}

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
  /**
   * Cuándo el servidor rechazó esta tarjeta en firme con la ronda abierta (el jugador ya no está en
   * ella, o un valor inválido): reenviarla da el mismo rechazo. Sale del banner y del reenvío, y se
   * barre a los `DIAS_RETENCION_RECHAZADO_EN_FIRME` días. Un golpe nuevo reescribe el respaldo sin
   * esta marca (vuelve a intentarse).
   */
  rechazadaEn?: number
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

/** Golpes que el servidor no confirmó ni rechazó en firme (de una ronda abierta o cerrada). */
const sinEnviar = (r: RespaldoLocal) => !r.sincronizado && r.rechazadaEn == null && !!r.scores && Object.keys(r.scores).length > 0
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

/** La ronda está cerrada: sus tarjetas sin enviar salen del banner, pero NO se borran (ver `barrerRespaldosDeRondaCerrada`). */
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

/**
 * Reescribe el respaldo de un jugador con `cambio`. Con `enviados`, sólo si el respaldo sigue siendo
 * esa tarjeta: una más nueva (anotada mientras viajaba el envío) queda como está.
 */
function reescribirRespaldoSiEsLaTarjeta(
  codigoRonda: string, jugadorId: string, enviados: Record<number, number> | undefined, cambio: (r: RespaldoLocal) => void,
): void {
  const key = claveDelRespaldo(codigoRonda, jugadorId)
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return
    const data: RespaldoLocal = JSON.parse(raw)
    // Las claves son hoyos (enteros): JSON.stringify las ordena igual en las dos.
    if (enviados && JSON.stringify(data.scores) !== JSON.stringify(enviados)) return
    cambio(data)
    localStorage.setItem(key, JSON.stringify(data))
  } catch { /* silencioso */ }
}

/** El servidor confirmó la tarjeta. Con `enviados`, sólo si el respaldo sigue siendo esa tarjeta. */
export function marcarRespaldoSincronizado(codigoRonda: string, jugadorId: string, enviados?: Record<number, number>): void {
  reescribirRespaldoSiEsLaTarjeta(codigoRonda, jugadorId, enviados, data => {
    data.sincronizado = true
    delete data.rondaCerradaEn
  })
}

/**
 * El servidor rechazó la tarjeta en firme con la ronda abierta (ver `RespaldoLocal.rechazadaEn`): sale del
 * banner y del reenvío, sin borrarse al tiro. Con `enviados`, sólo si el respaldo sigue siendo esa tarjeta.
 */
export function marcarRespaldoRechazado(
  codigoRonda: string, jugadorId: string, enviados?: Record<number, number>, ahora = Date.now(),
): void {
  reescribirRespaldoSiEsLaTarjeta(codigoRonda, jugadorId, enviados, data => {
    if (data.sincronizado) return
    data.rechazadaEn = ahora
  })
}

/**
 * Recorre los respaldos con el plazo que `plazo` les da: borra los vencidos y reescribe los que deben reiniciar
 * (con `reiniciar`). Primero junta las claves: borrar mientras se recorre corre los índices.
 */
function barrerRespaldosSi(
  plazo: (clave: string, r: RespaldoLocal) => EstadoDelPlazo | null, reiniciar: (r: RespaldoLocal) => void = () => {},
): void {
  const conPlazo = leerTodos().map(({ clave, r }) => ({ clave, r, estado: plazo(clave, r) }))
  for (const { clave, r, estado } of conPlazo) {
    try {
      if (estado === 'vencido') localStorage.removeItem(clave)
      else if (estado === 'reiniciar') { reiniciar(r); localStorage.setItem(clave, JSON.stringify(r)) }
    } catch { /* silencioso */ }
  }
}

/**
 * Barre lo que ya no sirve sin preguntarle al servidor: respaldos confirmados hace más de
 * `DIAS_RETENCION_RESPALDO_SINCRONIZADO` días y rechazados en firme hace más de
 * `DIAS_RETENCION_RECHAZADO_EN_FIRME`. Lo sin enviar no se toca acá, ni siquiera el de una ronda
 * vista cerrada hace mucho: pudo reabrirse. Ese lo barre el conciliador con
 * `barrerRespaldosDeRondaCerrada`, recién después de confirmar que sigue cerrada. Con el reloj implausible no
 * barre nada (ver `estadoDelPlazo`).
 */
export function barrerRespaldosViejos(ahora = Date.now()): void {
  if (!relojPlausible(ahora)) return
  barrerRespaldosSi(
    (_, r) => {
      // Ya está en el servidor: borrarlo antes de tiempo no pierde nada, y no se reescribe.
      if (r.sincronizado) return ahora - r.timestamp > DIAS_RETENCION_RESPALDO_SINCRONIZADO * DIA_MS ? 'vencido' : null
      return r.rechazadaEn != null ? estadoDelPlazo(r.rechazadaEn, ahora, DIAS_RETENCION_RECHAZADO_EN_FIRME) : null
    },
    r => { r.rechazadaEn = ahora },
  )
}

/**
 * Borra los respaldos sin enviar de una ronda vista cerrada hace más de `DIAS_RETENCION_RESPALDO_RONDA_CERRADA`
 * días. Sólo con la ronda recién confirmada 'finalizada' por el servidor: una reabierta se desmarca
 * antes y no pierde nada.
 */
export function barrerRespaldosDeRondaCerrada(codigoRonda: string, ahora = Date.now()): void {
  if (!relojPlausible(ahora)) return
  const prefijo = claveDelRespaldo(codigoRonda, '')
  barrerRespaldosSi(
    (clave, r) => clave.startsWith(prefijo) && !r.sincronizado && r.rondaCerradaEn != null
      ? estadoDelPlazo(r.rondaCerradaEn, ahora, DIAS_RETENCION_RESPALDO_RONDA_CERRADA)
      : null,
    r => { r.rondaCerradaEn = ahora },
  )
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
