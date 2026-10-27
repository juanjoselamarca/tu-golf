/**
 * Prod canary: el jugador de un torneo no escribe directo players / rounds / hole_scores.
 *
 * Toda escritura del jugador pasa por /api/game y /api/torneos (service role, con sus validaciones:
 * torneo activo, jugador no retirado, ronda propia). Las políticas "Jugador se inscribe",
 * "Jugador gestiona ronda", "Jugador carga scores" y "Jugador edita scores" dejaban saltarse eso
 * con la anon key; las sacó la migración 20261019120000 (hoy en la base). El canario exige que no vuelva ninguna.
 *
 * Solo lectura. Se salta sin la service role key.
 */
import { describe, it, expect, beforeAll } from 'vitest'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { execSql } from '../helpers/prod-sql'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

describe.skipIf(!url || !serviceKey)('RLS: escritura directa del jugador en torneos', () => {
  let service: SupabaseClient
  let delJugador: string[]

  beforeAll(async () => {
    service = createClient(url!, serviceKey!, { auth: { autoRefreshToken: false, persistSession: false } })
    const filas = await execSql<{ p: string }>(
      service,
      `select tablename || '.' || policyname as p from pg_policies
       where schemaname = 'public' and tablename in ('players', 'rounds', 'hole_scores') and cmd <> 'SELECT'
         and coalesce(qual, '') || ' ' || coalesce(with_check, '')
             ~ '(user_id\\s*=\\s*auth\\.uid\\(\\)|auth\\.uid\\(\\)\\s*=\\s*\\w*\\.?user_id)'
       order by 1`,
    )
    delJugador = filas.map((f) => f.p)
  })

  it('no queda ninguna política de escritura del jugador', () => {
    expect(delJugador).toEqual([])
  })
})
