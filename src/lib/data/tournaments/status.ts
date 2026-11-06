import type { TournamentStatus } from '@/lib/supabase'

/**
 * Estados de un torneo, en el orden de su ciclo de vida. Fuente única en runtime: el tipo
 * `TournamentStatus` no existe al ejecutar, y quien valida o lista estados (la API de admin, su
 * selector) necesita los valores. Son los mismos que acepta el CHECK `tournaments_status_check`;
 * `src/__tests__/api/admin-tournaments-status.test.ts` los compara con `supabase/schema.sql`,
 * así que un estado nuevo en la base obliga a sumarlo acá.
 */
export const TOURNAMENT_STATUSES = [
  'draft',
  'open',
  'in_progress',
  'closed',
  'published',
] as const satisfies readonly TournamentStatus[]
