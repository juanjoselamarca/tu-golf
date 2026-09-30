import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { getTestUserId } from './ronda-fixture'

/**
 * Barrido de basura de tests en prod (red de seguridad de los fixtures).
 *
 * Por qué existe (30-sep-2026): el `afterAll` de los tests de integración corría
 * con el hookTimeout default de vitest (10 s). Con la DB lenta, los DELETE del
 * cleanup pasaban ese tiempo, vitest abortaba el hook y la ronda/torneo de
 * prueba quedaba viva — 61 torneos "E2E Equipos" y 121 rondas en curso en 15
 * días, visibles para usuarios reales en el feed público /en-vivo.
 *
 * Criterio CONSERVADOR (nunca toca datos que otro test o un humano usen):
 * - Sólo lo del usuario de test (E2E_TEST_USER_EMAIL).
 * - Sólo lo creado hace más de `olderThanMinutes` (default 60): nada de una
 *   corrida en curso.
 * - Torneos: nombre `E2E…` y status `in_progress` (el estado que crean los
 *   fixtures). Los torneos cerrados/históricos del usuario de test no se tocan.
 * - Rondas: estado `en_curso`, código que NO empieza con `E2E` (esos los maneja
 *   el smoke HTTP), y que no cuelguen de un grupo de un torneo que se queda.
 */

export interface SweepOptions {
  olderThanMinutes?: number
  dryRun?: boolean
}

export interface SweepResult {
  tournaments: number
  rondas: number
  errors: string[]
}

const BATCH = 100

function adminClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY')
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
}

function lotes<T>(xs: T[]): T[][] {
  const out: T[][] = []
  for (let i = 0; i < xs.length; i += BATCH) out.push(xs.slice(i, i + BATCH))
  return out
}

/** ids por páginas (PostgREST corta en 1.000 filas sin avisar). */
async function idsPaginados(
  consulta: (desde: number, hasta: number) => PromiseLike<{ data: { id: string }[] | null; error: { message: string } | null }>,
): Promise<string[]> {
  const ids: string[] = []
  for (let desde = 0; ; desde += 1000) {
    const { data, error } = await consulta(desde, desde + 999)
    if (error) throw new Error(error.message)
    ids.push(...(data ?? []).map((r) => r.id))
    if (!data || data.length < 1000) return ids
  }
}

export async function sweepE2ELeftovers(opts: SweepOptions = {}): Promise<SweepResult> {
  const olderThanMinutes = opts.olderThanMinutes ?? 60
  if (olderThanMinutes < 30) throw new Error('olderThanMinutes < 30 podría borrar datos de una corrida en curso')
  const admin = adminClient()
  const userId = await getTestUserId()
  const cutoff = new Date(Date.now() - olderThanMinutes * 60_000).toISOString()
  const errors: string[] = []

  // 1) Torneos de fixture viejos.
  const torneos = await idsPaginados((a, b) =>
    admin.from('tournaments').select('id')
      .eq('organizer_id', userId).ilike('name', 'E2E%').eq('status', 'in_progress').lt('created_at', cutoff)
      .order('id').range(a, b))

  // 2) Rondas en curso viejas del usuario de test (sin los códigos fijos del smoke).
  const candidatas = await idsPaginados((a, b) =>
    admin.from('rondas_libres').select('id')
      .eq('creador_id', userId).eq('estado', 'en_curso').lt('created_at', cutoff).not('codigo', 'like', 'E2E%')
      .order('id').range(a, b))

  // Una ronda que cuelga de un grupo de un torneo que NO se barre se queda
  // (tournament_groups.ronda_libre_id es NO ACTION: el DELETE fallaría igual).
  const torneosSet = new Set(torneos)
  const retenidas = new Set<string>()
  for (const lote of lotes(candidatas)) {
    const { data, error } = await admin.from('tournament_groups').select('ronda_libre_id, tournament_id').in('ronda_libre_id', lote)
    if (error) throw new Error(error.message)
    for (const g of data ?? []) if (!torneosSet.has(g.tournament_id as string)) retenidas.add(g.ronda_libre_id as string)
  }
  const rondas = candidatas.filter((id) => !retenidas.has(id))

  if (opts.dryRun) return { tournaments: torneos.length, rondas: rondas.length, errors }

  // 3) Grupos de los torneos barridos (cascade: tournament_group_players), así
  //    las rondas quedan libres de la FK NO ACTION.
  for (const lote of lotes(torneos)) {
    const { error } = await admin.from('tournament_groups').delete().in('tournament_id', lote)
    if (error) errors.push(`tournament_groups: ${error.message}`)
  }
  // 4) Rondas (cascade: jugadores, equipos, membresía, pairings).
  let rondasBorradas = 0
  for (const lote of lotes(rondas)) {
    const { data, error } = await admin.from('rondas_libres').delete().in('id', lote).select('id')
    if (error) errors.push(`rondas_libres: ${error.message}`)
    rondasBorradas += data?.length ?? 0
  }
  // 5) Torneos (cascade: categorías, jugadores, rondas del torneo, premios…).
  let torneosBorrados = 0
  for (const lote of lotes(torneos)) {
    const { data, error } = await admin.from('tournaments').delete().in('id', lote).select('id')
    if (error) errors.push(`tournaments: ${error.message}`)
    torneosBorrados += data?.length ?? 0
  }

  return { tournaments: torneosBorrados, rondas: rondasBorradas, errors }
}
