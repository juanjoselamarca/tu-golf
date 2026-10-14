import { PROD_REF, projectRefDe } from '../../../scripts/lib/supabase-ref.mjs'

for (const name of ['NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_URL']) {
  if (projectRefDe(process.env[name]) === PROD_REF) {
    throw new Error(`${name} points to production: run integration tests through scripts/test-db/con-base-de-pruebas.mjs`)
  }
}
