import { adminClient, getTestUserId } from './ronda-fixture'

/**
 * Barrido de basura de tests en prod (red de seguridad de los fixtures).
 *
 * Por qué existe (30-sep-2026): el `afterAll` de los tests de integración corría
 * con el hookTimeout default de vitest (10 s). Con la DB lenta, los DELETE del
 * cleanup pasaban ese tiempo, vitest abortaba el hook y la ronda/torneo de
 * prueba quedaba viva — 79 torneos "E2E Equipos" y 120 rondas en curso en 15
 * días, visibles para usuarios reales en el feed público /en-vivo.
 *
 * Criterio CONSERVADOR (nunca toca datos que otro test o un humano usen):
 * - Sólo lo del usuario de test (E2E_TEST_USER_EMAIL).
 * - Sólo lo creado hace más de `olderThanMinutes` (default 60, piso 45): nada
 *   de una corrida en curso. INVARIANTE: el piso tiene que superar el
 *   `timeout-minutes` más largo de cualquier workflow que cree fixtures con el
 *   usuario de test (hoy 30: e2e-auth-weekly e integracion).
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
/** Página por debajo del tope de PostgREST (db-max-rows 1.000): si el tope baja, igual no trunca. */
const PAGE = 500
const MIN_AGE_MINUTES = 45

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
  for (let desde = 0; ; desde += PAGE) {
    const { data, error } = await consulta(desde, desde + PAGE - 1)
    if (error) throw new Error(error.message)
    ids.push(...(data ?? []).map((r) => r.id))
    if (!data || data.length < PAGE) return ids
  }
}

export async function sweepE2ELeftovers(opts: SweepOptions = {}): Promise<SweepResult> {
  const olderThanMinutes = opts.olderThanMinutes ?? 60
  if (olderThanMinutes < MIN_AGE_MINUTES) {
    throw new Error(`olderThanMinutes < ${MIN_AGE_MINUTES} podría borrar datos de una corrida en curso`)
  }
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

  /**
   * Borra por lotes. Un DELETE es atómico: UNA fila bloqueada (FK NO ACTION,
   * p. ej. taiger_sessions) haría fallar el lote entero, y como los lotes se
   * arman ordenados, el mismo lote fallaría en cada corrida para siempre. Si
   * un lote falla, se reintenta fila por fila y se reportan sólo las que
   * bloquean.
   */
  const borrar = async (
    tabla: 'tournament_groups' | 'rondas_libres' | 'tournaments',
    columna: 'id' | 'tournament_id',
    ids: string[],
  ): Promise<number> => {
    let n = 0
    for (const lote of lotes(ids)) {
      const { data, error } = await admin.from(tabla).delete().in(columna, lote).select('id')
      if (!error) { n += data?.length ?? 0; continue }
      for (const id of lote) {
        const r = await admin.from(tabla).delete().eq(columna, id).select('id')
        if (r.error) errors.push(`${tabla} ${columna}=${id}: ${r.error.message}`)
        else n += r.data?.length ?? 0
      }
    }
    return n
  }

  // 3) Grupos de los torneos barridos (cascade: tournament_group_players), así
  //    las rondas quedan libres de la FK NO ACTION.
  await borrar('tournament_groups', 'tournament_id', torneos)
  // 4) Rondas (cascade: jugadores, equipos, membresía, pairings).
  const rondasBorradas = await borrar('rondas_libres', 'id', rondas)
  // 5) Torneos (cascade: categorías, jugadores, rondas del torneo, premios…).
  const torneosBorrados = await borrar('tournaments', 'id', torneos)

  return { tournaments: torneosBorrados, rondas: rondasBorradas, errors }
}
