/**
 * El skins en el scorer de grupo: las reglas guardadas de la ronda y lo que vale el hoyo en pantalla («Vale 3 skins»),
 * con el mismo motor que liquida (`calcularSkins`). Spec docs/specs/formato-skins.md («Arrastre», «Golpes»).
 *
 * Lo congelado al crear es el ÍNDICE: el que quedó en `ronda_libre_jugadores.handicap` (la API de creación exige índice
 * de todos en neto: `validarConfigSkins` bloquea `sinHandicap`), nunca el índice vivo del perfil, que cambiaría el más
 * bajo del campo a mitad de ronda. El course handicap NO se guarda: se recalcula con ese índice, el tee fijo de cada
 * jugador y el rating/slope que la cancha tenga al leerlo, en la escala de los hoyos de la ronda. Lo arma
 * `contextoSkinsDeRondaNueva`, el mismo que validó al crear.
 */
import { handicapDeJuego } from '@/golf/core/playing-handicap'
import { esHandicapUsable } from '@/golf/formats/match-play'
import {
  calcularSkins, configSkinsSchema, opcionesDelMotor, tarjetaDelSkins, SKINS_POR_PUNTO_ESPECIAL,
  type ConfigSkins, type ContextoValidacionSkins, type FueraPorJugador, type HoyoSkins, type ResultadoSkins, type ScoreSkins,
} from '@/golf/formats/skins'
import type { MarcaPuntito } from '@/golf/formats/personalizado'
import { esUnoPorHoyo, marcaUnoPorHoyoQueVale, porQueNoCuenta } from '@/golf/formats/personalizado/puntos-especiales'
import { hoyosNoJugadosPorRetiro } from '@/golf/formats/personalizado/retiro'
import type { ReglasSkinsGuardadas } from './skins-de-ronda-nueva'
import { marcasDesdeLaBase, retirosDesdeLaBase, type FilaMarcaPuntito, type FilaRetiro } from './juego-de-la-ronda'
import type { PuntitoMarcable, VistaConMarcas } from './marcas-de-la-timba'
import { armarTablaDelSkins, type TablaDelSkins } from './tabla-del-skins'

/** `reglas_juego` de una ronda de skins; `null` si falta o no es válida (no se inventa un skins). */
export function leerReglasSkins(reglas: unknown): ReglasSkinsGuardadas | null {
  if (reglas == null || typeof reglas !== 'object') return null
  const { config, jugadorIds } = reglas as { config?: unknown; jugadorIds?: unknown }
  const c = configSkinsSchema.safeParse(config)
  if (!c.success || !Array.isArray(jugadorIds) || !jugadorIds.every(id => typeof id === 'string')) return null
  return { config: c.data, jugadorIds: [...jugadorIds] }
}

export interface ValorDelHoyoSkins {
  /** Skins en juego en el hoyo (1 + arrastre). */
  valor: number
  /** Un hoyo anterior sigue abierto: el valor todavía puede subir. */
  provisional: boolean
}

/**
 * Lo que vale `hoyo`. `null` si no se puede decir con certeza: sin reglas, hoyo fuera del skins, o con bloqueos del
 * motor (sin hándicap, SI inválido, más de 3 golpes por hoyo): sin datos confiables no hay plata ni cifra.
 *
 * `contexto.jugadores` va en el orden de `reglas.jugadorIds` (así lo arma la creación y así se lee acá).
 */
export function valorDelHoyoSkins(input: EntradaDelSkinsDeLaRonda & { hoyo: number }): ValorDelHoyoSkins | null {
  const resultado = resultadoDelSkins(input)
  if (!resultado?.liquidable) return null
  const h = resultado.hoyos.find(x => x.numero === input.hoyo)
  return h ? { valor: h.valor, provisional: h.valorProvisional } : null
}

/** Lo guardado de una ronda de skins que entra al motor. */
export interface EntradaDelSkinsDeLaRonda {
  reglas: ReglasSkinsGuardadas
  /** `contexto.jugadores` en el orden de `reglas.jugadorIds` (así lo arma la creación y así se lee). */
  contexto: ContextoValidacionSkins
  scores: Readonly<Record<string, Readonly<Record<string | number, unknown>> | undefined>>
  fuera: FueraPorJugador | undefined
  /** Desde qué hoyo se retiró cada uno (`retirosDesdeLaBase`); el retiro corre en orden de juego. */
  retiros?: Readonly<Record<string, number>>
  /** Marcas de puntos especiales en el orden en que se marcaron (`marcasDesdeLaBase`). */
  marcas?: readonly MarcaPuntito[]
}

/**
 * El resultado del motor (`calcularSkins`) para una ronda de skins guardada: hoyos, skins y plata. Fuente única para
 * «Vale N skins» del scorer y la tabla en vivo. `null` si las reglas y el contexto no calzan (no se inventa un skins).
 */
export function resultadoDelSkins(input: EntradaDelSkinsDeLaRonda): ResultadoSkins | null {
  const { reglas, contexto, scores, fuera, retiros, marcas } = input
  const { config, jugadorIds } = reglas
  if (contexto.jugadores.length !== jugadorIds.length || contexto.hoyos.length === 0) return null
  const orden = contexto.hoyos.map(h => h.numero)
  const tarjetas = Object.fromEntries(jugadorIds.map(id => [id, tarjetaDelSkins(scores[id], fuera?.[id], orden)]))
  const noJuega = Object.fromEntries(jugadorIds.map(id => [id, hoyosNoJugadosPorRetiro(retiros?.[id], orden)]))
  return calcularSkins({
    opciones: opcionesDelMotor(config),
    jugadores: jugadorIds.map((id, i) => {
      const ch = contexto.jugadores[i].courseHandicap
      return {
        id,
        handicapDeJuego: config.modo === 'neto' && esHandicapUsable(ch) ? handicapDeJuego(ch as number, config.hcpPct) : null,
        ...(noJuega[id].length > 0 && { hoyosQueNoJuega: noJuega[id] }),
      }
    }),
    hoyos: contexto.hoyos,
    scores: tarjetas,
    especialesValidos: especialesQueValenEnElSkins({ config, hoyos: contexto.hoyos, tarjetas, noJuega, marcas: marcas ?? [] }),
  })
}

/**
 * Las marcas de puntos especiales que valen un skin, con la regla de la Timba (`porQueNoCuenta`: golpes anotados, el
 * greenie solo en par 3, sandy y greenie con par o mejor en gross; `marcaUnoPorHoyoQueVale`: un greenie por hoyo, el
 * último entre quienes jugaron). Un hoyo con X, sin anotar o desde el retiro no juega: su marca no vale.
 */
export function especialesQueValenEnElSkins(input: {
  config: ConfigSkins
  hoyos: readonly HoyoSkins[]
  tarjetas: Readonly<Record<string, Readonly<Record<number, ScoreSkins>>>>
  noJuega: Readonly<Record<string, readonly number[]>>
  marcas: readonly MarcaPuntito[]
}): { jugadorId: string; hoyo: number; puntitoId: string }[] {
  const { config, hoyos, tarjetas, noJuega, marcas } = input
  const tipoDe = (id: string) => config.puntitos.find(p => p.id === id)?.tipo
  const gross = (jugadorId: string, hoyo: number): number | null => {
    if (noJuega[jugadorId]?.includes(hoyo)) return null
    const v = tarjetas[jugadorId]?.[hoyo]
    return typeof v === 'number' ? v : null
  }
  const validos: { jugadorId: string; hoyo: number; puntitoId: string }[] = []
  for (const hoyo of hoyos) {
    const delHoyo = marcas.filter(m => m.hoyo === hoyo.numero && tarjetas[m.jugadorId] !== undefined && tipoDe(m.puntitoId) !== undefined)
    const unoPorHoyo = marcaUnoPorHoyoQueVale(delHoyo, tipoDe, id => gross(id, hoyo.numero) != null)
    for (const m of delHoyo) {
      const tipo = tipoDe(m.puntitoId)!
      if (esUnoPorHoyo(tipo) && m !== unoPorHoyo) continue
      if (porQueNoCuenta(tipo, gross(m.jugadorId, hoyo.numero), hoyo.par) !== null) continue
      validos.push({ jugadorId: m.jugadorId, hoyo: hoyo.numero, puntitoId: m.puntitoId })
    }
  }
  return validos
}

/**
 * Lo que el scorer de un skins lee de `GET /juego`: los puntos especiales para marcar (cada uno vale
 * `SKINS_POR_PUNTO_ESPECIAL`), las marcas guardadas y los retiros. Sin plata ni resultado: eso es del leaderboard.
 * `formato` la distingue de la vista de la Timba (`VistaDelJuego`, que no lo trae).
 */
export interface VistaDelSkinsEnElScorer extends VistaConMarcas {
  formato: 'skins'
  config: { puntitos: PuntitoMarcable[] }
  jugadorIds: string[]
  marcas: MarcaPuntito[]
  retiros: Record<string, number>
  /**
   * La tabla en vivo y la liquidación (la lee el leaderboard, nunca el scorer). `null` si no se pudo leer la cancha para
   * armar el contexto: las marcas y los retiros igual sirven al scorer, y el leaderboard ofrece reintentar.
   */
  tabla: TablaDelSkins | null
}

export function vistaDelSkinsEnElScorer(input: {
  reglas: ReglasSkinsGuardadas
  marcas: readonly FilaMarcaPuntito[]
  retiros: readonly FilaRetiro[]
  rondaCerrada: boolean
  /** Contexto y tarjetas de la ronda; sin ellos (`null`), la vista va sin tabla. */
  tarjetas: { contexto: ContextoValidacionSkins; scores: EntradaDelSkinsDeLaRonda['scores']; fuera: FueraPorJugador } | null
}): VistaDelSkinsEnElScorer {
  const { reglas, rondaCerrada, tarjetas } = input
  const jugadores = new Set(reglas.jugadorIds)
  const marcas = marcasDesdeLaBase(input.marcas, jugadores)
  const retiros = retirosDesdeLaBase(input.retiros, jugadores)
  const resultado = tarjetas ? resultadoDelSkins({ reglas, ...tarjetas, retiros, marcas }) : null
  return {
    formato: 'skins',
    config: {
      puntitos: reglas.config.puntitos.map(p => ({
        id: p.id, tipo: p.tipo, ...(p.nombre !== undefined && { nombre: p.nombre }), valor: SKINS_POR_PUNTO_ESPECIAL,
      })),
    },
    jugadorIds: [...reglas.jugadorIds],
    marcas,
    retiros,
    rondaCerrada,
    tabla: resultado ? armarTablaDelSkins(resultado, { config: reglas.config, retiros, fuera: tarjetas?.fuera }) : null,
  }
}

/** Distingue la vista del skins de la de la Timba en lo que devuelve `GET /juego` (la de la Timba no trae `formato`). */
export function esVistaDelSkins(vista: VistaConMarcas): vista is VistaDelSkinsEnElScorer {
  return (vista as { formato?: unknown }).formato === 'skins'
}
