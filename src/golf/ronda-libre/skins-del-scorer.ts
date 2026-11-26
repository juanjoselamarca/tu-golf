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
  type ContextoValidacionSkins, type FueraPorJugador,
} from '@/golf/formats/skins'
import type { MarcaPuntito } from '@/golf/formats/personalizado'
import type { ReglasSkinsGuardadas } from './skins-de-ronda-nueva'
import { marcasDesdeLaBase, retirosDesdeLaBase, type FilaMarcaPuntito, type FilaRetiro } from './juego-de-la-ronda'
import type { PuntitoMarcable, VistaConMarcas } from './marcas-de-la-timba'

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
export function valorDelHoyoSkins(input: {
  reglas: ReglasSkinsGuardadas
  contexto: ContextoValidacionSkins
  scores: Readonly<Record<string, Readonly<Record<string | number, unknown>> | undefined>>
  fuera: FueraPorJugador | undefined
  hoyo: number
}): ValorDelHoyoSkins | null {
  const { reglas, contexto, scores, fuera, hoyo } = input
  const { config, jugadorIds } = reglas
  if (contexto.jugadores.length !== jugadorIds.length || contexto.hoyos.length === 0) return null
  const orden = contexto.hoyos.map(h => h.numero)
  const resultado = calcularSkins({
    opciones: opcionesDelMotor(config),
    jugadores: jugadorIds.map((id, i) => {
      const ch = contexto.jugadores[i].courseHandicap
      return { id, handicapDeJuego: config.modo === 'neto' && esHandicapUsable(ch) ? handicapDeJuego(ch as number, config.hcpPct) : null }
    }),
    hoyos: contexto.hoyos,
    scores: Object.fromEntries(jugadorIds.map(id => [id, tarjetaDelSkins(scores[id], fuera?.[id], orden)])),
  })
  if (!resultado.liquidable) return null
  const h = resultado.hoyos.find(x => x.numero === hoyo)
  return h ? { valor: h.valor, provisional: h.valorProvisional } : null
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
}

export function vistaDelSkinsEnElScorer(input: {
  reglas: ReglasSkinsGuardadas
  marcas: readonly FilaMarcaPuntito[]
  retiros: readonly FilaRetiro[]
  rondaCerrada: boolean
}): VistaDelSkinsEnElScorer {
  const { reglas, rondaCerrada } = input
  const jugadores = new Set(reglas.jugadorIds)
  return {
    formato: 'skins',
    config: {
      puntitos: reglas.config.puntitos.map(p => ({
        id: p.id, tipo: p.tipo, ...(p.nombre !== undefined && { nombre: p.nombre }), valor: SKINS_POR_PUNTO_ESPECIAL,
      })),
    },
    jugadorIds: [...reglas.jugadorIds],
    marcas: marcasDesdeLaBase(input.marcas, jugadores),
    retiros: retirosDesdeLaBase(input.retiros, jugadores),
    rondaCerrada,
  }
}

/** Distingue la vista del skins de la de la Timba en lo que devuelve `GET /juego` (la de la Timba no trae `formato`). */
export function esVistaDelSkins(vista: VistaConMarcas): vista is VistaDelSkinsEnElScorer {
  return (vista as { formato?: unknown }).formato === 'skins'
}
