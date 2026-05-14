/**
 * Cleanup del user de test creado por seed-coach-visual-test.mjs.
 * ON DELETE CASCADE en profiles → elimina todas las filas dependientes.
 */

import { createClient } from '@supabase/supabase-js'

const userId = process.argv[2]
if (!userId) {
  console.error('Usage: node --env-file=.env.local scripts/seed-coach-visual-cleanup.mjs <user_id>')
  process.exit(1)
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !serviceRole) {
  console.error('Missing env vars')
  process.exit(1)
}

const admin = createClient(url, serviceRole, { auth: { autoRefreshToken: false, persistSession: false } })

const { error } = await admin.auth.admin.deleteUser(userId)
if (error) {
  console.error('Cleanup failed:', error.message)
  process.exit(1)
}
console.log(`✓ Deleted test user ${userId} and all cascade rows`)
