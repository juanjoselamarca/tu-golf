/**
 * Motor del formato Skins. Spec: docs/specs/formato-skins.md (fuente de las reglas; cada regla citada acá).
 *
 * Funciones puras: reciben los scores tal como están (completos o a medio jugar) y devuelven el estado de cada
 * hoyo, los skins de cada jugador y la liquidación del pozo. Sirven igual para un torneo de varios grupos y
 * para una Timba de un grupo: quien llama arma la entrada, el motor no sabe de dónde vino.
 */
import type { ModoJuego } from '../../core/rules'
import { strokesRecibidosEnHoyo } from '../../core/stableford-score'
import { isValidStrokeIndexPermutation } from '../../core/stroke-index'
import { esHandicapUsable, golpesALaDiferenciaDelMasBajo } from '../match-play'

/** «Fuera del hoyo»: levantó la bola. Nunca se convierte en número. */
export const FUERA_DEL_HOYO = 'X' as const
export type ScoreSkins = number | typeof FUERA_DEL_HOYO

export const EMPATES_ULTIMO_HOYO = ['repartir', 'se_pierde'] as const
export type EmpateUltimoHoyo = (typeof EMPATES_ULTIMO_HOYO)[number]

export interface OpcionesSkins {
  modo: ModoJuego
  empateUltimoHoyo: EmpateUltimoHoyo
  /** Spec «Validación»: solo hoyos con arrastre, par neto o mejor en el hoyo siguiente. */
  validacion: boolean
  /** Pesos enteros por jugador; 0 = se juega sin plata. */
  pozoPorJugador: number
}

export interface JugadorSkins {
  id: string
  /**
   * Hándicap de juego (CH × %, ya redondeado: `handicapDeJuego`), en la escala de los hoyos de la ronda (de 9 en
   * una de 9). `null` = no se conoce. Ignorado en gross. Quien llama lo CONGELA al empezar: si cambiara a mitad de
   * ronda, cambiaría el más bajo del campo y un hoyo ya ganado podría cambiar de dueño.
   */
  handicapDeJuego: number | null
  /**
   * Hoyos (números) que no juega por retiro. Conjunto, no «desde el hoyo N»: con salida por el 10 o shotgun, el
   * orden de juego no es el de numeración. Quien llama lo arma con el hoyo de salida de su grupo.
   */
  hoyosQueNoJuega?: readonly number[]
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
  /**
   * En el ORDEN DEL ARRASTRE (spec «Arrastre en orden»): el empate de un hoyo pasa al siguiente de esta lista y
   * el último de la lista es el «último hoyo». Torneo: numeración. Timba de un grupo: el orden en que lo juega
   * (sale por el 10 → 10..18, 1..9).
   */
  hoyos: readonly HoyoSkins[]
  /** `scores[jugadorId][numeroHoyo]`; ausente = sin anotar. */
  scores: Readonly<Record<string, Readonly<Record<number, ScoreSkins | undefined>>>>
  /**
   * Puntos especiales que valen (ya evaluados con la regla compartida con la Timba). Cada uno = 1 skin.
   * Spec «Puntos especiales».
   */
  especialesValidos?: readonly { jugadorId: string; hoyo: number; puntitoId: string }[]
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
  /**
   * Algún hoyo anterior todavía no se resuelve: el valor puede subir. Con validación también podría cambiar el
   * estado (un hoyo que hoy vale 1 podría terminar necesitando validación); por eso, con validación, un hoyo
   * provisional ganado sin validar queda `por_validar` y no se acredita.
   */
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
  /**
   * Solo en `por_validar`: qué falta. `validacion` = el ganador todavía no anota el hoyo siguiente.
   * `hoyo_anterior` = ya anotó y no validó, pero un hoyo anterior abierto decide si hacía falta validar.
   */
  esperando: 'validacion' | 'hoyo_anterior' | null
  /** Neto (o gross en modo gross) de cada jugador en el hoyo; X; `null` = sin anotar o retirado. */
  netos: Record<string, number | typeof FUERA_DEL_HOYO | null>
}

export interface ResultadoJugadorSkins {
  id: string
  /** Skins cobrados (hoyos + reparto + especiales). Puede tener fracción por el reparto del último hoyo. */
  skins: number
  /** Cuántos de esos skins son puntos especiales (1 cada uno); los demás salen de los hoyos. */
  especiales: number
  /** Pesos que cobra (estimado mientras `definitivo` sea false). */
  cobra: number
  /** `cobra − pozoPorJugador`; 0 mientras no haya liquidación (nadie cobró aún, o bloqueada). */
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
  /** Motivos que impiden liquidar. Con alguno, no hay plata ni resultado definitivo: quien llama debe bloquear. */
  bloqueos: BloqueosSkins
  /** Sin bloqueos: los skins y la plata valen. */
  liquidable: boolean
}

export interface BloqueosSkins {
  /** Jugadores sin hándicap usable en modo neto (mismo nombre que en la Timba). */
  sinHandicap: string[]
  /** Los SI de la ronda no son una permutación 1..N: los golpes caerían mal. */
  indiceDificultadInvalido: boolean
  /** Jugadores con más golpes que 3 por hoyo en todos los hoyos (más no se modela). */
  golpesSobreElTope: string[]
}

/** Hoyo cerrado: anotar más no lo cambia (salvo el valor, si `valorProvisional`). */
export function esHoyoResuelto(estado: EstadoHoyoSkins): boolean {
  return estado === 'ganado' || estado === 'arrastre' || estado === 'repartido' || estado === 'perdido'
}

/** Golpes del skins: el más bajo del campo juega a 0 (spec «Golpes»). */
export function golpesDelSkins(
  entrada: Pick<EntradaSkins, 'opciones' | 'jugadores' | 'hoyos'>,
): { golpes: Record<string, Record<number, number>>; bloqueos: BloqueosSkins } {
  const { opciones, jugadores, hoyos } = entrada
  const n = hoyos.length
  const siPorPosicion: Record<number, number> = {}
  hoyos.forEach((h, i) => { siPorPosicion[i + 1] = h.si })
  const bloqueos: BloqueosSkins = {
    sinHandicap: opciones.modo === 'neto' ? jugadores.filter(j => !esHandicapUsable(j.handicapDeJuego)).map(j => j.id) : [],
    indiceDificultadInvalido: opciones.modo === 'neto' && n > 0 && !isValidStrokeIndexPermutation(siPorPosicion, n),
    golpesSobreElTope: [],
  }
  const sinGolpes = opciones.modo === 'gross' || bloqueos.sinHandicap.length > 0 || bloqueos.indiceDificultadInvalido
  const base = sinGolpes ? jugadores.map(() => 0) : golpesALaDiferenciaDelMasBajo(jugadores.map(j => j.handicapDeJuego as number))
  // Sin hoyos no hay tope que medir (lo bloquea quien llama: no hay ronda).
  bloqueos.golpesSobreElTope = n === 0 ? [] : jugadores.filter((_, i) => base[i] > 3 * n).map(j => j.id)
  const golpes: Record<string, Record<number, number>> = {}
  jugadores.forEach((j, i) => {
    golpes[j.id] = {}
    for (const h of hoyos) golpes[j.id][h.numero] = strokesRecibidosEnHoyo(base[i], h.si, n)
  })
  return { golpes, bloqueos }
}

const juegaElHoyo = (j: JugadorSkins, hoyo: number) => !j.hoyosQueNoJuega?.includes(hoyo)

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
  const { golpes, bloqueos } = golpesDelSkins(entrada)
  const liquidable =
    bloqueos.sinHandicap.length === 0 && !bloqueos.indiceDificultadInvalido && bloqueos.golpesSobreElTope.length === 0
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
      ganador: null, repartidoEntre: [], noValidado: false, esperando: null, netos,
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
    // Con un hoyo anterior abierto el valor real puede ser ≥ 2 aunque hoy muestre 1: se mira la validación igual.
    const puedeNecesitarValidar = opciones.validacion && idx < ultimo && (valor >= 2 || provisional)
    if (puedeNecesitarValidar) {
      const siguiente = hoyos[idx + 1]
      const j = jugadores.find(x => x.id === ganador)!
      const neto = juegaElHoyo(j, siguiente.numero) ? netoDe(ganador, siguiente) : FUERA_DEL_HOYO
      const valida = typeof neto === 'number' && neto <= siguiente.par
      if (!valida) {
        if (neto === null || valor < 2) {
          // Todavía no anota el siguiente, o no validó pero no se sabe si hacía falta (el valor real depende de un
          // hoyo abierto): queda pendiente, sin acreditar.
          fila.estado = 'por_validar'
          fila.esperando = neto === null ? 'validacion' : 'hoyo_anterior'
          fila.lideres = [ganador]
          provisional = true
          arrastre = 0
          return
        }
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
    // Ganado es firme sea cual sea el valor real: el hoyo siguiente arranca de cero, seguro.
    provisional = false
  })

  // Reparto del último hoyo: pasar todo a unidades de 1/k.
  const reparto = repartoUltimo as { entre: string[]; valor: number } | null
  if (reparto) {
    divisor = reparto.entre.length
    for (const id of Object.keys(unidadesHoyo)) unidadesHoyo[id] *= divisor
    for (const id of reparto.entre) unidadesHoyo[id] += reparto.valor
  }
  // Cada (jugador, hoyo, punto) vale una vez. No cobra quien no está en la ronda ni en un hoyo que no es de la
  // ronda o que no juega (retirado).
  const especialesVistos = new Set<string>()
  const especialesDe: Record<string, number> = {}
  const numeros = new Set(hoyos.map(h => h.numero))
  const porId = new Map(jugadores.map(j => [j.id, j]))
  for (const e of entrada.especialesValidos ?? []) {
    const clave = `${e.jugadorId}|${e.hoyo}|${e.puntitoId}`
    const j = porId.get(e.jugadorId)
    if (!j || !numeros.has(e.hoyo) || !juegaElHoyo(j, e.hoyo) || especialesVistos.has(clave)) continue
    especialesVistos.add(clave)
    unidadesHoyo[e.jugadorId] += divisor
    especialesDe[e.jugadorId] = (especialesDe[e.jugadorId] ?? 0) + 1
  }

  const unidades = jugadores.map(j => unidadesHoyo[j.id])
  const totalUnidades = unidades.reduce((a, b) => a + b, 0)
  // Sin hoyos no hay ronda que cerrar (`[].every` daría true y saldría «se devuelve el pozo»).
  const definitivo = liquidable && resultado.length > 0 && resultado.every(r => esHoyoResuelto(r.estado))
  const aporte = aporteDelSkins(opciones.pozoPorJugador)
  const pozoTotal = pozoTotalDelSkins(opciones.pozoPorJugador, jugadores.length)
  const devolucion = definitivo && totalUnidades === 0 && pozoTotal > 0
  const hayLiquidacion = liquidable && pozoTotal > 0 && (totalUnidades > 0 || devolucion)
  const cobros = !hayLiquidacion
    ? jugadores.map(() => 0)
    : devolucion
      ? jugadores.map(() => aporte)
      : repartirPorRestoMayor(pozoTotal, unidades)

  const skinsCobrados = totalUnidades / divisor
  return {
    hoyos: resultado,
    jugadores: jugadores.map((j, i) => ({
      id: j.id,
      skins: unidades[i] / divisor,
      especiales: especialesDe[j.id] ?? 0,
      cobra: cobros[i],
      neto: hayLiquidacion ? cobros[i] - aporte : 0,
    })),
    golpes,
    skinsCobrados,
    pozoTotal,
    valorSkin: hayLiquidacion && !devolucion ? pozoTotal / skinsCobrados : null,
    definitivo,
    devolucion,
    bloqueos,
    liquidable,
  }
}

/** Lo que pone cada jugador: un entero ≥ 0 (un valor raro cuenta como sin plata). */
export function aporteDelSkins(pozoPorJugador: number): number {
  return Number.isFinite(pozoPorJugador) ? Math.max(0, Math.trunc(pozoPorJugador)) : 0
}

/**
 * El pozo del Skins: lo que pone cada uno por la cantidad de jugadores. Fuente única para el motor, el resumen del
 * asistente y el pie de «Editar» (p. ej. $10.000 × 4 = $40.000).
 */
export function pozoTotalDelSkins(pozoPorJugador: number, jugadores: number): number {
  return aporteDelSkins(pozoPorJugador) * Math.max(0, Math.trunc(jugadores))
}
