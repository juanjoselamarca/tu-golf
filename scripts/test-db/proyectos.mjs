/**
 * Origen (prod) y destino (base de pruebas) de scripts/test-db/. Fuente única de la guarda que impide
 * escribir en producción: TODO script de esta carpeta que escribe pasa por `resolverProyectos()`.
 *
 * La base de pruebas es un 2º proyecto Supabase Free (`golfersplus-test`, creado el 08-oct-2026 tras el
 * incidente del torneo Los Leones: el CI le pegaba a la BD de prod). Ver docs/claude/base-de-pruebas.md.
 */
import { projectRefDe } from '../lib/supabase-ref.mjs'
import { apiGet } from '../lib/management-sql.mjs'

export const NOMBRE_PROYECTO_PRUEBAS = 'golfersplus-test'

/**
 * → { prod, pruebas } (project refs). Lanza si falta algo, si son el mismo proyecto o si el destino no es,
 * por nombre en la Management API, el proyecto de pruebas. Nunca devuelve prod como destino.
 *  env: NEXT_PUBLIC_SUPABASE_URL (prod, sólo lectura) · TEST_SUPABASE_URL (pruebas) · SUPABASE_ACCESS_TOKEN
 */
export async function resolverProyectos(env = process.env) {
  const prod = projectRefDe(env.NEXT_PUBLIC_SUPABASE_URL)
  const pruebas = projectRefDe(env.TEST_SUPABASE_URL)
  if (!prod) throw new Error('falta NEXT_PUBLIC_SUPABASE_URL (origen, prod) con formato https://<ref>.supabase.co')
  if (!pruebas) throw new Error('falta TEST_SUPABASE_URL (destino, base de pruebas) con formato https://<ref>.supabase.co')
  if (!env.SUPABASE_ACCESS_TOKEN) throw new Error('falta SUPABASE_ACCESS_TOKEN')
  if (prod === pruebas) throw new Error(`origen y destino son el MISMO proyecto (${prod}): abortado para no tocar prod`)
  const [p, t] = await Promise.all([apiGet(`/projects/${prod}`), apiGet(`/projects/${pruebas}`)])
  if (t.name !== NOMBRE_PROYECTO_PRUEBAS) {
    throw new Error(`el destino ${pruebas} se llama "${t.name}", no "${NOMBRE_PROYECTO_PRUEBAS}": abortado para no tocar otra base`)
  }
  if (p.name === NOMBRE_PROYECTO_PRUEBAS) throw new Error('el origen es la base de pruebas: NEXT_PUBLIC_SUPABASE_URL debe apuntar a prod')
  if (t.status !== 'ACTIVE_HEALTHY') {
    throw new Error(`la base de pruebas está ${t.status} (¿pausada por inactividad? restaurarla desde el dashboard o POST /v1/projects/${pruebas}/restore)`)
  }
  return { prod, pruebas }
}
