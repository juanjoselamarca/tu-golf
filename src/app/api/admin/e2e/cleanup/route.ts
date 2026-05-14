import { NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { createAdminClient } from '@/lib/supabaseAdmin'
import { isAdmin } from '@/lib/admin'

export const dynamic = 'force-dynamic'

// POST /api/admin/e2e/cleanup
// Invoca cleanup_old_e2e_runs() (migration 040):
//   - Marca como 'timeout' runs >30min en queued/running sin callback.
//   - Borra runs terminales >90 días.
// Devuelve { timed_out, deleted } con conteos. Idempotente.
//
// Manual: para correr antes de un sprint. Automático: pg_cron lo invoca
// nightly cuando lo configuremos.
export async function POST() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!(await isAdmin(user?.id, supabase))) {
    return NextResponse.json({ error: 'No tienes permisos' }, { status: 403 })
  }

  const admin = createAdminClient()
  const { data, error } = await admin.rpc('cleanup_old_e2e_runs')

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // rpc devuelve array de rows con (timed_out, deleted)
  const row = Array.isArray(data) ? data[0] : data
  return NextResponse.json({
    timed_out: row?.timed_out ?? 0,
    deleted: row?.deleted ?? 0,
  })
}
