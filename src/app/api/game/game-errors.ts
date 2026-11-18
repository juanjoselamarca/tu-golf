// Utilidades compartidas por las acciones de /api/game.

import type { SupabaseClient } from '@supabase/supabase-js'
import { captureError } from '@/lib/error-tracking'

export function captureGameError(action: string, error: unknown, extra?: Record<string, unknown>) {
  void captureError(error, {
    context: `game-engine.${action}`,
    level: 'error',
    meta: extra,
  })
}

export type Svc = SupabaseClient
