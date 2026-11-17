/**
 * Etiqueta legible del estado de un torneo — FUENTE ÚNICA.
 *
 * Por qué existe: el 20-jul-2026 había dos definiciones contradictorias del
 * mismo concepto:
 *  - `torneo/[slug]/layout.tsx` (preview del link compartido) comparaba contra
 *    'finished' y 'active', DOS STATUS QUE NO EXISTEN en la base. Resultado:
 *    todo torneo — incluido un borrador — se anunciaba como "Inscripciones
 *    abiertas" en el preview de WhatsApp.
 *  - `organizador/[slug]/jugadores/JugadoresPanel.tsx` usaba los status reales.
 *
 * Los status reales de `tournaments.status` son: draft | open | in_progress |
 * closed | published. `torneoEnVivo()` (tournament-live-status.ts) todavía
 * acepta 'active' como sinónimo histórico de 'in_progress' para no esconder
 * datos viejos; acá NO lo replicamos como caso aparte: cae al mismo label.
 *
 * Ver [[feedback_un_concepto_una_fuente]].
 */

import { estadoDelTorneo, torneoAceptaScores, type EstadoDelTorneo, type TorneoConFechas } from './tournament-live-status'

/** Audiencia del label: el jugador y el organizador no leen lo mismo. */
export type StatusAudience = 'player' | 'organizer'

/**
 * Tono cromático del badge de estado. Vive acá y no en cada componente porque
 * es el MISMO concepto que el label: si `closed` es rojo en un lado y ámbar en
 * otro, el jugador aprende dos idiomas para la misma cosa.
 */
export type StatusTone = 'neutral' | 'live' | 'open' | 'closed'

/** Tokens CSS del tono. Definidos en globals.css (light + dark), nunca hex
 *  inline — si no, el badge no sigue el modo color del sistema. */
const TONE_VARS: Record<StatusTone, { bg: string; fg: string }> = {
  neutral: { bg: 'var(--status-draft-bg)', fg: 'var(--status-draft-fg)' },
  live: { bg: 'var(--status-live-bg)', fg: 'var(--status-live-fg)' },
  open: { bg: 'var(--status-open-bg)', fg: 'var(--status-open-fg)' },
  closed: { bg: 'var(--status-closed-bg)', fg: 'var(--status-closed-fg)' },
}

const TONO_DEL_ESTADO: Record<EstadoDelTorneo, StatusTone> = {
  borrador: 'neutral',
  por_jugar: 'open',
  en_curso: 'live',
  finalizado: 'closed',
  vencido: 'neutral',
}

/**
 * Dónde se muestra el badge: en las listas, un torneo cerrado por fecha dice
 * "Finalizado"; en la ficha del torneo (`/torneo/[slug]` y su en-vivo) el jugador lee
 * "Resultados provisorios" mientras el organizador no lo cierre (copy de Juanjo, 17-nov).
 */
export type VistaDelBadge = 'lista' | 'ficha'

/**
 * Label del estado.
 * - Fecha pasada sin cierre escrito (in_progress): jugador "Finalizado" (lista) o
 *   "Resultados provisorios" (ficha); organizador "Por cerrar" — solo ahí, porque
 *   `closeTournamentAction` solo cierra un torneo in_progress.
 * - `open` vencido (nunca se inició): jugador "Sin iniciar", organizador "Fecha vencida".
 */
function labelDelEstado(estado: EstadoDelTorneo, status: string, audience: StatusAudience, vista: VistaDelBadge): string {
  const escritoCerrado = status === 'closed' || status === 'published' || status === 'finished'
  if (audience === 'organizer') {
    switch (estado) {
      case 'borrador': return 'Borrador'
      case 'por_jugar': return status === 'open' ? 'Inscripciones abiertas' : 'Por jugar'
      case 'en_curso': return 'En curso'
      case 'finalizado': return status === 'published' ? 'Publicado' : escritoCerrado ? 'Cerrado' : 'Por cerrar'
      case 'vencido': return 'Fecha vencida'
    }
  }
  switch (estado) {
    case 'borrador': return status === 'draft' ? 'Inscripciones aún no abiertas' : 'Torneo'
    case 'por_jugar': return status === 'open' ? 'Inscripciones abiertas' : 'Por jugar'
    case 'en_curso': return 'En vivo'
    case 'finalizado': return escritoCerrado || vista === 'lista' ? 'Finalizado' : 'Resultados provisorios'
    case 'vencido': return 'Sin iniciar'
  }
}

/**
 * Badge del torneo (label + colores) — lo que MUESTRAN las pantallas. Usa
 * `estadoDelTorneo` (status + fechas + cierre automático), nunca el status crudo:
 * un torneo de abril que nadie cerró no puede decir "En vivo".
 */
export function badgeDelTorneo(
  torneo: TorneoConFechas,
  ahora: Date,
  audience: StatusAudience = 'player',
  vista: VistaDelBadge = 'lista',
): { label: string; bg: string; fg: string; tone: StatusTone; estado: EstadoDelTorneo } {
  const estado = estadoDelTorneo(torneo, ahora)
  const tone = TONO_DEL_ESTADO[estado]
  return { label: labelDelEstado(estado, torneo.status ?? '', audience, vista), ...TONE_VARS[tone], tone, estado }
}

/**
 * Badge del status ESCRITO, sin fechas. Solo para las pantallas operativas del
 * organizador (panel de jugadores y de scoring): ahí el badge tiene que coincidir con
 * lo que el servidor acepta (`torneoAceptaScores`) y con los botones de cerrar/reabrir.
 * Cualquier otra pantalla usa `badgeDelTorneo`.
 */
export function badgeDelStatusEscrito(
  status: string | null | undefined,
  audience: StatusAudience = 'player',
): { label: string; bg: string; fg: string; tone: StatusTone } {
  return badgeDelTorneo({ status, date_start: null }, new Date(0), audience)
}

// Estados en que se anotan golpes: la fuente vive en tournament-live-status.ts (estadoDelTorneo la usa y este
// archivo importa de allá; definirla acá crearía un ciclo). Se re-exporta para los que ya la importan de aquí.
export { TORNEO_ACEPTA_SCORES_STATUSES, torneoAceptaScores } from './tournament-live-status'

/**
 * Por qué un torneo NO acepta scores, para decírselo al jugador ANTES de que anote: `null` = sí los acepta.
 * 'no_empezo' = borrador o inscripciones abiertas (el organizador todavía no lo inicia); 'cerrado' = cualquier
 * otro (cerrado, publicado o un status desconocido: no se afirma que va a empezar).
 * Antes el scorer dejaba escribir en un torneo con inscripciones abiertas, `/api/game` respondía 409 y el
 * aviso decía "Torneo cerrado — ya no acepta scores" sobre un torneo que faltaban dos meses para jugar.
 */
export type MotivoSinScores = 'no_empezo' | 'cerrado'

/** Torneo que todavía no empezó (borrador o inscripciones abiertas): el único que el organizador puede iniciar. */
export const TORNEO_SIN_EMPEZAR_STATUSES = ['draft', 'open'] as const

export function torneoSinEmpezar(status: string | null | undefined): boolean {
  return !!status && (TORNEO_SIN_EMPEZAR_STATUSES as readonly string[]).includes(status)
}

export function motivoSinScores(status: string | null | undefined): MotivoSinScores | null {
  if (torneoAceptaScores(status)) return null
  return torneoSinEmpezar(status) ? 'no_empezo' : 'cerrado'
}

/** Estados del JUGADOR (`players.status`) que lo dejan fuera del torneo: no anota ni aparece en la tabla. */
export const JUGADOR_FUERA_STATUSES = ['withdrawn', 'disqualified'] as const

export function jugadorFueraDelTorneo(status: string | null | undefined): boolean {
  return !!status && (JUGADOR_FUERA_STATUSES as readonly string[]).includes(status)
}

/**
 * ¿El inscrito está aprobado? Sólo los aprobados cuentan para iniciar, se arman
 * en grupos y juegan; `pending` y `waitlist` todavía no están dentro.
 */
export function inscritoAprobado(status: string | null | undefined): boolean {
  return status === 'approved'
}

/**
 * Cantidad de jugadores de un torneo — FUENTE ÚNICA de lo que muestran las pantallas:
 * los inscritos aprobados (los que ocupan cupo, se arman en grupos y juegan). Antes
 * la lista del organizador contaba también retirados, pendientes y lista de espera, el
 * panel contaba aprobados y Mi Golf mostraba 0 fijo: tres números para el mismo torneo.
 */
export function contarInscritos(jugadores: ReadonlyArray<{ status: string | null | undefined }> | null | undefined): number {
  return (jugadores ?? []).filter((j) => inscritoAprobado(j.status)).length
}

/**
 * ¿Se le ofrece al visor "Anotar mi score"? Inscrito, no retirado/descalificado, torneo en curso según el status
 * escrito (lo que acepta `/api/game`), no demo (los demo son solo para mirar) y que la pantalla no lo muestre
 * finalizado: anotar tarde se ofrece dentro de los 2 días de gracia; pasada la gracia el torneo se ve
 * "Resultados provisorios" y el botón desaparece (el organizador sigue pudiendo cargar desde su panel).
 */
export function visorPuedeAnotar(
  inscripcion: { status: string | null } | null,
  torneo: TorneoConFechas & { es_demo?: boolean | null },
  ahora: Date,
): boolean {
  return !!inscripcion && !jugadorFueraDelTorneo(inscripcion.status) && torneoAceptaScores(torneo.status) && !torneo.es_demo &&
    estadoDelTorneo(torneo, ahora) !== 'finalizado'
}

/**
 * ¿Los grupos del torneo ya no se pueden rearmar? Desde el inicio cada grupo tiene su tarjeta
 * (`tournament_groups.ronda_libre_id`) y cada inscrito está enlazado a su fila
 * (`tournament_group_players.jugador_ronda_id`). Mover, sacar o borrar en ese punto rompe el enlace: el
 * board se arma desde las tarjetas de los grupos, así que un grupo borrado se lleva todos sus golpes (#810).
 *
 * Fijos = el torneo ya no está sin empezar, o algún grupo ya tiene tarjeta (cubre una pestaña abierta antes
 * del inicio que todavía lee "open"). Un status desconocido cuenta como fijo. Espejo en la base:
 * trigger `grupos_fijos_*` (migración 20261117120000).
 */
export function gruposFijos(
  status: string | null | undefined,
  grupos: ReadonlyArray<{ ronda_libre_id?: string | null }>,
): boolean {
  return !torneoSinEmpezar(status) || grupos.some((g) => g.ronda_libre_id != null)
}

/** Status escritos que aceptan auto-inscripción (self-service). Solo se usan dentro de `motivoNoInscribible`. */
const INSCRIBIBLE_STATUSES: readonly string[] = ['open']

/** Por qué un torneo no acepta inscripciones: 'borrador' (aún no abre), 'fecha_vencida' (open con la fecha pasada), 'cerrado'. */
export type MotivoNoInscribible = 'borrador' | 'fecha_vencida' | 'cerrado'

/**
 * FUENTE ÚNICA de "¿se puede inscribir?" — la usan la ficha (`/torneo/[slug]`), `/unirse`
 * (con y sin sesión) y el gate del servidor (`enrollPlayer`), para que el botón nunca
 * contradiga al backend. Status `open` Y el torneo todavía por jugar: un `open` cuya fecha
 * pasó hace más de la gracia ("Sin iniciar") ya no inscribe.
 */
export function motivoNoInscribible(t: TorneoConFechas, ahora: Date): MotivoNoInscribible | null {
  const status = t.status ?? ''
  if (!INSCRIBIBLE_STATUSES.includes(status)) return status === 'draft' ? 'borrador' : 'cerrado'
  return estadoDelTorneo(t, ahora) === 'por_jugar' ? null : 'fecha_vencida'
}

export function torneoInscribible(t: TorneoConFechas, ahora: Date): boolean {
  return motivoNoInscribible(t, ahora) === null
}
