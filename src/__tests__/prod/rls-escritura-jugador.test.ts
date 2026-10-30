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
 * TRES COSAS QUE ESTE CANARIO APRENDIÓ A LA MALA (no quitarlas):
 *
 * 1. `String.raw`. El regex vivía dentro de un template literal normal, que se come los `\` antes de que
 *    Postgres los vea (`\s` -> `s`, `\(\)` -> `()`, grupo vacío que Postgres acepta sin error): devolvía
 *    0 filas SIEMPRE y pasaba en vacío desde el 19-oct.
 * 2. Control positivo de cardinalidad, en un test aparte. Cada barrido trae una tabla que SÍ debe salir en
 *    la lista (import_jobs, donde el dueño gestiona sus propios jobs; players, donde el organizador escribe
 *    con la sesión) y un test exige verla. Sin eso, un barrido que deja de cazar — o un `exec_sql` que deja
 *    de correr como owner — pasa en vacío. Va separado del test de protección para que una policy o un grant
 *    nuevos y legítimos en la tabla de control NO pongan el canario rojo por buenas noticias.
 * 3. Los permisos se le preguntan al RUNTIME (`has_table_privilege` / `has_any_column_privilege`), no al
 *    catálogo. `information_schema.role_*_grants` no ve lo concedido a PUBLIC ni lo que llega por herencia de
 *    roles, y la vista de tabla tampoco ve los grants por columna (un `GRANT UPDATE(gross_score)` se le
 *    escapaba). Las funciones resuelven las tres cosas, y el barrido incluye anon además de authenticated.
 */
import { describe, it, expect, beforeAll } from 'vitest'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { execSql } from '../helpers/prod-sql'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

/** Tablas donde el jugador no debe poder escribir. */
const PROTEGIDAS = ['players', 'rounds', 'hole_scores', 'ronda_libre_jugadores']
/** Control positivo del barrido de policies: el dueño sí gestiona sus propios import jobs. */
const CONTROL_POLICY = 'import_jobs'
/** Tablas que no deben tener NINGÚN permiso de escritura. */
const SIN_ESCRITURA = ['rounds', 'hole_scores']
/** Control positivo del barrido de permisos: players los conserva (el organizador escribe con la sesión). */
const CONTROL_GRANT = 'players'

const enLista = (xs: string[], tabla: string) => xs.filter((x) => x.includes(`.${tabla}.`) || x.startsWith(`${tabla}.`))
const fueraDe = (xs: string[], tabla: string) => xs.filter((x) => !enLista([x], tabla).length)
const comillas = (xs: string[]) => xs.map((x) => `'${x}'`).join(', ')

describe.skipIf(!url || !serviceKey)('RLS: escritura directa del jugador', () => {
  let service: SupabaseClient
  let delJugador: string[]
  let escritura: string[]

  beforeAll(async () => {
    service = createClient(url!, serviceKey!, { auth: { autoRefreshToken: false, persistSession: false } })
    // `~*` y el `(select auth.uid())` opcional: Supabase recomienda ese envoltorio por rendimiento y
    // pg_policies lo imprime como `(user_id = ( SELECT auth.uid() AS uid))`. Sin eso, la misma policy
    // reintroducida con el idioma nuevo se escapaba del barrido.
    const filas = await execSql<{ p: string }>(
      service,
      String.raw`select tablename || '.' || policyname as p from pg_policies
       where schemaname = 'public' and cmd <> 'SELECT'
         and tablename in (${comillas([...PROTEGIDAS, CONTROL_POLICY])})
         and coalesce(qual, '') || ' ' || coalesce(with_check, '')
             ~* '(user_id\s*=\s*\(?\s*(select\s+)?auth\.uid\(\)|auth\.uid\(\)(\s+as\s+\w+)?\s*\)?\s*=\s*\w*\.?user_id)'
       order by 1`,
    )
    delJugador = filas.map((f) => f.p)
    // has_any_column_privilege no acepta DELETE ni TRUNCATE (no existen por columna): van solo por tabla.
    const grants = await execSql<{ g: string }>(
      service,
      `select r.rol || '.' || t.tabla || '.' || p.priv as g
         from (values ('anon'), ('authenticated')) r(rol),
              (values ${[...SIN_ESCRITURA, CONTROL_GRANT].map((t) => `('${t}')`).join(', ')}) t(tabla),
              (values ('INSERT'), ('UPDATE'), ('DELETE'), ('TRUNCATE'), ('REFERENCES')) p(priv)
        where has_table_privilege(r.rol, 'public.' || t.tabla, p.priv)
           or (p.priv in ('INSERT', 'UPDATE', 'REFERENCES')
               and has_any_column_privilege(r.rol, 'public.' || t.tabla, p.priv))
        order by 1`,
    )
    escritura = grants.map((f) => f.g)
  })

  it('los dos barridos cazan algo (control positivo de cardinalidad)', () => {
    expect(enLista(delJugador, CONTROL_POLICY)).not.toEqual([])
    expect(enLista(escritura, CONTROL_GRANT)).not.toEqual([])
  })

  it('no queda ninguna política de escritura del jugador', () => {
    expect(fueraDe(delJugador, CONTROL_POLICY)).toEqual([])
  })

  it('ni anon ni authenticated tienen permisos de escritura en rounds ni hole_scores', () => {
    expect(fueraDe(escritura, CONTROL_GRANT)).toEqual([])
  })
})
