/**
 * Un celular por equipo (scramble rápido, plan docs/superpowers/plans/2026-11-23-scramble-rapido.md §2).
 *
 * FUENTE ÚNICA de quién anota qué equipo en una ronda de equipos: el scorer (qué equipos carga, si entra o elige
 * equipo) y el aviso a quienes siguen la ronda (quién puede dispararlo).
 *
 * Espejo de la base (migración 20261123100000_scramble_equipos_de_club):
 *  - `upsert_ronda_equipos_scores` deja escribir un equipo a `puede_anotar_ronda` (creador, marcador, jugadores) o
 *    al `anotador_user_id` de ESE equipo si es de club y la ronda no tiene `admin_mode` TRUE;
 *  - `reclamar_equipo_de_ronda` solo reclama en esas rondas.
 * El servidor no sabe qué equipos "tiene" cada celular: el creador podría escribir el equipo de otro celular. Que
 * nunca lo haga lo sostiene `equiposQueAnota`, aplicado UNA vez al cargar el scorer (todo lo que manda un delta
 * —par al pasar de hoyo, pendientes, hoyo inicial, copia local— parte de esa lista).
 */

import { isSharedBallFormat } from '@/golf/formats'
import { esEquipoDeClub, type HandicapOrigen } from './equipos-de-club'

/** Lo que estas reglas leen de la ronda. */
export interface RondaDeEquipos {
  formato_juego?: string | null
  admin_mode?: boolean | null
  creador_id?: string | null
  admin_user_id?: string | null
  ronda_libre_jugadores?: ReadonlyArray<{ user_id?: string | null }>
}

/** Lo que estas reglas leen de un equipo (`anotador_*` solo lo leen cuentas con sesión: anon no tiene el grant). */
export interface EquipoConAnotador {
  id: string
  handicap_origen?: HandicapOrigen | null
  anotador_user_id?: string | null
  anotador_nombre?: string | null
  /** Golpes del equipo por hoyo: dicen si el creador ya anota uno sin reclamar (`equiposQueConfirmanElHoyo`). */
  scores?: Readonly<Record<string, number | null | undefined>> | null
  /**
   * Cuándo el equipo terminó su tarjeta («Terminar mi equipo», RPC `terminar_equipo_de_ronda`). NULL = sigue jugando.
   * Solo lo leen cuentas con sesión (anon no tiene el grant).
   */
  terminado_at?: string | null
}

/**
 * ¿Cada equipo se anota en su celular? Bola compartida, sin `admin_mode` (SQL: `admin_mode IS NOT TRUE`) y algún
 * equipo de club. Toda ronda de equipos de antes tiene `admin_mode` TRUE: ninguna cae acá.
 */
export function unCelularPorEquipo(
  ronda: Pick<RondaDeEquipos, 'formato_juego' | 'admin_mode'>,
  equipos: ReadonlyArray<Pick<EquipoConAnotador, 'handicap_origen'>>,
): boolean {
  return isSharedBallFormat(ronda.formato_juego) && ronda.admin_mode !== true && equipos.some(esEquipoDeClub)
}

/**
 * Equipos sin reclamar que el creador tomó a mano en ESTE celular («Anotarlo yo» o «Liberar» en la franja). Los
 * guarda el teléfono (`@/lib/ronda/equipos-tomados`): la base admite un solo equipo reclamado por cuenta.
 */
export type EquiposTomadosAMano = ReadonlySet<string>

const NINGUNO_TOMADO: EquiposTomadosAMano = new Set()

/**
 * ¿El creador anota este equipo sin reclamar? Solo si ya tiene golpes (lo está anotando: lo liberó cuando se apagó
 * el otro celular, o lo dejó su anotador) o si lo tomó a mano. Uno sin reclamar y sin golpes es de un equipo que
 * todavía no abre su link: queda en la franja con «Anotarlo yo», no como tarjeta (salvo que el creador no tenga
 * ningún equipo reclamado: entonces anota los libres, como antes). Juanjo, 26-nov: «está mal que yo
 * pueda anotar el score del otro equipo si puse que cada uno lleva su team»; que exista la forma, pero discreta.
 */
function loAnotaElCreador(e: EquipoConAnotador, tomados: EquiposTomadosAMano): boolean {
  return e.anotador_user_id == null && (tieneGolpes(e) || tomados.has(e.id))
}

/** El creador sin ningún equipo reclamado (liberó el suyo): nunca queda con la pantalla vacía; ve los libres. */
function creadorSinEquipo(equipos: readonly EquipoConAnotador[], creadorId: string): boolean {
  return !equipos.some(o => o.anotador_user_id === creadorId)
}

/**
 * Los equipos que anota ESTE celular. Ronda de un celular: todos (como siempre). Un celular por equipo: el que
 * reclamó y, si es el creador, los sin reclamar que ya anota (`loAnotaElCreador`). Sin sesión: ninguno.
 */
export function equiposQueAnota<E extends EquipoConAnotador>(
  ronda: Pick<RondaDeEquipos, 'formato_juego' | 'admin_mode' | 'creador_id'>,
  equipos: readonly E[],
  userId: string | null | undefined,
  tomados: EquiposTomadosAMano = NINGUNO_TOMADO,
): E[] {
  if (!unCelularPorEquipo(ronda, equipos)) return [...equipos]
  if (!userId) return []
  const esCreador = ronda.creador_id === userId
  const libresTodos = esCreador && creadorSinEquipo(equipos, userId)
  return equipos.filter(e => e.anotador_user_id === userId
    || (esCreador && (loAnotaElCreador(e, tomados) || (libresTodos && e.anotador_user_id == null))))
}

/** Los equipos que anota OTRO celular o nadie todavía (la franja). Complemento exacto de `equiposQueAnota`. */
export function equiposDeOtroCelular<E extends EquipoConAnotador>(
  ronda: Pick<RondaDeEquipos, 'formato_juego' | 'admin_mode' | 'creador_id'>,
  equipos: readonly E[],
  userId: string | null | undefined,
  tomados: EquiposTomadosAMano = NINGUNO_TOMADO,
): E[] {
  const mios = new Set(equiposQueAnota(ronda, equipos, userId, tomados).map(e => e.id))
  return equipos.filter(e => !mios.has(e.id))
}

/**
 * Los equipos a los que ESTE celular les rellena con par los hoyos vacíos al CERRAR la ronda (hoyos que la pantalla
 * pudo no mostrar nunca). Ronda de un celular: todos, como siempre. Un celular por equipo: solo el que reclamó
 * (`anotador_user_id === userId`). Un equipo sin reclamar lo ve y lo edita a mano el creador, pero el par no se
 * inventa: sería un par falso en el servidor y en la tabla en vivo para un equipo que todavía no abre el link
 * (revisión Fable PR4, P1-a). El valor del hoyo EN PANTALLA es otra regla: `equiposQueConfirmanElHoyo`.
 */
export function equiposConParAutomatico<E extends EquipoConAnotador>(
  ronda: Pick<RondaDeEquipos, 'formato_juego' | 'admin_mode'>,
  equipos: readonly E[],
  userId: string | null | undefined,
): E[] {
  if (!unCelularPorEquipo(ronda, equipos)) return [...equipos]
  if (!userId) return []
  return equipos.filter(e => e.anotador_user_id === userId)
}

/**
 * Complemento exacto de `equiposConParAutomatico`: los de otro celular y los sin reclamar. Al cerrar, uno de estos
 * con hoyos sin golpes BLOQUEA el cierre (`equipoAjenoIncompleto`): no se rellena con par.
 */
export function equiposSinParAutomatico<E extends EquipoConAnotador>(
  ronda: Pick<RondaDeEquipos, 'formato_juego' | 'admin_mode'>,
  equipos: readonly E[],
  userId: string | null | undefined,
): E[] {
  const conPar = new Set(equiposConParAutomatico(ronda, equipos, userId).map(e => e.id))
  return equipos.filter(e => !conPar.has(e.id))
}

/** ¿El equipo tiene algún golpe anotado (en el servidor o en este teléfono)? */
function tieneGolpes(equipo: Pick<EquipoConAnotador, 'scores'>): boolean {
  return Object.values(equipo.scores ?? {}).some(v => v != null)
}

/**
 * FUENTE ÚNICA de «confirmar el valor que muestra el hoyo»: los equipos cuyo par gris (el hoyo sin golpes, en pantalla)
 * ESTE celular guarda al tocar «Siguiente» o «Terminar mi equipo». Ronda de un celular: todos. Un celular por equipo:
 *  - los de `equiposConParAutomatico` (el que reclamó);
 *  - el creador, además, uno sin reclamar que YA tiene golpes: lo está anotando él (lo liberó cuando se apagó el
 *    otro celular, o empezó a anotarlo a mano). Ensayo 24-nov: tras «Liberar», Siguiente no guardaba el par gris de
 *    ese equipo, que se veía anotado en pantalla y frenaba el cierre.
 *  - el creador, además, uno sin reclamar que tomó a mano («Anotarlo yo»): lo eligió anotar desde su celular.
 * Uno sin reclamar, sin ningún golpe y sin tomar no (P1-a: todavía no abre el link). Es `loAnotaElCreador`, la misma
 * regla que pone la tarjeta en pantalla (`equiposQueAnota`). Solo el hoyo en pantalla: los hoyos vacíos de un equipo
 * sin reclamar siguen frenando el cierre (`equiposSinParAutomatico`).
 */
export function equiposQueConfirmanElHoyo<E extends EquipoConAnotador>(
  ronda: Pick<RondaDeEquipos, 'formato_juego' | 'admin_mode' | 'creador_id'>,
  equipos: readonly E[],
  userId: string | null | undefined,
  tomados: EquiposTomadosAMano = NINGUNO_TOMADO,
): E[] {
  if (!unCelularPorEquipo(ronda, equipos)) return [...equipos]
  if (!userId) return []
  const esCreador = ronda.creador_id === userId
  return equipos.filter(e => e.anotador_user_id === userId || (esCreador && loAnotaElCreador(e, tomados)))
}

/** Complemento exacto de `equiposQueConfirmanElHoyo`: su par gris no se guarda solo (se anotan a mano). */
export function equiposQueNoConfirmanElHoyo<E extends EquipoConAnotador>(
  ronda: Pick<RondaDeEquipos, 'formato_juego' | 'admin_mode' | 'creador_id'>,
  equipos: readonly E[],
  userId: string | null | undefined,
  tomados: EquiposTomadosAMano = NINGUNO_TOMADO,
): E[] {
  const confirman = new Set(equiposQueConfirmanElHoyo(ronda, equipos, userId, tomados).map(e => e.id))
  return equipos.filter(e => !confirman.has(e.id))
}

/** ¿El equipo ya terminó su tarjeta? Sus golpes no cambian (trigger) hasta que se reabre. */
export function equipoTerminado(equipo: Pick<EquipoConAnotador, 'terminado_at'>): boolean {
  return equipo.terminado_at != null
}

/**
 * FUENTE ÚNICA de las tarjetas que carga el scorer y que «Terminar mi equipo» cierra: los equipos que anota ESTE celular
 * (`equiposQueAnota`: el que reclamó y, si es el creador, los sin reclamar que anota él) que todavía no terminaron. Uno
 * terminado no se carga: el servidor ya no acepta sus golpes, y corregirlo pasa por «Corregir mi tarjeta» (lo reabre).
 * Ronda de un celular: todos (ahí nadie termina un equipo).
 */
export function equiposPorTerminar<E extends EquipoConAnotador>(
  ronda: Pick<RondaDeEquipos, 'formato_juego' | 'admin_mode' | 'creador_id'>,
  equipos: readonly E[],
  userId: string | null | undefined,
  tomados: EquiposTomadosAMano = NINGUNO_TOMADO,
): E[] {
  const mios = equiposQueAnota(ronda, equipos, userId, tomados)
  if (!unCelularPorEquipo(ronda, equipos)) return mios
  return mios.filter(e => !equipoTerminado(e))
}

/**
 * Un celular por equipo: los equipos que esta cuenta anota y ya terminó, si TODOS los suyos terminaron (vacío si no
 * anota ninguno o si alguno sigue jugando). Con ronda en curso, quien los tiene ya no anota nada: el scorer lo manda a
 * la vista en vivo y ahí «Corregir mi tarjeta» reabre exactamente estos.
 */
export function equiposTerminadosDelCelular<E extends EquipoConAnotador>(
  ronda: Pick<RondaDeEquipos, 'formato_juego' | 'admin_mode' | 'creador_id'>,
  equipos: readonly E[],
  userId: string | null | undefined,
  tomados: EquiposTomadosAMano = NINGUNO_TOMADO,
): E[] {
  if (!unCelularPorEquipo(ronda, equipos)) return []
  const mios = equiposQueAnota(ronda, equipos, userId, tomados)
  return mios.length > 0 && mios.every(equipoTerminado) ? mios : []
}

/**
 * Un celular por equipo: los equipos de la ronda que todavía no terminaron su tarjeta (la base cierra la ronda sola con
 * el último). A diferencia de `equiposPorTerminar` (los de ESTE celular), mira la ronda entera: es lo que la vista en
 * vivo nombra como «Falta que termine». Ronda de un celular: ninguno (ahí nadie termina un equipo).
 */
export function equiposSinTerminar<E extends EquipoConAnotador>(
  ronda: Pick<RondaDeEquipos, 'formato_juego' | 'admin_mode'>,
  equipos: readonly E[],
): E[] {
  if (!unCelularPorEquipo(ronda, equipos)) return []
  return equipos.filter(e => !equipoTerminado(e))
}

/**
 * Equipos que nadie anota desde su celular y siguen jugando: los que se pueden reclamar en «Elige tu equipo». Uno sin
 * anotador ya terminado (lo terminó el creador) no se ofrece: reclamarlo dejaría a otra cuenta reabrir esa tarjeta.
 */
export function equiposLibres<E extends EquipoConAnotador>(equipos: readonly E[]): E[] {
  return equipos.filter(e => e.anotador_user_id == null && !equipoTerminado(e))
}

/**
 * Equipos que ya anota alguien desde su celular. Junto con `equiposLibres` son todos, salvo los sin anotador ya
 * terminados (no se reclaman ni los anota otro celular).
 */
export function equiposTomados<E extends EquipoConAnotador>(equipos: readonly E[]): E[] {
  return equipos.filter(e => e.anotador_user_id != null)
}

/**
 * ¿La ronda en vivo ofrece «Anotar mi equipo» a esta cuenta? A quien ya anota uno (vuelve a su scorer) o si queda
 * alguno libre para reclamar (`equiposLibres`: no los terminados). Con todos tomados por otros, el botón solo llevaría
 * a «Ya tienen quién los anote». «Corregir mi tarjeta» lo decide `equiposTerminadosDelCelular`, no esta función.
 */
export function ofreceAnotarMiEquipo(
  equipos: readonly EquipoConAnotador[],
  userId: string | null | undefined,
): boolean {
  if (!userId) return false
  return equipos.some(e => e.anotador_user_id === userId) || equiposLibres(equipos).length > 0
}

/** Nombre con que se muestra quién anota un equipo. Sin nombre (cuenta sin nombre o borrada): «otro celular». */
export function nombreDelAnotador(equipo: Pick<EquipoConAnotador, 'anotador_nombre'>): string {
  return equipo.anotador_nombre?.trim() || 'otro celular'
}

/**
 * Quién anota un equipo de otro celular, para la franja «lo anota …». Uno sin reclamar lo anota el creador desde su
 * celular: se muestra su nombre (`nombreDelCreador`), no «otro celular». Uno reclamado: `nombreDelAnotador`.
 */
export function nombreDeQuienAnota(
  equipo: Pick<EquipoConAnotador, 'anotador_user_id' | 'anotador_nombre'>,
  nombreCreador: string | null,
): string {
  if (equipo.anotador_user_id == null) return nombreCreador ?? 'quien creó la ronda'
  return nombreDelAnotador(equipo)
}

/**
 * ¿Este celular libera equipos de otro celular? Un celular por equipo: solo el creador (la base rechaza liberar a quien
 * no lo anota). Ahí nadie «finaliza»: cada celular termina su equipo y la base cierra la ronda sola con el último
 * (`terminar_equipo_de_ronda`). Ronda de un celular: `true` (no hay equipos de otro celular; nada que liberar).
 */
export function liberaEquipos(
  ronda: Pick<RondaDeEquipos, 'formato_juego' | 'admin_mode' | 'creador_id'>,
  equipos: ReadonlyArray<Pick<EquipoConAnotador, 'handicap_origen'>>,
  userId: string | null | undefined,
): boolean {
  if (!unCelularPorEquipo(ronda, equipos)) return true
  return !!userId && ronda.creador_id === userId
}

/** Nombre de quien creó la ronda (es jugador del equipo 1). `null` si no está entre los jugadores o no tiene nombre. */
export function nombreDelCreador(
  ronda: Pick<RondaDeEquipos, 'creador_id'> & { ronda_libre_jugadores?: ReadonlyArray<{ user_id?: string | null; nombre?: string | null }> },
): string | null {
  if (!ronda.creador_id) return null
  return ronda.ronda_libre_jugadores?.find(j => j.user_id === ronda.creador_id)?.nombre?.trim() || null
}

/**
 * ¿Puede anotar (y cerrar) la ronda sin ser jugador de ella? El creador o el marcador designado
 * (`admin_user_id`): la mitad de `puede_anotar_ronda` que no mira `ronda_libre_jugadores`. Por eso, si a esa
 * cuenta la sacan de la ronda (borrado del torneo o retiro), sigue a cargo del scorer.
 */
export function anotaSinSerJugador(
  ronda: Pick<RondaDeEquipos, 'creador_id' | 'admin_user_id'>,
  userId: string | null | undefined,
): boolean {
  return !!userId && (ronda.creador_id === userId || ronda.admin_user_id === userId)
}

/** Qué hace el scorer de equipos con quien lo abre. */
export type EntradaAlScorerDeEquipos = 'anota' | 'elegir_equipo' | 'en_vivo'

/**
 * ¿Quién entra al scorer de una ronda de equipos? Mismo criterio que la base, para no mostrar una tarjeta que el
 * servidor va a rechazar:
 *  - un celular por equipo: quien ya terminó todos los equipos que anota, a la ronda en vivo (`equiposTerminadosDelCelular`;
 *    ahí «Corregir mi tarjeta» los reabre); si no, el creador siempre (libera equipos); quien ya anota un equipo, a su
 *    equipo; cualquier otra cuenta, a elegir equipo (el reclamo decide si queda alguno);
 *  - un celular: `puede_anotar_ronda` (creador, marcador designado o jugador con cuenta). El resto va a la ronda
 *    en vivo. Antes, con `admin_mode`, cualquier cuenta con el link veía el scorer y solo la RPC la rechazaba.
 */
export function entradaAlScorerDeEquipos(
  ronda: RondaDeEquipos,
  equipos: readonly EquipoConAnotador[],
  userId: string | null | undefined,
  tomados: EquiposTomadosAMano = NINGUNO_TOMADO,
): EntradaAlScorerDeEquipos {
  if (!userId) return 'en_vivo'
  if (unCelularPorEquipo(ronda, equipos)) {
    if (equiposTerminadosDelCelular(ronda, equipos, userId, tomados).length > 0) return 'en_vivo'
    if (ronda.creador_id === userId) return 'anota'
    return equiposQueAnota(ronda, equipos, userId).length > 0 ? 'anota' : 'elegir_equipo'
  }
  const anota = anotaSinSerJugador(ronda, userId)
    || (ronda.ronda_libre_jugadores ?? []).some(j => j.user_id === userId)
  return anota ? 'anota' : 'en_vivo'
}

/**
 * Cuentas que anotan un equipo desde su celular y por eso pueden escribirlo (la rama del anotador en
 * `upsert_ronda_equipos_scores`). Las usa el aviso a quienes siguen la ronda: guardar sin poder avisar dejaba la
 * tabla de los espectadores quieta. Vacío en cualquier ronda que no sea de un celular por equipo.
 */
export function anotadoresDeEquipos(
  ronda: Pick<RondaDeEquipos, 'formato_juego' | 'admin_mode'>,
  equipos: readonly EquipoConAnotador[],
): string[] {
  if (!unCelularPorEquipo(ronda, equipos)) return []
  return equipos.filter(e => esEquipoDeClub(e) && !!e.anotador_user_id).map(e => e.anotador_user_id as string)
}

/**
 * Equipo sin par automático (de otro celular o sin reclamar) al que le faltan hoyos: el primero que bloquea el cierre y el hoyo en que va (el primero
 * sin golpes, en el orden de la ronda). `null` = todos completos.
 */
export function equipoAjenoIncompleto<E extends EquipoConAnotador & { nombre: string; scores: Record<string, number> }>(
  ajenos: readonly E[],
  hoyos: readonly number[],
): { equipo: E; hoyo: number } | null {
  for (const e of ajenos) {
    const hoyo = hoyos.find(h => e.scores[String(h)] == null)
    if (hoyo != null) return { equipo: e, hoyo }
  }
  return null
}

/** Nombre del anotador cuando no hay ninguno que mostrar. */
export const NOMBRE_ANOTADOR_GENERICO = 'Anotador'

/**
 * Nombre con que el scorer de equipos muestra a quien anota en ESTE celular (encabezado). Nunca el correo (ensayo
 * 24-nov: salía «ensayo-ross-17955…»): su nombre de jugador en la ronda → el de su perfil (`anotador_nombre` del
 * equipo que reclamó, que la base copia de profiles.name, o el perfil leído) → «Anotador».
 * El alta sin nombre deja `profiles.name` = la parte local del correo (`handle_new_user`): en las fuentes que vienen del
 * perfil ese candidato se descarta como si no hubiera nombre (el nombre en la ronda lo tecleó alguien: «Max» con
 * max@… es legítimo). Un candidato con «@» se descarta en todas.
 */
export function nombreDelAnotadorDelCelular(input: {
  jugadores: ReadonlyArray<{ user_id?: string | null; nombre?: string | null }>
  equipos: ReadonlyArray<Pick<EquipoConAnotador, 'anotador_user_id' | 'anotador_nombre'>>
  userId: string | null | undefined
  nombreDePerfil?: string | null
  email?: string | null
}): string {
  const { jugadores, equipos, userId } = input
  if (!userId) return NOMBRE_ANOTADOR_GENERICO
  const parteLocal = input.email?.split('@')[0]?.trim().toLowerCase() || null
  const valido = (n: string | null | undefined, delPerfil: boolean): string | null => {
    const t = n?.trim()
    if (!t || t.includes('@') || (delPerfil && parteLocal && t.toLowerCase() === parteLocal)) return null
    return t
  }
  return valido(jugadores.find(j => j.user_id === userId)?.nombre, false)
    ?? valido(equipos.find(e => e.anotador_user_id === userId)?.anotador_nombre, true)
    ?? valido(input.nombreDePerfil, true)
    ?? NOMBRE_ANOTADOR_GENERICO
}
