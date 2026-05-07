import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { createAdminClient } from '@/lib/supabaseAdmin'
import { isAdmin } from '@/lib/admin'

export const dynamic = 'force-dynamic'

// GET /api/admin/e2e/runs/[id] — detalle de una corrida (con results expandidos)
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!(await isAdmin(user?.id, supabase))) {
    return NextResponse.json({ error: 'No tienes permisos' }, { status: 403 })
  }

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('e2e_runs')
    .select('*')
    .eq('id', id)
    .single()

  if (error || !data) {
    return NextResponse.json({ error: error?.message ?? 'Run no encontrado' }, { status: 404 })
  }
  return NextResponse.json({ run: data })
}
