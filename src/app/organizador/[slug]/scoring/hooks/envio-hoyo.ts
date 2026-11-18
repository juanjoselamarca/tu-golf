// Envío de un hoyo del scorer del organizador a `/api/game` (`upsert_score`) y la cuenta de las stats que el
// organizador tocó a mano. Sin React: lo usa `useScoreEntry` y se prueba suelto.
//
// Stats "tocadas": lo que el organizador fijó en la tarjeta abierta (`null` = la borró a propósito). Es lo ÚNICO
// que viaja en la foto de stats de un envío: lo que vino de la base no se reenvía, así una stat nunca cargada se
// omite (el servidor no la toca) en vez de mandarla null y borrarla. Cuando el servidor confirma un envío que se
// aplicó, lo tocado que no volvió a cambiar después de ese envío ya está en la base y deja de viajar.

import { DISPOSITIVO_GUARDADO, nuevaSecuencia } from '@/lib/red/orden-guardado'
import { CAMPO_STATS_NULL_BORRA } from '@/lib/api/codigos-game'

export type HoleStatPatch = Partial<{
  putts: number | null
  fairway_hit: boolean | null
  gir: boolean | null
}>
type ClaveStat = keyof HoleStatPatch

/** Un valor tocado y su versión: cada toque sube la versión, aunque repita un valor anterior. */
interface Tocada { valor: number | boolean | null; version: number }
/** Versión de cada stat que salió en un envío (para reconciliar sólo si sigue siendo la vigente). */
export type VersionesEnviadas = Partial<Record<ClaveStat, number>>

/** Lo tocado, atado a la ronda: si la tarjeta cambia, lo de la anterior no viaja a la nueva. */
export interface StatsTocadas {
  roundId: string | null
  porHoyo: Record<number, Partial<Record<ClaveStat, Tocada>>>
}

export const SIN_TOCAR: StatsTocadas = { roundId: null, porHoyo: {} }

let ultimaVersion = 0

function foto(porClave: Partial<Record<ClaveStat, Tocada>> = {}): { foto: HoleStatPatch; versiones: VersionesEnviadas } {
  const f: Record<string, unknown> = {}
  const versiones: VersionesEnviadas = {}
  for (const [k, t] of Object.entries(porClave) as [ClaveStat, Tocada][]) {
    f[k] = t.valor
    versiones[k] = t.version
  }
  return { foto: f as HoleStatPatch, versiones }
}

/** Foto de lo tocado del hoyo, sin cambiar nada (para el deshacer, que no fija stats). */
export function leerTocadas(t: StatsTocadas, roundId: string, hole: number) {
  return foto(t.roundId === roundId ? t.porHoyo[hole] : undefined)
}

/** Lo tocado con `patch` encima (cada clave con versión nueva): queda como vigente y su foto es lo que se envía.
 *  Una clave `undefined` no cuenta. */
export function tocar(t: StatsTocadas, roundId: string, hole: number, patch: HoleStatPatch = {}) {
  const porHoyo = t.roundId === roundId ? t.porHoyo : {}
  const delHoyo = { ...porHoyo[hole] }
  for (const [k, v] of Object.entries(patch) as [ClaveStat, Tocada['valor'] | undefined][]) {
    if (v !== undefined) delHoyo[k] = { valor: v, version: ++ultimaVersion }
  }
  const tocadas: StatsTocadas = { roundId, porHoyo: { ...porHoyo, [hole]: delHoyo } }
  return { tocadas, ...foto(delHoyo) }
}

/** Saca de lo tocado del hoyo lo que el servidor ya aplicó: sólo las claves cuya versión vigente es la enviada.
 *  Un toque posterior al envío (aunque vuelva al mismo valor: A→B→A) tiene otra versión y se conserva. */
export function reconciliar(t: StatsTocadas, roundId: string, hole: number, enviadas: VersionesEnviadas): StatsTocadas {
  if (t.roundId !== roundId || !t.porHoyo[hole]) return t
  const resto = { ...t.porHoyo[hole] }
  for (const [k, version] of Object.entries(enviadas) as [ClaveStat, number][]) {
    if (resto[k]?.version === version) delete resto[k]
  }
  const porHoyo = { ...t.porHoyo }
  if (Object.keys(resto).length === 0) delete porHoyo[hole]
  else porHoyo[hole] = resto
  return { roundId, porHoyo }
}

/** Las stats tocadas de la ronda, por hoyo, como valores (para superponerlas a una carga de la base). */
export function tocadasDeLaRonda(t: StatsTocadas, roundId: string): Record<number, HoleStatPatch> {
  if (t.roundId !== roundId) return {}
  const r: Record<number, HoleStatPatch> = {}
  for (const [hole, porClave] of Object.entries(t.porHoyo)) r[Number(hole)] = foto(porClave).foto
  return r
}

/** Corte de un envío: sin él, una red colgada dejaba la cola del hoyo trabada para siempre. Cortar no es fallar:
 *  el servidor puede escribirlo igual después (ver `incierto`). */
export const TIMEOUT_ENVIO_MS = 15_000

/**
 * `aplicado`: el servidor guardó ESTE envío (no lo descartó por haber uno más nuevo del dispositivo).
 * `incierto`: no se sabe si llegó. Sin respuesta (corte, red caída a mitad) o con un 502/504 del borde, el servidor
 * pudo escribirlo igual: tratarlo como "no quedó nada en la base" dejaba un golpe que contaba en el leaderboard
 * mientras la pantalla decía que no estaba.
 */
export interface ResultadoEnvio {
  ok: boolean
  aplicado: boolean
  incierto: boolean
}

/** Respuestas del borde (proxy) que no dicen si la función llegó a escribir. */
const ESTADOS_INCIERTOS: ReadonlySet<number> = new Set([502, 504])

/**
 * POST de un hoyo con orden por dispositivo y el campo que hace que un null de stat borre. No lanza: sin señal
 * `fetch` rechaza, y eso cuenta como un envío incierto (antes quedaba como promesa rechazada sin aviso).
 */
export async function enviarHoyo(campos: Record<string, unknown>): Promise<ResultadoEnvio> {
  const control = new AbortController()
  const plazo = setTimeout(() => control.abort(), TIMEOUT_ENVIO_MS)
  try {
    const res = await fetch('/api/game', {
      method: 'POST',
      signal: control.signal,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'upsert_score',
        // Orden por dispositivo: un envío más viejo de este hoyo que llega tarde no pisa a uno más nuevo.
        seq: nuevaSecuencia(),
        dispositivo: DISPOSITIVO_GUARDADO,
        [CAMPO_STATS_NULL_BORRA]: true,
        ...campos,
      }),
    })
    if (!res.ok) return { ok: false, aplicado: false, incierto: ESTADOS_INCIERTOS.has(res.status) }
    const cuerpo = (await res.json().catch(() => null)) as { descartado?: unknown } | null
    return { ok: true, aplicado: cuerpo?.descartado !== true, incierto: false }
  } catch {
    return { ok: false, aplicado: false, incierto: true }
  } finally {
    clearTimeout(plazo)
  }
}

/** Clave de un hoyo de una ronda. Única fuente: nadie arma ni parsea esta clave a mano. */
export function claveHoyo(roundId: string, hole: number): string {
  return `${roundId}:${hole}`
}

/**
 * Cola serial por hoyo. Todo envío a un mismo `ronda:hoyo` (golpe, deshacer, stats, reintento) sale recién cuando
 * terminó el anterior de ese hoyo (bien o mal); hoyos distintos van en paralelo. Lleva el último golpe CONFIRMADO
 * por el servidor de cada hoyo: un envío de stats lo lee al salir, no al encolarse. Así un guardado o un deshacer
 * que falla nunca deja colar un envío con un golpe que la base no tiene (revisión #834, vueltas 4 y 5).
 */
export interface ColaHoyos {
  /** Encola `tarea` detrás de lo pendiente del hoyo. Devuelve su resultado (o su error). */
  encolar<T>(roundId: string, hole: number, tarea: () => Promise<T>): Promise<T>
  /** Espera a que se vacíen las colas de la ronda (también lo que se encole mientras tanto). */
  vaciar(roundId: string): Promise<void>
  /** Lo mismo, de un solo hoyo. */
  vaciarHoyo(roundId: string, hole: number): Promise<void>
  /** Último golpe confirmado del hoyo: número, `null` (sin golpe en la base) o `undefined` (no se sabe). */
  golpeConfirmado(roundId: string, hole: number): number | null | undefined
  confirmarGolpe(roundId: string, hole: number, gross: number | null): void
  /** Un envío del hoyo quedó incierto: su golpe pasa a "no se sabe" hasta que una lectura de la base lo diga. */
  olvidarGolpe(roundId: string, hole: number): void
  /** Hoyos de la ronda con el golpe en "no se sabe" por un envío incierto. */
  hoyosInciertos(roundId: string): number[]
  /** Marca de tiempo lógica: se toma al PEDIR una lectura y se pasa a `sembrarGolpes`. */
  marca(): number
  /** Golpes leídos de la base con una lectura pedida en `marca`. No pisa hoyos con envíos en la cola ni hoyos que
   *  cambiaron después de pedirla (un guardado que se confirmó mientras la lectura viajaba). */
  sembrarGolpes(roundId: string, golpes: Record<number, number>, marca: number): void
}

export function crearColaHoyos(): ColaHoyos {
  const colas = new Map<string, { roundId: string; fin: Promise<void> }>()
  /** Por ronda y hoyo. */
  const confirmados = new Map<string, Map<number, number | null>>()
  /** Por `claveHoyo`: cuándo cambió por última vez lo que se sabe del hoyo (encolar, confirmar, olvidar). */
  const cambios = new Map<string, number>()
  const inciertos = new Map<string, Set<number>>()
  let reloj = 0
  const tocar = (roundId: string, hole: number) => cambios.set(claveHoyo(roundId, hole), ++reloj)
  const esperar = async (filtro: (c: { roundId: string }, clave: string) => boolean) => {
    for (;;) {
      const enCurso = [...colas].filter(([clave, c]) => filtro(c, clave)).map(([, c]) => c.fin)
      if (enCurso.length === 0) return
      await Promise.all(enCurso)
    }
  }
  const fijar = (roundId: string, hole: number, gross: number | null | undefined) => {
    const deRonda = confirmados.get(roundId) ?? new Map<number, number | null>()
    if (gross === undefined) deRonda.delete(hole)
    else deRonda.set(hole, gross)
    confirmados.set(roundId, deRonda)
  }
  return {
    encolar(roundId, hole, tarea) {
      const clave = claveHoyo(roundId, hole)
      tocar(roundId, hole)
      const previa = colas.get(clave)?.fin ?? Promise.resolve()
      const esta = previa.then(tarea)
      const fin = esta.then(() => {}, () => {})
      colas.set(clave, { roundId, fin })
      void fin.then(() => {
        if (colas.get(clave)?.fin === fin) colas.delete(clave)
      })
      return esta
    },
    vaciar: (roundId) => esperar((c) => c.roundId === roundId),
    vaciarHoyo: (roundId, hole) => esperar((_, clave) => clave === claveHoyo(roundId, hole)),
    golpeConfirmado(roundId, hole) {
      const deRonda = confirmados.get(roundId)
      return deRonda?.has(hole) ? deRonda.get(hole) : undefined
    },
    confirmarGolpe(roundId, hole, gross) {
      tocar(roundId, hole)
      fijar(roundId, hole, gross)
      inciertos.get(roundId)?.delete(hole)
    },
    olvidarGolpe(roundId, hole) {
      tocar(roundId, hole)
      fijar(roundId, hole, undefined)
      inciertos.set(roundId, (inciertos.get(roundId) ?? new Set()).add(hole))
    },
    hoyosInciertos: (roundId) => [...(inciertos.get(roundId) ?? [])].sort((a, b) => a - b),
    marca: () => reloj,
    sembrarGolpes(roundId, golpes, marca) {
      const libre = (hole: number) => {
        const clave = claveHoyo(roundId, hole)
        return !colas.has(clave) && (cambios.get(clave) ?? 0) <= marca
      }
      const deRonda = new Map<number, number | null>()
      // Lo de hoyos ocupados se conserva; el resto es lo que diga la base (sin fila = sin golpe).
      for (const [hole, gross] of confirmados.get(roundId) ?? []) if (!libre(hole)) deRonda.set(hole, gross)
      for (const [h, gross] of Object.entries(golpes)) if (libre(Number(h))) deRonda.set(Number(h), gross)
      confirmados.set(roundId, deRonda)
      const dudosos = inciertos.get(roundId)
      // Un hoyo incierto deja de serlo cuando una lectura posterior al envío dice qué hay (también si no hay fila).
      for (const hole of [...(dudosos ?? [])]) if (libre(hole)) dudosos?.delete(hole)
    },
  }
}
