import { adminClient, deleteEphemeralUser, EMAIL_EFIMERO, getTestUserId } from './ronda-fixture'

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
 * - Usuarios efímeros (`createEphemeralUser`): sólo los que calzan EXACTO con
 *   `EMAIL_EFIMERO` (dominio inexistente + timestamp de 13 dígitos). Quedan
 *   cuando la corrida se cancela antes del `afterAll` o el borrado choca con una
 *   FK NO ACTION; el 16-oct-2026 había 46 en prod, con rondas y tarjetas.
 */

export interface SweepOptions {
  olderThanMinutes?: number
  dryRun?: boolean
}

export interface SweepResult {
  tournaments: number
  rondas: number
  usuarios: number
  errors: string[]
}

const BATCH = 100
/** Página por debajo del tope de PostgREST (db-max-rows 1.000): si el tope baja, igual no trunca. */
const PAGE = 500
const MIN_AGE_MINUTES = 45

export interface UsuarioAuth {
  id: string
  email?: string | null
  created_at: string
}

/** Usuarios efímeros de test creados antes de `cutoff`. Nunca una cuenta fija ni un correo real. */
export function usuariosEfimerosABarrer(usuarios: UsuarioAuth[], cutoff: string): string[] {
  return usuarios
    .filter((u) => !!u.email && EMAIL_EFIMERO.test(u.email) && Date.parse(u.created_at) < Date.parse(cutoff))
    .map((u) => u.id)
}

/** Todos los usuarios de auth, por páginas (la Admin API pagina de a 1.000 como máximo). */
async function todosLosUsuarios(admin: ReturnType<typeof adminClient>): Promise<UsuarioAuth[]> {
  const out: UsuarioAuth[] = []
  for (let page = 1; ; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 })
    if (error) throw new Error(`listUsers: ${error.message}`)
    out.push(...data.users)
    if (data.users.length < 1000) return out
  }
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

  // Si la Admin API falla, el barrido de torneos y rondas sigue igual.
  let efimeros: string[] = []
  try {
    efimeros = usuariosEfimerosABarrer(await todosLosUsuarios(admin), cutoff)
  } catch (err) {
    errors.push(`usuarios efímeros: ${err instanceof Error ? err.message : String(err)}`)
  }

  if (opts.dryRun) return { tournaments: torneos.length, rondas: rondas.length, usuarios: efimeros.length, errors }

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

  // 6) Usuarios efímeros sobrantes (sus rondas primero: FK NO ACTION).
  let usuariosBorrados = 0
  for (const id of efimeros) {
    const errs = await deleteEphemeralUser(id)
    if (errs.length === 0) usuariosBorrados++
    errors.push(...errs)
  }

  return { tournaments: torneosBorrados, rondas: rondasBorradas, usuarios: usuariosBorrados, errors }
}
