// src/lib/data/tournaments/round-scope.ts
//
// ¿A qué torneo pertenece una tarjeta (`rounds`)?
//
// `/api/game` autoriza al organizador contra el `tournament_id` del body y
// después escribe sobre el `round_id` del body. Sin cruzar los dos, el
// organizador de CUALQUIER torneo podía cargar golpes o cerrar la tarjeta de
// un jugador de otro torneo (y el cierre dispara historial + recálculo del
// índice de ese jugador). Ésta es la pregunta que cierra ese hueco.
//
// Los errores se PROPAGAN: "la ronda no existe" y "no pude preguntar" no son
// lo mismo, y confundirlos rechazaría scores legítimos durante un torneo.

import type { SupabaseClient } from '@supabase/supabase-js'

/** `tournament_id` de la ronda, o null si la ronda no existe. Lanza si la consulta falla. */
export async function fetchTorneoDeLaRonda(
  svc: SupabaseClient,
  roundId: string,
): Promise<string | null> {
  const { data, error } = await svc
    .from('rounds')
    .select('tournament_id')
    .eq('id', roundId)
    .maybeSingle()
  if (error) throw error
  return (data as { tournament_id: string | null } | null)?.tournament_id ?? null
}
