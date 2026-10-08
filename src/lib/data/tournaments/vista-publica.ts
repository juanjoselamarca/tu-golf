// ─── Qué ve del board de torneo un espectador SIN sesión ─────────────────────
//
// Decisiones de producto (Juanjo, 08-oct-2026), sólo para el camino de ronda libre
// de /torneo/[slug] (los torneos legacy quedan como están, decisión 2):
//
//  1. "Solo bruto": sin sesión, en un torneo NETO se ve SOLO el resultado bruto.
//     Ni el neto, ni la posición neta, ni los puntos Stableford netos: de
//     cualquiera de ellos más el bruto se deduce el handicap (y de ahí el índice).
//  2. El handicap de un jugador con cuenta no se le muestra a un visor sin sesión.
//     Los invitados (índice tipeado en la tarjeta) sí, salvo en la vista bruta de
//     un torneo neto, donde su handicap más el bruto también daría el neto.
//
// Todo se decide en el SERVIDOR: el dato que no corresponde ni siquiera viaja al
// cliente (las props de un componente cliente se leen en el HTML). El puntaje que
// sí viaja ya está calculado con el handicap real.

import type { Player } from '@/lib/golf-data'
import type { FormatoJuego, ModoJuego } from '@/golf/core/rules'
import type { JugadorGWIInput } from '@/golf/stats/gwi'
import type { TournamentLeaderboardContext } from '@/golf/leaderboard/types'
import type { DBRondaLibreJugador } from '@/app/torneo/[slug]/types'
import { buildLeaderboardFromRondaLibre } from '@/golf/leaderboard/build-from-ronda-libre'

export interface VistaPublica {
  /** Sin sesión, camino de ronda libre: no viaja nada neto. */
  sinNeto: boolean
  /** Además el torneo es neto: la clasificación pasa a ser la bruta. */
  soloBruto: boolean
  /** Modo y formato con los que se ARMA lo que viaja (gross/stroke play en la vista bruta). */
  modo: ModoJuego
  formato: FormatoJuego
}

export function vistaPublica(args: {
  visorConSesion: boolean
  caminoRondaLibre: boolean
  modoJuego: ModoJuego
  formatoJuego: FormatoJuego
}): VistaPublica {
  const sinNeto = !args.visorConSesion && args.caminoRondaLibre
  const soloBruto = sinNeto && args.modoJuego === 'neto'
  return {
    sinNeto,
    soloBruto,
    modo: soloBruto ? 'gross' : args.modoJuego,
    // Stableford neto sin neto = golpes brutos (los puntos netos delatan el handicap).
    formato: soloBruto && args.formatoJuego === 'stableford' ? 'stroke_play' : args.formatoJuego,
  }
}

/** Ids de jugador (`Player.id`) cuyo handicap no se le muestra a este visor. */
export function idsConHandicapOculto(
  jugadores: ReadonlyArray<{ id: string; handicap_de_perfil?: boolean }>,
  visorConSesion: boolean,
): Set<string> {
  if (visorConSesion) return new Set()
  return new Set(jugadores.filter((j) => j.handicap_de_perfil).map((j) => j.id))
}

/** Copia de `players` con `hcp`/`hcpDisplay` en null para los ids ocultos. */
export function ocultarHandicaps<P extends Player>(players: P[], ocultos: ReadonlySet<string>): Player[] {
  if (ocultos.size === 0) return players
  return players.map((p) => (p.id != null && ocultos.has(p.id) ? { ...p, hcp: null, hcpDisplay: null } : p))
}

/**
 * Lo que viaja de cada jugador cuando el visor no tiene sesión: nunca el neto. En
 * la vista bruta de un torneo neto, tampoco los puntos ni el handicap de nadie.
 * Se ARMA con campos explícitos (no con `...p` menos algunos) para que un campo
 * nuevo del motor no se cuele por defecto.
 */
export function filaPublica(p: Player, vista: VistaPublica, ocultos: ReadonlySet<string>): Player {
  const hcpOculto = vista.soloBruto || (p.id != null && ocultos.has(p.id))
  return {
    pos: p.pos,
    id: p.id,
    name: p.name,
    country: p.country,
    cat: p.cat,
    hcp: hcpOculto ? null : p.hcp,
    hcpDisplay: hcpOculto ? null : p.hcpDisplay,
    today: p.today,
    total: p.total,
    holes: p.holes,
    grossTotal: p.grossTotal,
    // Stableford GROSS: los puntos no dependen del handicap y se muestran.
    ...(vista.soloBruto ? {} : { stablefordTotal: p.stablefordTotal }),
    status: p.status,
    scores: p.scores,
    latestRound: p.latestRound,
  }
}

export interface BoardPublicoRondaLibre {
  players: Player[]
  playersByGross: Player[]
  playersByNeto: Player[]
  gwiInputs: JugadorGWIInput[]
}

/**
 * El board de /torneo/[slug] (camino de ronda libre) tal como VIAJA al cliente
 * para este visor. Es lo que llama la página: los tests ejercitan esta misma
 * función, no una copia de su composición.
 *
 * En la vista bruta el ranking se ARMA en gross (orden y countback por golpes
 * brutos): es el mismo motor con otro modo, no un reordenamiento posterior.
 */
export function boardPublicoRondaLibre(
  jugadores: DBRondaLibreJugador[],
  ctx: TournamentLeaderboardContext,
  vista: VistaPublica,
): BoardPublicoRondaLibre {
  const out = buildLeaderboardFromRondaLibre(jugadores, { ...ctx, modoJuego: vista.modo, formatoJuego: vista.formato })
  if (!vista.sinNeto) return out
  const ocultos = idsConHandicapOculto(jugadores, false)
  return {
    players: out.players.map((p) => filaPublica(p, vista, ocultos)),
    playersByGross: out.playersByGross.map((p) => filaPublica(p, vista, ocultos)),
    // Sin ranking neto: el toggle Gross/Neto no aparece.
    playersByNeto: [],
    // El GWI de un torneo neto modela el neto: no se publica en la vista bruta.
    gwiInputs: vista.soloBruto ? [] : out.gwiInputs,
  }
}
