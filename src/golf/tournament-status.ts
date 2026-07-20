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

/** Audiencia del label: el jugador y el organizador no leen lo mismo. */
export type StatusAudience = 'player' | 'organizer'

const PLAYER_LABELS: Record<string, string> = {
  draft: 'Inscripciones aún no abiertas',
  open: 'Inscripciones abiertas',
  in_progress: 'En vivo',
  active: 'En vivo',
  closed: 'Finalizado',
  published: 'Finalizado',
}

const ORGANIZER_LABELS: Record<string, string> = {
  draft: 'Borrador',
  open: 'Inscripciones abiertas',
  in_progress: 'En curso',
  active: 'En curso',
  closed: 'Cerrado',
  published: 'Publicado',
}

/**
 * Nunca inventa: un status desconocido devuelve el fallback neutro en vez de
 * afirmar algo falso. Anunciar "Inscripciones abiertas" sobre un torneo que no
 * las tiene abiertas es peor que no decir nada (CERO FALLOS).
 */
export function tournamentStatusLabel(
  status: string | null | undefined,
  audience: StatusAudience = 'player',
): string {
  const table = audience === 'organizer' ? ORGANIZER_LABELS : PLAYER_LABELS
  if (!status) return audience === 'organizer' ? 'Borrador' : 'Torneo'
  return table[status] ?? (audience === 'organizer' ? 'Borrador' : 'Torneo')
}

/**
 * Tono cromático del badge de estado. Vive acá y no en cada componente porque
 * es el MISMO concepto que el label: si `closed` es rojo en un lado y ámbar en
 * otro, el jugador aprende dos idiomas para la misma cosa.
 */
export type StatusTone = 'neutral' | 'live' | 'open' | 'closed'

const TONES: Record<string, StatusTone> = {
  draft: 'neutral',
  open: 'open',
  in_progress: 'live',
  active: 'live',
  closed: 'closed',
  published: 'closed',
}

export function tournamentStatusTone(status: string | null | undefined): StatusTone {
  if (!status) return 'neutral'
  return TONES[status] ?? 'neutral'
}

/** Tokens CSS del tono. Definidos en globals.css (light + dark), nunca hex
 *  inline — si no, el badge no sigue el modo color del sistema. */
const TONE_VARS: Record<StatusTone, { bg: string; fg: string }> = {
  neutral: { bg: 'var(--status-draft-bg)', fg: 'var(--status-draft-fg)' },
  live: { bg: 'var(--status-live-bg)', fg: 'var(--status-live-fg)' },
  open: { bg: 'var(--status-open-bg)', fg: 'var(--status-open-fg)' },
  closed: { bg: 'var(--status-closed-bg)', fg: 'var(--status-closed-fg)' },
}

/** Badge completo (label + colores) desde una sola llamada. */
export function tournamentStatusBadge(
  status: string | null | undefined,
  audience: StatusAudience = 'player',
): { label: string; bg: string; fg: string } {
  return { label: tournamentStatusLabel(status, audience), ...TONE_VARS[tournamentStatusTone(status)] }
}
