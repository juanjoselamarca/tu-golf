/**
 * Telemetria centralizada para el flow "Organizar Campeonato" (tournament_drafts).
 *
 * Wrappea `trackEvent` (PostHog/analytics_events) con un mapa fijo de nombres
 * de evento. El objetivo es:
 *  - Evitar typos / duplicacion de nombres ("draft_created" vs "tournament_draft_created")
 *  - Concentrar el shape de props por evento para que el dashboard /admin/torneos-stats
 *    pueda consumirlos sin sorpresas
 *  - Aislar errores de telemetria del flow principal (un fallo nunca rompe la operacion)
 */

import type { SupabaseClient } from '@supabase/supabase-js'

export const DRAFT_EVENTS = {
  CREATED: 'tournament_draft_created',
  UPDATED: 'tournament_draft_updated',
  ASSISTANT_CALLED: 'tournament_draft_assistant_called',
  ABANDONED: 'tournament_draft_abandoned',
  COLLABORATOR_ADDED: 'tournament_draft_collaborator_added',
  PREVIEW_OPENED: 'tournament_draft_preview_opened',
  TOURNAMENT_CREATED: 'tournament_created_from_draft',
} as const

export type DraftEvent = typeof DRAFT_EVENTS[keyof typeof DRAFT_EVENTS]

interface BaseDraftProps {
  draft_id?: string
  schema_version?: number
}

export type DraftEventProps = BaseDraftProps & Record<string, unknown>

/**
 * Registra un evento del flow Organizar Campeonato.
 *
 * Cero throws: si `supabase` es null, si la red falla, o si `trackEvent` revienta,
 * nos limitamos a un `console.warn`. El flow no debe enterarse.
 */
export async function trackDraftEvent(
  supabase: SupabaseClient | null,
  userId: string,
  event: DraftEvent,
  props: DraftEventProps = {},
): Promise<void> {
  try {
    if (!supabase) return
    const { trackEvent } = await import('@/lib/analytics')
    await trackEvent(supabase, userId, event, props)
  } catch (e) {
    // No queremos que un fallo de telemetria rompa el flow principal.
    console.warn('[draft-telemetry] failed', event, e)
  }
}

