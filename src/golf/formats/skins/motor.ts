/**
 * Motor del formato Skins. Spec: docs/specs/formato-skins.md (fuente de las reglas; cada regla citada acá).
 *
 * Funciones puras: reciben los scores tal como están (completos o a medio jugar) y devuelven el estado de cada
 * hoyo, los skins de cada jugador y la liquidación del pozo. Sirven igual para un torneo de varios grupos y
 * para una Timba de un grupo: quien llama arma la entrada, el motor no sabe de dónde vino.
 */
import { strokesRecibidosEnHoyo } from '../../core/stableford-score'
import { esHandicapUsable, golpesALaDiferenciaDelMasBajo } from '../match-play'

/** «Fuera del hoyo»: levantó la bola. Nunca se convierte en número. */
export const FUERA_DEL_HOYO = 'X' as const
export type ScoreSkins = number | typeof FUERA_DEL_HOYO

export const MODOS_SKINS = ['neto', 'gross'] as const
export type ModoSkins = (typeof MODOS_SKINS)[number]

export const EMPATES_ULTIMO_HOYO = ['repartir', 'se_pierde'] as const
export type EmpateUltimoHoyo = (typeof EMPATES_ULTIMO_HOYO)[number]

export interface OpcionesSkins {
  modo: ModoSkins
  empateUltimoHoyo: EmpateUltimoHoyo
  /** Spec «Validación»: solo hoyos con arrastre, par neto o mejor en el hoyo siguiente. */
  validacion: boolean
  /** Pesos enteros por jugador; 0 = se juega sin plata. */
  pozoPorJugador: number
}

export interface JugadorSkins {
  id: string
  /** Hándicap de juego (CH × %, ya redondeado: `handicapDeJuego`). `null` = no se conoce. Ignorado en gross. */
  handicapDeJuego: number | null
  /** Primer hoyo (número) que ya no juega por retiro; `null` si no se retiró. */
  retiradoDesdeHoyo?: number | null
}

export interface HoyoSkins {
  numero: number
  par: number
  /** Índice de dificultad normalizado a 1..N (N = cantidad de hoyos de la ronda). */
  si: number
}

export interface EntradaSkins {
  opciones: OpcionesSkins
  jugadores: readonly JugadorSkins[]
  /** En orden de numeración (1..18, o los 9 de la ronda). */
  hoyos: readonly HoyoSkins[]
  /** `scores[jugadorId][numeroHoyo]`; ausente = sin anotar. */
  scores: Readonly<Record<string, Readonly<Record<number, ScoreSkins | undefined>>>>
  /**
   * Puntos especiales que valen (ya evaluados con la regla compartida con la Timba). Cada uno = 1 skin.
   * Spec «Puntos especiales».
   */
  especialesValidos?: readonly { jugadorId: string; hoyo: number }[]
}

export type EstadoHoyoSkins =
  | 'por_jugar'
  | 'en_disputa'
  | 'por_validar'
  | 'ganado'
  | 'arrastre'
  | 'repartido'
  | 'perdido'

export interface ResultadoHoyoSkins {
  numero: number
  estado: EstadoHoyoSkins
  /** Skins en juego en el hoyo (1 + arrastre). */
  valor: number
  /** El valor puede cambiar: algún hoyo anterior todavía no se resuelve. */
  valorProvisional: boolean
  /** Mejor neto entre los que ya anotaron golpes; `null` si nadie anotó golpes. */
  mejorNeto: number | null
  /** Quienes tienen el mejor neto (uno = va solo; varios = empatados). */
  lideres: string[]
  /** Quién cobra el hoyo (estado `ganado`). */
  ganador: string | null
  /** Entre quiénes se reparte (estado `repartido`). */
  repartidoEntre: string[]
  /** `arrastre` porque el ganador no validó (spec «Validación»). */
  noValidado: boolean
  /** Neto (o gross en modo gross) de cada jugador en el hoyo; X; `null` = sin anotar o retirado. */
  netos: Record<string, number | typeof FUERA_DEL_HOYO | null>
}

export interface ResultadoJugadorSkins {
  id: string
  /** Skins cobrados (hoyos + reparto + especiales). Puede tener fracción por el reparto del último hoyo. */
  skins: number
  /** Pesos que cobra (estimado mientras `definitivo` sea false). */
  cobra: number
  /** `cobra − pozoPorJugador`. */
  neto: number
}

export interface ResultadoSkins {
  hoyos: ResultadoHoyoSkins[]
  jugadores: ResultadoJugadorSkins[]
  /** Golpes de ventaja del skins por jugador y hoyo (los puntos del scorer). */
  golpes: Record<string, Record<number, number>>
  skinsCobrados: number
  pozoTotal: number
  /** Pesos por skin; `null` si no hay pozo o nadie cobró aún. */
  valorSkin: number | null
  /** Todos los hoyos resueltos: la liquidación es final. */
  definitivo: boolean
  /** Ronda terminada sin ningún skin cobrado: se devuelve el pozo. */
  devolucion: boolean
  /** Jugadores sin hándicap usable en modo neto. Si hay alguno, nadie recibe golpes: quien llama debe bloquear. */
  handicapsIncompletos: string[]
}

/** Golpes del skins: el más bajo del campo juega a 0 (spec «Golpes»). */
export function golpesDelSkins(
  entrada: Pick<EntradaSkins, 'opciones' | 'jugadores' | 'hoyos'>,
): { golpes: Record<string, Record<number, number>>; handicapsIncompletos: string[] } {
  const { opciones, jugadores, hoyos } = entrada
  const incompletos =
    opciones.modo === 'neto' ? jugadores.filter(j => !esHandicapUsable(j.handicapDeJuego)).map(j => j.id) : []
  const base =
    opciones.modo === 'gross' || incompletos.length > 0
      ? jugadores.map(() => 0)
      : golpesALaDiferenciaDelMasBajo(jugadores.map(j => j.handicapDeJuego as number))
  const golpes: Record<string, Record<number, number>> = {}
  jugadores.forEach((j, i) => {
    golpes[j.id] = {}
    for (const h of hoyos) golpes[j.id][h.numero] = strokesRecibidosEnHoyo(base[i], h.si, hoyos.length)
  })
  return { golpes, handicapsIncompletos: incompletos }
}

const juegaElHoyo = (j: JugadorSkins, hoyo: number) => j.retiradoDesdeHoyo == null || hoyo < j.retiradoDesdeHoyo

/**
 * Reparte `total` pesos en proporción a `pesos` (enteros ≥ 0) con resto mayor: la suma es exacta. El resto va
 * primero a quien tiene más peso y, a igual peso, en el orden recibido (spec «Pozo y liquidación»).
 */
export function repartirPorRestoMayor(total: number, pesos: readonly number[]): number[] {
  const suma = pesos.reduce((a, b) => a + b, 0)
  if (suma === 0) return pesos.map(() => 0)
  const base = pesos.map(p => Math.floor((total * p) / suma))
  const restos = pesos.map((p, i) => ({ i, p, resto: (total * p) % suma }))
  let falta = total - base.reduce((a, b) => a + b, 0)
  restos.sort((a, b) => b.resto - a.resto || b.p - a.p || a.i - b.i)
  for (const r of restos) {
    if (falta <= 0) break
    base[r.i] += 1
    falta -= 1
  }
  return base
}

export function calcularSkins(entrada: EntradaSkins): ResultadoSkins {
  const { opciones, jugadores, hoyos, scores } = entrada
  const { golpes, handicapsIncompletos } = golpesDelSkins(entrada)
  const ultimo = hoyos.length - 1

  // Skins en unidades de 1/k (k = cuántos empataron el último hoyo con `repartir`): aritmética entera exacta.
  const unidadesHoyo: Record<string, number> = Object.fromEntries(jugadores.map(j => [j.id, 0]))
  let divisor = 1
  let repartoUltimo: { entre: string[]; valor: number } | null = null

  const netoDe = (jugadorId: string, h: HoyoSkins): number | typeof FUERA_DEL_HOYO | null => {
    const s = scores[jugadorId]?.[h.numero]
    if (s === FUERA_DEL_HOYO) return FUERA_DEL_HOYO
    if (typeof s !== 'number' || !Number.isInteger(s) || s < 1) return null
    return s - (golpes[jugadorId]?.[h.numero] ?? 0)
  }

  const resultado: ResultadoHoyoSkins[] = []
  let arrastre = 0
  let provisional = false

  hoyos.forEach((h, idx) => {
    const valor = 1 + arrastre
    const enJuego = jugadores.filter(j => juegaElHoyo(j, h.numero))
    const netos: ResultadoHoyoSkins['netos'] = {}
    for (const j of jugadores) netos[j.id] = juegaElHoyo(j, h.numero) ? netoDe(j.id, h) : null
    const anotados = enJuego.filter(j => netos[j.id] !== null)
    const conGolpes = anotados.filter(j => typeof netos[j.id] === 'number')
    const mejorNeto = conGolpes.length ? Math.min(...conGolpes.map(j => netos[j.id] as number)) : null
    const lideres = mejorNeto === null ? [] : conGolpes.filter(j => netos[j.id] === mejorNeto).map(j => j.id)
    const completo = enJuego.length > 0 && anotados.length === enJuego.length

    const fila: ResultadoHoyoSkins = {
      numero: h.numero, estado: 'por_jugar', valor, valorProvisional: provisional, mejorNeto, lideres,
      ganador: null, repartidoEntre: [], noValidado: false, netos,
    }
    resultado.push(fila)

    if (!completo) {
      // Spec «Estado de cada hoyo»: sin cerrar, lo de después es provisional y no arrastra nada todavía.
      fila.estado = anotados.length === 0 && enJuego.length > 0 ? 'por_jugar' : 'en_disputa'
      if (enJuego.length === 0) fila.estado = 'perdido' // nadie juega el hoyo (todos retirados): no hay a quién dárselo
      if (enJuego.length > 0) provisional = true
      arrastre = 0
      return
    }

    if (lideres.length !== 1) {
      // Empate (o todos X).
      if (idx === ultimo) {
        if (opciones.empateUltimoHoyo === 'repartir' && lideres.length > 1) {
          fila.estado = 'repartido'
          fila.repartidoEntre = lideres
          repartoUltimo = { entre: lideres, valor }
        } else {
          fila.estado = 'perdido'
        }
        arrastre = 0
      } else {
        fila.estado = 'arrastre'
        arrastre = valor
      }
      return
    }

    const ganador = lideres[0]
    const debeValidar = opciones.validacion && valor >= 2 && idx < ultimo
    if (debeValidar) {
      const siguiente = hoyos[idx + 1]
      const j = jugadores.find(x => x.id === ganador)!
      const neto = juegaElHoyo(j, siguiente.numero) ? netoDe(ganador, siguiente) : FUERA_DEL_HOYO
      if (neto === null) {
        fila.estado = 'por_validar'
        fila.lideres = [ganador]
        provisional = true
        arrastre = 0
        return
      }
      if (neto === FUERA_DEL_HOYO || neto > siguiente.par) {
        fila.estado = 'arrastre'
        fila.noValidado = true
        arrastre = valor
        return
      }
    }
    fila.estado = 'ganado'
    fila.ganador = ganador
    unidadesHoyo[ganador] += valor
    arrastre = 0
  })

  // Reparto del último hoyo: pasar todo a unidades de 1/k.
  const reparto = repartoUltimo as { entre: string[]; valor: number } | null
  if (reparto) {
    divisor = reparto.entre.length
    for (const id of Object.keys(unidadesHoyo)) unidadesHoyo[id] *= divisor
    for (const id of reparto.entre) unidadesHoyo[id] += reparto.valor
  }
  for (const e of entrada.especialesValidos ?? []) {
    if (e.jugadorId in unidadesHoyo) unidadesHoyo[e.jugadorId] += divisor
  }

  const unidades = jugadores.map(j => unidadesHoyo[j.id])
  const totalUnidades = unidades.reduce((a, b) => a + b, 0)
  const definitivo = resultado.every(r => !['por_jugar', 'en_disputa', 'por_validar'].includes(r.estado))
  const pozoTotal = Math.max(0, Math.trunc(opciones.pozoPorJugador)) * jugadores.length
  const devolucion = definitivo && totalUnidades === 0 && pozoTotal > 0
  const cobros = devolucion
    ? jugadores.map(() => pozoTotal / jugadores.length)
    : repartirPorRestoMayor(pozoTotal, unidades)

  const skinsCobrados = totalUnidades / divisor
  return {
    hoyos: resultado,
    jugadores: jugadores.map((j, i) => ({
      id: j.id,
      skins: unidades[i] / divisor,
      cobra: cobros[i],
      neto: cobros[i] - (pozoTotal > 0 ? pozoTotal / jugadores.length : 0),
    })),
    golpes,
    skinsCobrados,
    pozoTotal,
    valorSkin: pozoTotal > 0 && totalUnidades > 0 ? pozoTotal / skinsCobrados : null,
    definitivo,
    devolucion,
    handicapsIncompletos,
  }
}
