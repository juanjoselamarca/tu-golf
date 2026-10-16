import { PROD_REF, projectRefDe } from '../../scripts/lib/supabase-ref.mjs'

/**
 * Corta un spec que siembra datos visibles (torneos en curso, rondas en /en-vivo) si la base es la de PRODUCCIÓN.
 *
 * `playwright.config.ts` apunta a prod por defecto y carga `.env.local` con la service key de prod: sin esta guarda,
 * un `npx playwright test` directo escribe en prod. Esos specs corren por `scripts/test-db/e2e-local.mjs`, que repunta
 * las credenciales a la base de pruebas. Se lanza (no `skip`) para que se vea rojo y no se lea como verde.
 * Mismo criterio que `src/__tests__/setup/test-db-guard.ts` para los tests de integración.
 */
export function exigirBaseDePruebas(spec: string): void {
  if (projectRefDe(process.env.NEXT_PUBLIC_SUPABASE_URL) === PROD_REF) {
    throw new Error(`${spec}: solo corre contra la base de pruebas (node --env-file=.env.local scripts/test-db/e2e-local.mjs -- ${spec} --project=mobile-chromium-auth)`)
  }
}
