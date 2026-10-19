/**
 * Prod canary: el jugador de un torneo no escribe directo players / rounds / hole_scores.
 *
 * Toda escritura del jugador pasa por /api/game y /api/torneos (service role, con sus validaciones:
 * torneo activo, jugador no retirado, ronda propia). Las políticas "Jugador se inscribe",
 * "Jugador gestiona ronda", "Jugador carga scores" y "Jugador edita scores" dejaban saltarse eso
 * con la anon key; las saca 20261019120000_rls_quitar_escritura_directa_jugador_torneo.sql.
 *
 * Mientras la migración no esté aplicada, el canario exige que la migración las cubra todas
 * (ninguna política de escritura del jugador fuera de su lista); una vez aplicada, que no quede ninguna.
 *
 * Solo lectura. Se salta sin la service role key.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, it, expect, beforeAll } from 'vitest'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { execSql } from '../helpers/prod-sql'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

const VERSION = '20261019120000'
const MIGRACION = join(process.cwd(), 'supabase/migrations', `${VERSION}_rls_quitar_escritura_directa_jugador_torneo.sql`)

/** "tabla.política" que la migración borra, leídas del archivo (no copiadas a mano). */
function politicasQueBorra(): string[] {
  const sql = readFileSync(MIGRACION, 'utf8')
  return [...sql.matchAll(/drop policy if exists "([^"]+)" on public\.(\w+);/gi)].map((m) => `${m[2]}.${m[1]}`).sort()
}

describe.skipIf(!url || !serviceKey)('RLS: escritura directa del jugador en torneos', () => {
  let service: SupabaseClient
  let delJugador: string[]
  let aplicada: boolean

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
    const ledger = await execSql<{ n: number }>(
      service,
      `select count(*)::int as n from supabase_migrations.schema_migrations where version = '${VERSION}'`,
    )
    aplicada = ledger[0]?.n === 1
  })

  it('la migración borra exactamente las 4 políticas del jugador', () => {
    expect(politicasQueBorra()).toEqual([
      'hole_scores.Jugador carga scores',
      'hole_scores.Jugador edita scores',
      'players.Jugador se inscribe',
      'rounds.Jugador gestiona ronda',
    ])
  })

  it('no queda (o no quedará) ninguna política de escritura del jugador', () => {
    if (aplicada) expect(delJugador).toEqual([])
    else {
      // Antes de aplicarla las 4 siguen en prod: si la consulta no ve ninguna, el regex está roto y el canario pasaría en vacío.
      expect(delJugador.length).toBeGreaterThan(0)
      for (const p of delJugador) expect(politicasQueBorra()).toContain(p)
    }
  })
})
