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
import type { HcpConSesion } from '@/lib/data/ronda-libre-live-api'
import { formatLabel, type FormatoJuego, type ModoJuego } from '@/golf/core/rules'
import { esFormatoPersonalizado } from '@/golf/formats/personalizado'
import { COPY_CLASIFICACION_BRUTA } from '@/lib/vista-publica-copy'
import {
  construirRespuestaGWI, hoyosJugadosGWI, narrativaNeutraGWI, SIN_FILAS_DEL_VISOR,
  type GWIResponse, type JugadorGWIInput,
} from '@/golf/stats/gwi'
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

/**
 * La respuesta del GWI tal como VIAJA a este visor: para los ids ocultos,
 * `breakdown.handicapInfo` y `volatilidad` en null y una narrativa neutra. Lleva el índice crudo (y la sigma, que sale de
 * él): sin esto, el panel "probabilidad de ganar" pintaba "HCP 18" de un jugador
 * con cuenta a un espectador sin sesión. El cálculo ya se hizo con el índice real.
 */
export function publicarGWIParaVisor(gwi: GWIResponse, ocultos: ReadonlySet<string>): GWIResponse {
  if (ocultos.size === 0) return gwi
  const hoyosRestantes = Math.max(gwi.totalHoyos - hoyosJugadosGWI(gwi.jugadores), 0)
  return {
    ...gwi,
    results: gwi.results.map((r) =>
      ocultos.has(r.id)
        ? {
            ...r,
            // Todo lo que sale del índice: el handicap y su sigma, el tramo de
            // volatilidad y las ramas de la narrativa por índice/sigma.
            // `winProbability` se queda (decisión de Juanjo, 09-oct).
            volatilidad: null,
            narrativa: narrativaNeutraGWI(hoyosRestantes),
            breakdown: { ...r.breakdown, handicapInfo: null },
          }
        : r,
    ),
  }
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
  /** Ids cuyo handicap no viaja a este visor (para `publicarGWIParaVisor`). */
  handicapOculto: ReadonlySet<string>
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
  if (!vista.sinNeto) return { ...out, handicapOculto: new Set() }
  const ocultos = idsConHandicapOculto(jugadores, false)
  return {
    handicapOculto: ocultos,
    players: out.players.map((p) => filaPublica(p, vista, ocultos)),
    playersByGross: out.playersByGross.map((p) => filaPublica(p, vista, ocultos)),
    // Sin ranking neto: el toggle Gross/Neto no aparece.
    playersByNeto: [],
    // El GWI de un torneo neto modela el neto: no se publica en la vista bruta.
    gwiInputs: vista.soloBruto ? [] : out.gwiInputs,
  }
}

/**
 * El GWI del board público, listo para viajar: calculado con los inputs del board
 * (vacíos en la vista bruta) y con el handicap anulado en las filas ocultas. Es
 * lo que llama la página; los tests ejercitan esta misma función.
 */
export function gwiDelBoardPublico(
  board: Pick<BoardPublicoRondaLibre, 'gwiInputs' | 'handicapOculto'>,
  meta: { totalHoyos: number; modoJuego: ModoJuego; formatoJuego: FormatoJuego },
): GWIResponse {
  return publicarGWIParaVisor(construirRespuestaGWI(board.gwiInputs, meta, SIN_FILAS_DEL_VISOR), board.handicapOculto)
}

/**
 * Label del formato para este visor: el REAL del torneo. En la vista bruta,
 * "<Formato> · Clasificación bruta" (no "Stroke Play Gross" sobre un Stableford).
 */
export function etiquetaDelFormato(vista: VistaPublica, formatoJuego: FormatoJuego, modoJuego: ModoJuego): string {
  return vista.soloBruto ? `${formatLabel(formatoJuego)} · ${COPY_CLASIFICACION_BRUTA}` : formatLabel(formatoJuego, modoJuego)
}

/**
 * La vista en vivo de una RONDA LIBRE (`/ronda-libre/[codigo]`, ruta pública
 * cacheada `/api/ronda-libre/[codigo]/live`) viaja como datos CRUDOS (golpes +
 * handicap de tarjeta) y el navegador arma el ranking. Misma regla que el board de
 * torneo (`vistaPublica`): la respuesta pública es la de un visor SIN sesión.
 *  - Siempre: no se leen perfiles (el handicap de un jugador con cuenta sin índice
 *    en la tarjeta, `indiceVieneDelPerfil`, no viaja: queda en `sinIndice`).
 *  - Ronda NETO (`soloBruto`): no viaja el handicap de NADIE (ni de invitados), ni
 *    course handicap, ni el handicap de equipo: con cualquiera de ellos más el bruto
 *    se deduce el neto.
 *  - Timba libre (`personalizado`): no viaja el índice ni el hándicap de nadie, ni en gross; el
 *    propio llega por `/hcp` (la regla y su porqué están en `handicapsVisiblesParaElVisor`). El juego lo entrega
 *    ya calculado `/api/ronda-libre/[codigo]/juego` (puntos y golpes recibidos por hoyo).
 * `vista` le dice al navegador qué puede mostrar (sin neto; clasificación bruta en
 * `vista.modo`/`vista.formato`). El visor con sesión completa con su ruta privada.
 */
export function datosRondaLibrePublicos<B extends {
  ronda: { modo_juego?: string | null; formato_juego?: string | null; ronda_libre_jugadores: Array<{ handicap?: number | null }> }
  courseHcpMap: Record<string, number>
  courseHcpCompletoMap?: Record<string, number>
  displayHcpMap: Record<string, number>
  sinIndice: string[]
  equipos: Array<{ handicap_equipo: number | null; handicap_equipo_juego?: number | null }>
}>(b: B): B & { vista: VistaPublica } {
  const vista = vistaPublica({
    visorConSesion: false,
    caminoRondaLibre: true,
    modoJuego: b.ronda.modo_juego === 'neto' ? 'neto' : 'gross',
    formatoJuego: (b.ronda.formato_juego ?? 'stroke_play') as FormatoJuego,
  })
  if (!vista.soloBruto && !esFormatoPersonalizado(b.ronda.formato_juego)) return { ...b, vista }
  return {
    ...b,
    ronda: { ...b.ronda, ronda_libre_jugadores: b.ronda.ronda_libre_jugadores.map((j) => ({ ...j, handicap: null })) },
    courseHcpMap: {},
    courseHcpCompletoMap: {},
    displayHcpMap: {},
    sinIndice: [],
    equipos: b.equipos.map((e) => ({ ...e, handicap_equipo: null, handicap_equipo_juego: null })),
    vista,
  }
}

/**
 * Timba libre (decisión de Juanjo, 27-oct-2026): `/hcp` y `/live` no le entregan a un visor con sesión el índice ni
 * el hándicap de juego de OTRO jugador. No es por privacidad (el hándicap no es dato privado) sino por espacio y
 * diseño: la Timba entrega su juego ya calculado por `GET /juego`; si el diseño del PR C muestra golpes recibidos o
 * HCP, se agregan a `VistaDelJuego`, sin reabrir `/hcp` ni `/live`. En una ronda `personalizado` quedan solo las entradas de los jugadores de la ronda que
 * son el propio visor (`user_id`); los rivales sin cuenta (`user_id` null, #581) nunca son el visor. En el resto
 * de los formatos, todo igual.
 */
export function handicapsVisiblesParaElVisor(
  h: Required<HcpConSesion>,
  ronda: { formato_juego?: string | null; ronda_libre_jugadores: ReadonlyArray<{ id: string; user_id?: string | null }> },
  visorId: string,
): Required<HcpConSesion> {
  if (!esFormatoPersonalizado(ronda.formato_juego)) return h
  const propios = new Set(ronda.ronda_libre_jugadores.filter(j => !!j.user_id && j.user_id === visorId).map(j => j.id))
  const solo = <T,>(m: Record<string, T>) => Object.fromEntries(Object.entries(m).filter(([id]) => propios.has(id)))
  return {
    courseHcpMap: solo(h.courseHcpMap),
    courseHcpCompletoMap: solo(h.courseHcpCompletoMap),
    displayHcpMap: solo(h.displayHcpMap),
    sinIndice: h.sinIndice.filter(id => propios.has(id)),
    handicapPorJugador: solo(h.handicapPorJugador),
    handicapPorEquipo: {},
    handicapJuegoPorEquipo: {},
  }
}
