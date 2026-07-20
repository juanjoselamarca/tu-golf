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
