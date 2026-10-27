import { esLoopback, PROD_REF, projectRefDe } from '../../scripts/lib/supabase-ref.mjs'

/**
 * Corta la corrida si apunta a PRODUCCIÓN. Los specs escriben (torneos en curso, rondas en /en-vivo) por la app y con
 * la service key: solo corren contra la app local y la base de pruebas, vía `scripts/test-db/e2e-local.mjs`. Lo único
 * que corre contra el deploy real es el smoke de páginas públicas, con su propia config (`playwright.monitoreo.config.ts`).
 * Falla cerrada: una URL que no se reconoce (vacía, dominio propio) no prueba que NO sea prod. Un
 * Supabase local (`supabase start`) cuenta como base de pruebas.
 */
export function exigirBaseDePruebas(baseURLs: (string | undefined)[], supabaseURL: string | undefined): void {
  const uso = 'correr con node --env-file=.env.local scripts/test-db/e2e-local.mjs -- <specs>'
  const supabase = supabaseURL?.trim()
  const ref = projectRefDe(supabase)
  if (!esLoopback(supabase) && (!ref || ref === PROD_REF)) {
    throw new Error(`[e2e] NEXT_PUBLIC_SUPABASE_URL no es la base de pruebas: ${uso}`)
  }
  if (!baseURLs.length || !baseURLs.every(esLoopback)) {
    throw new Error(`[e2e] la app tiene que ser la local, no ${baseURLs.find(u => !esLoopback(u)) ?? '(sin baseURL)'}: ${uso}`)
  }
}
