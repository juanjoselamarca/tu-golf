/**
 * Prod canary: el jugador no escribe directo players / rounds / hole_scores / ronda_libre_jugadores.
 *
 * Toda escritura del jugador pasa por /api/game y /api/torneos (service role, con sus validaciones:
 * torneo activo, jugador no retirado, ronda propia) o por los RPC SECURITY DEFINER de ronda libre
 * (`upsert_ronda_libre_scores`, `finalizar_ronda_libre`). Las políticas "Jugador se inscribe",
 * "Jugador gestiona ronda", "Jugador carga scores" y "Jugador edita scores" dejaban saltarse eso
 * con la anon key; las sacó la migración 20261019120000 (hoy en la base).
 *
 * En ronda_libre_jugadores quedó viva la equivalente, `jugador_update_scores`: como `startTournament`
 * le crea a cada inscrito su fila CON su user_id, cualquier jugador de torneo podía hacer PATCH de su
 * handicap (su neto en el leaderboard), de su tarjeta y de su ronda_id (meterse en una ronda ajena).
 * La saca 20261030120000; esa misma migración le quita a authenticated los permisos de escritura de
 * rounds y hole_scores, que ninguna policy autorizaba desde 20261019120000.
 *
 * El canario exige que no vuelva ninguna de las dos cosas. Solo lectura. Se salta sin la service role key.
 *
 * Los dos barridos llevan CONTROL POSITIVO: traen además una tabla que SÍ debe salir en la lista
 * (import_jobs, donde el dueño gestiona sus propios jobs; players, donde el organizador escribe con la
 * sesión) y el assert exige verla. Sin eso el canario pasa en vacío si la consulta deja de cazar: el regex
 * vivía dentro de un template literal, que se come los `\` antes de que Postgres los vea (`\s` -> `s`),
 * así que desde el 19-oct devolvía 0 filas siempre. Por eso va con String.raw.
 */
import { describe, it, expect, beforeAll } from 'vitest'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { execSql } from '../helpers/prod-sql'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

/** Tablas donde el jugador no debe poder escribir + import_jobs como control positivo. */
const TABLAS_POLICY = `'players', 'rounds', 'hole_scores', 'ronda_libre_jugadores', 'import_jobs'`
/** rounds y hole_scores no deben tener permisos de escritura + players como control positivo. */
const TABLAS_GRANT = `'rounds', 'hole_scores', 'players'`

describe.skipIf(!url || !serviceKey)('RLS: escritura directa del jugador', () => {
  let service: SupabaseClient
  let delJugador: string[]
  let escrituraAuthenticated: string[]

  beforeAll(async () => {
    service = createClient(url!, serviceKey!, { auth: { autoRefreshToken: false, persistSession: false } })
    const filas = await execSql<{ p: string }>(
      service,
      String.raw`select tablename || '.' || policyname as p from pg_policies
       where schemaname = 'public' and tablename in (${TABLAS_POLICY}) and cmd <> 'SELECT'
         and coalesce(qual, '') || ' ' || coalesce(with_check, '')
             ~ '(user_id\s*=\s*auth\.uid\(\)|auth\.uid\(\)\s*=\s*\w*\.?user_id)'
       order by 1`,
    )
    delJugador = filas.map((f) => f.p)
    // role_column_grants ve también los grants por columna (un GRANT UPDATE(gross_score) no aparece en
    // role_table_grants); DELETE no existe por columna, así que se suma la vista de tabla.
    const grants = await execSql<{ g: string }>(
      service,
      `select g from (
         select table_name || '.' || privilege_type as g from information_schema.role_column_grants
          where table_schema = 'public' and grantee = 'authenticated'
            and table_name in (${TABLAS_GRANT}) and privilege_type <> 'SELECT'
         union
         select table_name || '.' || privilege_type from information_schema.role_table_grants
          where table_schema = 'public' and grantee = 'authenticated'
            and table_name in (${TABLAS_GRANT}) and privilege_type <> 'SELECT'
       ) u order by g`,
    )
    escrituraAuthenticated = grants.map((f) => f.g)
  })

  it('no queda ninguna política de escritura del jugador', () => {
    // Control positivo: import_jobs sí tiene las suyas (el dueño gestiona sus propios jobs). Si el barrido
    // deja de cazar, esto se pone rojo en vez de pasar en vacío.
    expect(delJugador).toEqual(['import_jobs.import_jobs_insert_own', 'import_jobs.import_jobs_update_own'])
  })

  it('authenticated no tiene permisos de escritura en rounds ni hole_scores', () => {
    // Control positivo: players los conserva — el organizador inscribe, cambia el tee y retira con la sesión
    // (src/lib/data/tournaments/players.ts, scoring.ts).
    expect(escrituraAuthenticated).toEqual(['players.DELETE', 'players.INSERT', 'players.UPDATE'])
  })
})
