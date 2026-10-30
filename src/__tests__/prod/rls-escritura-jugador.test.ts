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
 */
import { describe, it, expect, beforeAll } from 'vitest'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { execSql } from '../helpers/prod-sql'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

describe.skipIf(!url || !serviceKey)('RLS: escritura directa del jugador', () => {
  let service: SupabaseClient
  let delJugador: string[]
  let escrituraAuthenticated: string[]

  beforeAll(async () => {
    service = createClient(url!, serviceKey!, { auth: { autoRefreshToken: false, persistSession: false } })
    const filas = await execSql<{ p: string }>(
      service,
      `select tablename || '.' || policyname as p from pg_policies
       where schemaname = 'public'
         and tablename in ('players', 'rounds', 'hole_scores', 'ronda_libre_jugadores') and cmd <> 'SELECT'
         and coalesce(qual, '') || ' ' || coalesce(with_check, '')
             ~ '(user_id\s*=\s*auth\.uid\(\)|auth\.uid\(\)\s*=\s*\w*\.?user_id)'
       order by 1`,
    )
    delJugador = filas.map((f) => f.p)
    // rounds y hole_scores: ninguna policy de escritura, así que el permiso tampoco. players sí conserva los
    // suyos (el organizador inscribe, edita el tee y retira con la sesión) y queda fuera.
    const grants = await execSql<{ g: string }>(
      service,
      `select table_name || '.' || privilege_type as g from information_schema.role_table_grants
       where table_schema = 'public' and grantee = 'authenticated'
         and table_name in ('rounds', 'hole_scores') and privilege_type <> 'SELECT'
       order by 1`,
    )
    escrituraAuthenticated = grants.map((f) => f.g)
  })

  it('no queda ninguna política de escritura del jugador', () => {
    expect(delJugador).toEqual([])
  })

  it('authenticated no tiene permisos de escritura en rounds ni hole_scores', () => {
    expect(escrituraAuthenticated).toEqual([])
  })
})
