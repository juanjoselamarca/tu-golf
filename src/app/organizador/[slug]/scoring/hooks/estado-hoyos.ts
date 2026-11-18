// Estado de guardado por hoyo del scorer del organizador. FUENTE ÚNICA: el golpe y las stats de un hoyo son UN
// documento, viajan en UN sobre, y el estado que ve la pantalla sale de `estadoDe` (función pura, nunca guardado).
//
// No es una cola de tareas: por cada `ronda:hoyo` se guarda lo DESEADO (`valor`) y un sincronizador lo lleva al
// servidor. Un envío sin respuesta (corte, red, 5xx, 429) no se relee ni se adivina: se reenvía el contenido
// VIGENTE con una secuencia nueva, y la base descarta la secuencia vieja si llega tarde
// (`guardar_hole_score`, marca por dispositivo y hoyo). Nunca se reenvía un valor viejo.
//
// Sin React: lo envuelve `useEstadoHoyos` y se prueba suelto con `enviar`, reloj y temporizador inyectados.

import { nuevaSecuencia } from '@/lib/red/orden-guardado'
import { INTENTOS_POR_HOYO } from '@/lib/red/plazos'

/** Espera de una stat antes de salir: los toques seguidos (GIR + putts) viajan en un solo sobre. */
export const ESPERA_STAT_MS = 600
/** Espera entre reintentos de un hoyo sin respuesta: 1, 2, 4, 8 s y después 15 s fijo (límite 120/min de /api/game). */
export const ESPERAS_REINTENTO_MS: readonly number[] = [1_000, 2_000, 4_000, 8_000]
export const ESPERA_REINTENTO_FIJA_MS = 15_000
/** Cuánto espera el cierre de la tarjeta a que se guarden sus hoyos. */
export const PLAZO_CIERRE_MS = 20_000

/** Clave de un hoyo de una ronda. Única fuente: nadie arma ni parsea esta clave a mano. */
export function claveHoyo(roundId: string, hole: number): string {
  return `${roundId}:${hole}`
}

export type ClaveStat = 'putts' | 'fairway_hit' | 'gir'
export const CLAVES_STAT: readonly ClaveStat[] = ['putts', 'fairway_hit', 'gir']
export type HoleStatPatch = Partial<{ putts: number | null; fairway_hit: boolean | null; gir: boolean | null }>
export type PatchHoyo = HoleStatPatch & { gross?: number | null }
type ValorStat = number | boolean | null

/** Lectura de la respuesta de un sobre (`enviarHoyo`). */
export type LecturaSobre = 'ok' | 'sin_respuesta' | { rechazo: string }
export interface RespuestaSobre {
  lectura: LecturaSobre
  totales?: { totalGross: number; totalNet: number; totalPoints: number }
}

/** Lo que viaja: la foto del documento del hoyo al salir. `stats` lleva sólo lo que el organizador tocó y el
 *  servidor aún no confirmó (`null` = la borró); lo que vino de la base no se reenvía. */
export interface Sobre {
  roundId: string
  hole: number
  par: number
  gross: number | null
  stats: HoleStatPatch
  rev: number
  seq: number
}

export type EstadoHoyo = 'limpio' | 'guardando' | 'sin_confirmar' | 'rechazado'

interface Tocada { valor: ValorStat; version: number }
interface Hoyo {
  roundId: string
  hole: number
  par: number
  valor: { gross: number | null; stats: Partial<Record<ClaveStat, Tocada>> }
  base: { gross: number | null; stats: HoleStatPatch }
  rev: number
  revOk: number
  vuelo: (Sobre & { versiones: Partial<Record<ClaveStat, number>> }) | null
  intentos: number
  /** No sale antes de este instante: la espera de una stat o la de un reintento (`porRed`). */
  noAntesDe: number
  porRed: boolean
  rechazo: { rev: number; motivo: string } | null
  /** Un envío quedó sin respuesta: el servidor quizá lo escribió. Revertir sólo en pantalla mentiría. */
  quizaAplicado: boolean
  /** Marca lógica del último cambio (edición o confirmación): una lectura pedida antes no lo pisa. */
  cambio: number
}

/** Estado del hoyo. Único lugar que lo decide. */
export function estadoDe(h: Pick<Hoyo, 'rev' | 'revOk' | 'rechazo' | 'intentos'>): EstadoHoyo {
  if (h.rev === h.revOk) return 'limpio'
  if (h.rechazo?.rev === h.rev) return 'rechazado'
  if (h.intentos >= INTENTOS_POR_HOYO) return 'sin_confirmar'
  return 'guardando'
}

export interface VistaHoyo {
  gross: number | null
  putts: number | null
  fairway_hit: boolean | null
  gir: boolean | null
  estado: EstadoHoyo
  motivo: string | null
  quizaAplicado: boolean
}
export type VistaRonda = Readonly<Record<number, VistaHoyo>>
export interface Pendiente { roundId: string; hole: number; estado: Exclude<EstadoHoyo, 'limpio'> }
export interface FilaBase { hole_number: number; gross_score: number | null; putts?: number | null; fairway_hit?: boolean | null; gir?: boolean | null }

export interface DepsEstadoHoyos {
  enviar: (sobre: Sobre) => Promise<RespuestaSobre>
  ahora?: () => number
  programar?: (fn: () => void, ms: number) => () => void
  alConfirmar?: (roundId: string, totales: NonNullable<RespuestaSobre['totales']>) => void
}

const VACIA: VistaRonda = Object.freeze({})

export function crearEstadoHoyos(deps: DepsEstadoHoyos) {
  const ahora = deps.ahora ?? (() => Date.now())
  const programar = deps.programar ?? ((fn, ms) => {
    const t = setTimeout(fn, ms)
    return () => clearTimeout(t)
  })
  const hoyos = new Map<string, Hoyo>()
  const porRonda = new Map<string, Set<number>>()
  const timers = new Map<string, () => void>()
  const selladas = new Set<string>()
  const ultimaSiembra = new Map<string, number>()
  const oyentes = new Set<() => void>()
  const cacheVista = new Map<string, VistaRonda>()
  let cachePendientes: Pendiente[] | null = null
  let reloj = 0
  let ultimaVersion = 0

  function avisar(roundId: string) {
    cacheVista.delete(roundId)
    cachePendientes = null
    for (const fn of [...oyentes]) fn()
  }

  function obtener(roundId: string, hole: number, par: number): Hoyo {
    const k = claveHoyo(roundId, hole)
    let h = hoyos.get(k)
    if (!h) {
      h = {
        roundId, hole, par,
        valor: { gross: null, stats: {} }, base: { gross: null, stats: {} },
        rev: 0, revOk: 0, vuelo: null, intentos: 0, noAntesDe: 0, porRed: false,
        rechazo: null, quizaAplicado: false, cambio: 0,
      }
      hoyos.set(k, h)
      if (!porRonda.has(roundId)) porRonda.set(roundId, new Set())
      porRonda.get(roundId)!.add(hole)
    }
    return h
  }

  function hoyosDe(roundId: string): Hoyo[] {
    return [...(porRonda.get(roundId) ?? [])].map((n) => hoyos.get(claveHoyo(roundId, n))!)
  }

  function statVisible(h: Hoyo, k: ClaveStat): ValorStat {
    const t = h.valor.stats[k]
    return t ? t.valor : (h.base.stats[k] ?? null)
  }

  function cancelarTimer(h: Hoyo) {
    const k = claveHoyo(h.roundId, h.hole)
    timers.get(k)?.()
    timers.delete(k)
  }

  /** SALE si corresponde ahora; si está esperando, se agenda para cuando termine la espera. */
  function bombear(h: Hoyo) {
    if (h.vuelo || h.rev === h.revOk || h.rechazo) return
    const falta = h.noAntesDe - ahora()
    if (falta > 0) {
      cancelarTimer(h)
      timers.set(claveHoyo(h.roundId, h.hole), programar(() => {
        timers.delete(claveHoyo(h.roundId, h.hole))
        bombear(h)
      }, falta))
      return
    }
    salir(h)
  }

  function salir(h: Hoyo) {
    cancelarTimer(h)
    const stats: HoleStatPatch = {}
    const versiones: Partial<Record<ClaveStat, number>> = {}
    for (const k of CLAVES_STAT) {
      const t = h.valor.stats[k]
      if (!t) continue
      ;(stats as Record<string, ValorStat>)[k] = t.valor
      versiones[k] = t.version
    }
    const publico: Sobre = {
      roundId: h.roundId, hole: h.hole, par: h.par, gross: h.valor.gross, stats, rev: h.rev, seq: nuevaSecuencia(),
    }
    const sobre = { ...publico, versiones }
    h.vuelo = sobre
    avisar(h.roundId)
    let respuesta: Promise<RespuestaSobre>
    try {
      respuesta = deps.enviar(publico)
    } catch {
      respuesta = Promise.resolve({ lectura: 'sin_respuesta' })
    }
    respuesta.then(
      (r) => responder(h, sobre, r),
      () => responder(h, sobre, { lectura: 'sin_respuesta' }),
    )
  }

  function responder(h: Hoyo, sobre: NonNullable<Hoyo['vuelo']>, r: RespuestaSobre) {
    if (h.vuelo !== sobre) return
    h.vuelo = null
    const { lectura } = r
    if (lectura === 'ok') {
      h.revOk = sobre.rev
      h.base.gross = sobre.gross
      for (const k of CLAVES_STAT) {
        const enviada = sobre.versiones[k]
        if (enviada === undefined) continue
        ;(h.base.stats as Record<string, ValorStat>)[k] = (sobre.stats as Record<string, ValorStat>)[k]
        // Sólo sale de lo tocado si nadie la volvió a tocar después del envío (A→B→A tiene otra versión).
        if (h.valor.stats[k]?.version === enviada) delete h.valor.stats[k]
      }
      h.intentos = 0
      h.quizaAplicado = false
      h.porRed = false
      h.cambio = ++reloj
      // Totales sólo con la ronda quieta: con otro hoyo en vuelo, esta respuesta puede ser más vieja que la que
      // llegue después (hoyos en paralelo). La última respuesta con la ronda quieta deja los totales al día.
      const rondaQuieta = !hoyosDe(h.roundId).some((o) => o.vuelo)
      if (r.totales && rondaQuieta) {
        try {
          deps.alConfirmar?.(h.roundId, r.totales)
        } catch {
          // Un oyente roto (pantalla desmontada) no traba el guardado.
        }
      }
    } else if (lectura === 'sin_respuesta') {
      h.intentos += 1
      h.quizaAplicado = true
      h.porRed = true
      h.noAntesDe = ahora() + (ESPERAS_REINTENTO_MS[h.intentos - 1] ?? ESPERA_REINTENTO_FIJA_MS)
    } else if (sobre.rev === h.rev) {
      // Regla del último envío: sólo decide la respuesta del contenido vigente. Un rechazo de algo ya editado
      // se ignora y sale lo nuevo.
      h.rechazo = { rev: h.rev, motivo: lectura.rechazo }
    }
    avisar(h.roundId)
    bombear(h)
  }

  function reintentarHoyo(h: Hoyo, limpiarRechazo: boolean) {
    if (limpiarRechazo) h.rechazo = null
    h.noAntesDe = 0
    h.porRed = false
    bombear(h)
  }

  function volverABase(h: Hoyo) {
    cancelarTimer(h)
    h.valor = { gross: h.base.gross, stats: {} }
    h.rechazo = null
    h.revOk = h.rev
    h.intentos = 0
    h.porRed = false
    h.quizaAplicado = false
    h.cambio = ++reloj
    avisar(h.roundId)
  }

  const api = {
    /** Cambia el documento del hoyo. `false` si no se aceptó (tarjeta sellada, stat sin golpe, hoyo rechazado). */
    editar(roundId: string, hole: number, patch: PatchHoyo, opts: { par: number; esperaMs?: number }): boolean {
      if (selladas.has(roundId)) return false
      const h = obtener(roundId, hole, opts.par)
      h.par = opts.par
      const tocaStats = CLAVES_STAT.some((k) => patch[k] !== undefined)
      const gross = patch.gross !== undefined ? patch.gross : h.valor.gross
      if (tocaStats && gross == null) return false
      if (tocaStats && patch.gross === undefined && estadoDe(h) === 'rechazado') return false
      const cambiaGross = patch.gross !== undefined && patch.gross !== h.valor.gross
      const cambiaStats = CLAVES_STAT.filter((k) => patch[k] !== undefined && patch[k] !== statVisible(h, k))
      if (!cambiaGross && cambiaStats.length === 0) {
        // Mismo valor: en un hoyo limpio no hace nada; en uno pendiente es "reintentar".
        if (estadoDe(h) !== 'limpio') {
          reintentarHoyo(h, true)
          avisar(roundId)
        }
        return true
      }
      if (cambiaGross) h.valor.gross = patch.gross as number | null
      // Sin golpe no hay stats que mandar: el hoyo vuelve a vacío (deshacer el primer golpe).
      if (cambiaGross && patch.gross === null) h.valor.stats = {}
      for (const k of cambiaStats) h.valor.stats[k] = { valor: patch[k] as ValorStat, version: ++ultimaVersion }
      h.rev += 1
      h.intentos = 0
      h.rechazo = null
      h.porRed = false
      h.noAntesDe = opts.esperaMs ? ahora() + opts.esperaMs : 0
      h.cambio = ++reloj
      avisar(roundId)
      bombear(h)
      return true
    },

    /** Deshace en pantalla un golpe rechazado que nunca llegó a la base. No envía nada. */
    revertirLocal(roundId: string, hole: number): boolean {
      const h = hoyos.get(claveHoyo(roundId, hole))
      if (!h || estadoDe(h) !== 'rechazado' || h.quizaAplicado) return false
      volverABase(h)
      return true
    },

    /**
     * "Descartar" de un hoyo rechazado (tarjeta cerrada, jugador retirado, torneo inactivo: reintentar no lo
     * arregla). Vuelve a lo último confirmado y deja de estar pendiente (chip, cierre y aviso al salir). No envía
     * nada. Si un envío anterior quedó sin respuesta (`quizaAplicado`), la base puede tener otro valor: quien llama
     * relee la ronda y `sembrar` lo corrige (el hoyo queda limpio y la relectura es posterior).
     */
    descartar(roundId: string, hole: number): boolean {
      const h = hoyos.get(claveHoyo(roundId, hole))
      if (!h || estadoDe(h) !== 'rechazado') return false
      volverABase(h)
      return true
    },

    /** Marca lógica: se toma al PEDIR una lectura de la base y se pasa a `sembrar`. */
    marca(): number {
      return ++reloj
    },

    /** Lo leído de la base. Pisa sólo hoyos limpios, sin vuelo y sin cambios posteriores a `marca`. */
    sembrar(roundId: string, filas: FilaBase[], marca: number, parDe: (hole: number) => number) {
      if (marca < (ultimaSiembra.get(roundId) ?? -Infinity)) return
      ultimaSiembra.set(roundId, marca)
      const leidas = new Map(filas.map((f) => [f.hole_number, f]))
      const numeros = new Set([...leidas.keys(), ...(porRonda.get(roundId) ?? [])])
      for (const n of numeros) {
        const h = obtener(roundId, n, parDe(n))
        if (h.vuelo || estadoDe(h) !== 'limpio' || h.cambio > marca) continue
        const f = leidas.get(n)
        const stats: HoleStatPatch = { putts: f?.putts ?? null, fairway_hit: f?.fairway_hit ?? null, gir: f?.gir ?? null }
        h.base = { gross: f?.gross_score ?? null, stats }
        h.valor = { gross: h.base.gross, stats: {} }
      }
      avisar(roundId)
    },

    vista(roundId: string): VistaRonda {
      const cacheada = cacheVista.get(roundId)
      if (cacheada) return cacheada
      const hs = hoyosDe(roundId)
      if (hs.length === 0) return VACIA
      const v: Record<number, VistaHoyo> = {}
      for (const h of hs) {
        const estado = estadoDe(h)
        v[h.hole] = {
          gross: h.valor.gross,
          putts: statVisible(h, 'putts') as number | null,
          fairway_hit: statVisible(h, 'fairway_hit') as boolean | null,
          gir: statVisible(h, 'gir') as boolean | null,
          estado,
          motivo: estado === 'rechazado' ? h.rechazo!.motivo : null,
          quizaAplicado: h.quizaAplicado,
        }
      }
      const congelada = Object.freeze(v)
      cacheVista.set(roundId, congelada)
      return congelada
    },

    /** Hoyos de la ronda que todavía no están en la base tal como se ven. Lectura síncrona. */
    sinGuardar(roundId: string): number[] {
      return hoyosDe(roundId).filter((h) => estadoDe(h) !== 'limpio').map((h) => h.hole).sort((a, b) => a - b)
    },

    pendientesGlobal(): Pendiente[] {
      if (cachePendientes) return cachePendientes
      const r: Pendiente[] = []
      for (const h of hoyos.values()) {
        const estado = estadoDe(h)
        if (estado !== 'limpio') r.push({ roundId: h.roundId, hole: h.hole, estado })
      }
      cachePendientes = r
      return r
    },

    /** Anula la espera de las stats de la ronda (no la de un reintento por red). */
    apurar(roundId: string) {
      for (const h of hoyosDe(roundId)) {
        if (h.porRed || h.noAntesDe === 0) continue
        h.noAntesDe = 0
        bombear(h)
      }
    },

    /** Reintenta ya. `limpiarRechazo` sólo con un toque del organizador: volver la señal no reenvía un rechazo. */
    reintentar(opts: { roundId?: string; limpiarRechazo?: boolean } = {}) {
      const lista = opts.roundId ? hoyosDe(opts.roundId) : [...hoyos.values()]
      const tocadas = new Set<string>()
      for (const h of lista) {
        if (estadoDe(h) === 'limpio') continue
        if (!opts.limpiarRechazo && h.rechazo) continue
        reintentarHoyo(h, !!opts.limpiarRechazo)
        tocadas.add(h.roundId)
      }
      for (const r of tocadas) avisar(r)
    },

    /** Espera a que la ronda quede guardada. `pendiente` al vencer el plazo, o antes si sólo quedan rechazos. */
    asentar(roundId: string, plazoMs: number): Promise<'limpio' | 'pendiente'> {
      return new Promise((resolver) => {
        let listo = false
        let quitar = () => {}
        let cancelar = () => {}
        const fin = (r: 'limpio' | 'pendiente') => {
          if (listo) return
          listo = true
          quitar()
          cancelar()
          resolver(r)
        }
        const revisar = () => {
          const hs = hoyosDe(roundId).filter((h) => estadoDe(h) !== 'limpio')
          if (hs.length === 0) fin('limpio')
          else if (hs.every((h) => estadoDe(h) === 'rechazado')) fin('pendiente')
        }
        quitar = api.suscribir(revisar)
        cancelar = programar(() => fin('pendiente'), plazoMs)
        revisar()
      })
    },

    /** Solo lectura mientras se cierra la tarjeta: `editar` devuelve false. */
    sellar(roundId: string) {
      selladas.add(roundId)
      avisar(roundId)
    },
    desellar(roundId: string) {
      selladas.delete(roundId)
      avisar(roundId)
    },
    sellada(roundId: string): boolean {
      return selladas.has(roundId)
    },

    suscribir(fn: () => void): () => void {
      oyentes.add(fn)
      return () => {
        oyentes.delete(fn)
      }
    },
  }
  return api
}

export type EstadoHoyos = ReturnType<typeof crearEstadoHoyos>
