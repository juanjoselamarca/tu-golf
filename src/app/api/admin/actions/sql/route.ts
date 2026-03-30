import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { createAdminClient } from '@/lib/supabaseAdmin'
import { isAdmin } from '@/lib/admin'
export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!(await isAdmin(user?.id, supabase))) return NextResponse.json({ error: 'No tienes permisos para acceder a este recurso' }, { status: 403 })

  const admin = createAdminClient()
  const body = await request.json()
  const { query } = body

  if (!query || typeof query !== 'string') {
    return NextResponse.json({ error: 'Se requiere una consulta SQL' }, { status: 400 })
  }

  // Log the query (but NOT the results) for security
  await admin.from('analytics_events').insert({
    event_type: 'admin_action',
    user_id: user!.id,
    metadata: { action: 'execute_sql', entity: 'database', details: { query } },
  })

  const { data, error } = await admin.rpc('exec_sql', { query })

  if (error) {
    return NextResponse.json({
      error: error.message,
      hint: error.message.includes('exec_sql')
        ? 'The exec_sql RPC function may not exist. Create it in Supabase: CREATE OR REPLACE FUNCTION exec_sql(sql text) RETURNS json AS $$ BEGIN RETURN (SELECT json_agg(row_to_json(t)) FROM (EXECUTE sql) t); END; $$ LANGUAGE plpgsql SECURITY DEFINER;'
        : undefined,
    }, { status: 500 })
  }

  return NextResponse.json({ result: data })
}
