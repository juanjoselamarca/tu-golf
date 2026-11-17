// FUENTE ÚNICA de qué tarjetas de un torneo quedan FUERA DEL RANKING (#813).
//
// Decisión de Juanjo (17-nov-2026), como The Grint y los boards de federación:
// el jugador retirado (WD) o descalificado (DQ) sale del ranking y aparece al pie
// de la tabla, marcado WD/DQ y con su score visible. No recibe posición, ni
// lugar en el podio, ni probabilidad de ganar.
//
// Por qué hace falta: en el camino de ronda libre el board lee las TARJETAS
// (`ronda_libre_jugadores`), que no saben nada del estado de la inscripción. Con
// el torneo en juego el WD sigue en su grupo con su tarjeta (#810), así que el
// board lo rankeaba: alguien que se retiraba en el hoyo 12 yendo -2 quedaba
// arriba de gente que terminó los 18. El estado vive en `players.status` y el
// enlace inscripción↔tarjeta es `tournament_group_players.jugador_ronda_id`.
//
// Equipos (decisiones de Juanjo, 17-nov):
//  - Foursome: un miembro WD/DQ deja al EQUIPO al pie (Regla 22: los compañeros
//    alternan golpes; uno solo no puede seguir). → `estadoDelEquipo`.
//  - Scramble: el equipo sigue rankeado con quien queda (regla de competencia).
//  - Mejor bola, WD: sin cambios; el compañero termina solo y los hoyos que el
//    retirado ya jugó valen (Regla 23.4).
//  - Mejor bola, DQ: los golpes del descalificado no cuentan en NINGÚN hoyo y el
//    equipo sigue con la tarjeta del compañero. → `scoresQueCuentanEnMejorBola`.

import { jugadorFueraDelTorneo, type JUGADOR_FUERA_STATUSES } from '@/golf/tournament-status'

export type EstadoFueraDelRanking = (typeof JUGADOR_FUERA_STATUSES)[number]

/** Inscripción del torneo (`players`) con su estado. */
export interface InscritoConEstado {
  id: string
  user_id?: string | null
  status: string | null
  status_reason?: string | null
}

export type InscritoFuera = InscritoConEstado & { status: EstadoFueraDelRanking }

/** Grupo del torneo con el enlace de cada inscrito a su tarjeta. */
export interface GrupoConTarjetas {
  ronda_libre_id: string | null
  tournament_group_players: ReadonlyArray<{ player_id: string; jugador_ronda_id?: string | null }> | null
}

/** Lo mínimo de una tarjeta (`ronda_libre_jugadores`) que se necesita acá. */
export interface TarjetaDelTorneo {
  id: string
  ronda_id: string
  user_id: string | null
}

export interface EstadosFuera {
  /** Estado WD/DQ por id de tarjeta. */
  porTarjeta: Map<string, InscritoFuera>
  /**
   * Inscritos WD/DQ que están en un grupo con ronda pero cuya tarjeta no se pudo
   * ubicar de forma segura: su tarjeta (si existe) seguiría rankeada. Quien llama
   * lo REPORTA; nunca se adivina por nombre.
   */
  sinResolver: InscritoFuera[]
}

/** La única tarjeta de `userId` entre `candidatas`; con 0 o 2+ no hay respuesta segura. */
function tarjetaUnicaDelUsuario(
  candidatas: ReadonlyArray<TarjetaDelTorneo>,
  userId: string | null | undefined,
): string | null {
  if (!userId) return null
  const hits = candidatas.filter((t) => t.user_id === userId)
  return hits.length === 1 ? hits[0].id : null
}

/**
 * Estado WD/DQ de cada tarjeta del torneo. El enlace es `jugador_ronda_id`. Sin
 * enlace, por `user_id` sólo si hay UNA tarjeta de ese usuario en la ronda de su
 * grupo (`(ronda_id, user_id)` no tiene restricción de unicidad). Un WD/DQ sin
 * fila de grupo (se retiró antes de empezar: no debería tener tarjeta) se busca
 * igual por `user_id` en todo el torneo: con una, sale; sin ninguna, no jugó y no
 * se reporta; con 2+, se reporta como sin resolver. Invitado (sin cuenta) sin fila:
 * se reporta sólo si hay una tarjeta de invitado suelta que podría ser la suya.
 */
export function estadoFueraPorTarjeta(
  grupos: ReadonlyArray<GrupoConTarjetas>,
  inscritos: ReadonlyArray<InscritoConEstado>,
  tarjetas: ReadonlyArray<TarjetaDelTorneo>,
): EstadosFuera {
  const porTarjeta = new Map<string, InscritoFuera>()
  const sinResolver: InscritoFuera[] = []
  const fuera = inscritos.filter((p): p is InscritoFuera => jugadorFueraDelTorneo(p.status))
  if (fuera.length === 0) return { porTarjeta, sinResolver }
  const fueraPorId = new Map(fuera.map((p) => [p.id, p]))
  const conFila = new Set<string>()
  const enlazadas = new Set(grupos.flatMap((g) => (g.tournament_group_players ?? []).map((gp) => gp.jugador_ronda_id).filter(Boolean)))
  const hayTarjetaDeInvitadoSuelta = () => tarjetas.some((t) => !t.user_id && !enlazadas.has(t.id))
  for (const g of grupos) {
    for (const gp of g.tournament_group_players ?? []) {
      const inscrito = fueraPorId.get(gp.player_id)
      if (!inscrito) continue
      conFila.add(inscrito.id)
      const tarjetaId = gp.jugador_ronda_id
        ?? (g.ronda_libre_id
          ? tarjetaUnicaDelUsuario(tarjetas.filter((t) => t.ronda_id === g.ronda_libre_id), inscrito.user_id)
          : null)
      if (tarjetaId) porTarjeta.set(tarjetaId, inscrito)
      else if (g.ronda_libre_id) sinResolver.push(inscrito)
    }
  }
  for (const inscrito of fuera) {
    if (conFila.has(inscrito.id)) continue
    // Invitado sin cuenta: sólo se reporta si hay una tarjeta de invitado SUELTA (sin
    // fila que la enlace) que podría ser suya. Sin ninguna, no jugó: nada que reportar
    // (si no, cada armado del board, ~10 s, escribiría un error falso en plena ronda).
    if (!inscrito.user_id) { if (hayTarjetaDeInvitadoSuelta()) sinResolver.push(inscrito); continue }
    const suyas = tarjetas.filter((t) => t.user_id === inscrito.user_id)
    if (suyas.length === 1) porTarjeta.set(suyas[0].id, inscrito)
    else if (suyas.length > 1) sinResolver.push(inscrito) // ambiguo: no se elige una
  }
  return { porTarjeta, sinResolver }
}

/**
 * Separa las tarjetas del torneo en las que compiten (`enRanking`, lo único que
 * entra al motor del board, al podio y al GWI) y las del pie (`fuera`).
 */
export function separarFueraDelRanking<T extends TarjetaDelTorneo>(
  tarjetas: T[],
  porTarjeta: ReadonlyMap<string, InscritoFuera>,
): { enRanking: T[]; fuera: Array<{ tarjeta: T; inscrito: InscritoFuera }> } {
  if (porTarjeta.size === 0) return { enRanking: tarjetas, fuera: [] }
  const enRanking: T[] = []
  const fuera: Array<{ tarjeta: T; inscrito: InscritoFuera }> = []
  for (const t of tarjetas) {
    const inscrito = porTarjeta.get(t.id)
    if (inscrito) fuera.push({ tarjeta: t, inscrito })
    else enRanking.push(t)
  }
  return { enRanking, fuera }
}

/** Orden del pie: más hoyos jugados primero; a igualdad, WD antes que DQ y por nombre. */
export function ordenDelPie(
  a: { hoyos: number; status: EstadoFueraDelRanking; name: string },
  b: { hoyos: number; status: EstadoFueraDelRanking; name: string },
): number {
  return b.hoyos - a.hoyos
    || (a.status === b.status ? 0 : a.status === 'withdrawn' ? -1 : 1)
    || a.name.localeCompare(b.name, 'es')
}

/**
 * Estado de un EQUIPO de foursome según sus miembros: con cualquier DQ, DQ; con
 * algún WD, WD; si no, `null` (compite). Regla 22: sin los dos compañeros el
 * bando no puede seguir alternando.
 */
export function estadoDelEquipoFoursome(
  miembros: ReadonlyArray<string>,
  porTarjeta: ReadonlyMap<string, InscritoFuera>,
): EstadoFueraDelRanking | null {
  const estados = miembros.map((id) => porTarjeta.get(id)?.status).filter(Boolean)
  if (estados.includes('disqualified')) return 'disqualified'
  if (estados.includes('withdrawn')) return 'withdrawn'
  return null
}

/**
 * Los golpes de un miembro de mejor bola que cuentan para el equipo: los del
 * descalificado, ninguno (en ningún hoyo); los del retirado, los que ya jugó
 * (Regla 23.4); los demás, todos.
 */
export function scoresQueCuentanEnMejorBola(
  scores: Record<string, number>,
  estado: EstadoFueraDelRanking | null | undefined,
): Record<string, number> {
  return estado === 'disqualified' ? {} : scores
}

/** Sigla que se muestra de cada estado (pie, marca en la fila del equipo). */
export const SIGLA_FUERA: Readonly<Record<EstadoFueraDelRanking, 'WD' | 'DQ'>> = {
  withdrawn: 'WD',
  disqualified: 'DQ',
}

/**
 * Nombre de un miembro de un equipo que SIGUE rankeado (scramble, mejor bola) con
 * su marca si se retiró o fue descalificado: "Pedro Pérez · WD". Texto, no color
 * (decisión de Juanjo, 17-nov). Espacios duros: en una columna angosta la marca
 * nunca queda sola en otra línea, separada del nombre.
 */
export function nombreConMarca(nombre: string, estado: EstadoFueraDelRanking | null | undefined): string {
  return estado ? `${nombre}\u00a0·\u00a0${SIGLA_FUERA[estado]}` : nombre
}

const hoyoAnotado = (scores: Readonly<Record<string, number>>, hoyo: string) => {
  const g = scores[hoyo]
  return typeof g === 'number' && g > 0
}

/**
 * Mejor bola (decisión de Juanjo, 17-nov; Reglas 3.3c, 23.2b y 23.4):
 * - Con un DQ: sus golpes no cuentan, y si con eso queda algún hoyo anotado sin el
 *   score de un compañero NO descalificado, el equipo entero queda DQ. Si el
 *   compañero aún no anota nada (el DQ fue antes de salir), el equipo sigue: el
 *   compañero puede jugar solo (R23.4).
 * - Sin ningún miembro compitiendo (y sin hoyos del DQ sin cubrir), el equipo va al pie: DQ si
 *   todos son DQ; si no, WD.
 * - Un WD con compañero compitiendo no cambia nada (R23.4).
 * `miembros`: las tarjetas con sus golpes CRUDOS (antes de quitar los del DQ).
 */
export function estadoDelEquipoMejorBola(
  miembros: ReadonlyArray<{ id: string; scores: Readonly<Record<string, number>> }>,
  porTarjeta: ReadonlyMap<string, InscritoFuera>,
): EstadoFueraDelRanking | null {
  if (!miembros.some((m) => porTarjeta.has(m.id))) return null
  const esDq = (id: string) => porTarjeta.get(id)?.status === 'disqualified'
  const validos = miembros.filter((m) => !esDq(m.id))
  const cubiertos = new Set(validos.flatMap((m) => Object.keys(m.scores).filter((h) => hoyoAnotado(m.scores, h))))
  // Un hoyo que solo anotó un DQ deja al bando sin score en ese hoyo → DQ, aunque además haya un WD.
  const dqConHoyoSinCubrir = miembros.some(
    (m) => esDq(m.id) && Object.keys(m.scores).some((h) => hoyoAnotado(m.scores, h) && !cubiertos.has(h)),
  )
  if (dqConHoyoSinCubrir) return 'disqualified'
  const activos = miembros.filter((m) => !porTarjeta.has(m.id))
  if (activos.length === 0) return miembros.every((m) => esDq(m.id)) ? 'disqualified' : 'withdrawn'
  return null
}
