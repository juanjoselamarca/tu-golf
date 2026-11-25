/**
 * El skins en el scorer de grupo: las reglas guardadas de la ronda y lo que vale el hoyo en pantalla («Vale 3 skins»),
 * con el mismo motor que liquida (`calcularSkins`). Spec docs/specs/formato-skins.md («Arrastre», «Golpes»).
 *
 * Los hándicaps son los CONGELADOS al crear la ronda: el índice que quedó en `ronda_libre_jugadores.handicap` (la API
 * de creación exige índice de todos en neto: `validarConfigSkins` bloquea `sinHandicap`) con el tee fijo de cada
 * jugador, en la escala de los hoyos de la ronda: el contexto lo arma `contextoSkinsDeRondaNueva`, el mismo que validó
 * al crear. Nunca el índice vivo del perfil: cambiaría el más bajo del campo a mitad de ronda.
 */
import { handicapDeJuego } from '@/golf/core/playing-handicap'
import { esHandicapUsable } from '@/golf/formats/match-play'
import {
  calcularSkins, configSkinsSchema, opcionesDelMotor, tarjetaDelSkins,
  type ContextoValidacionSkins, type FueraPorJugador,
} from '@/golf/formats/skins'
import type { ReglasSkinsGuardadas } from './skins-de-ronda-nueva'

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
