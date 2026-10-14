import { SUPABASE_CREDENTIAL_VARS } from '../../../scripts/lib/supabase-ref.mjs'

// Unit tests run without database credentials, same as CI: a test that needs a database belongs in the
// integration project (test database) or the prod project (prod-canarios.yml).
for (const name of SUPABASE_CREDENTIAL_VARS) {
  delete process.env[name]
}
