import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { createAdminClient } from '@/lib/supabaseAdmin'
import { isAdmin } from '@/lib/admin'
import { checkRateLimit } from '@/lib/rate-limit'
export const dynamic = 'force-dynamic'

// Queries de escritura prohibidas — solo SELECT permitido
const FORBIDDEN_PATTERNS = /\b(INSERT|UPDATE|DELETE|DROP|ALTER|CREATE|TRUNCATE|GRANT|REVOKE|EXEC|EXECUTE)\b/i

const MAX_QUERY_LENGTH = 5000

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!(await isAdmin(user?.id, supabase))) return NextResponse.json({ error: 'No tienes permisos para acceder a este recurso' }, { status: 403 })

  // Rate limit: 5 queries por minuto por admin
  const rl = checkRateLimit(`admin-sql:${user!.id}`, 5, 60 * 1000)
  if (!rl.allowed) {
    return NextResponse.json({ error: 'Demasiadas consultas. Espera un momento.' }, { status: 429 })
  }

  const admin = createAdminClient()
  const body = await request.json()
  const { query } = body

  if (!query || typeof query !== 'string') {
    return NextResponse.json({ error: 'Se requiere una consulta SQL' }, { status: 400 })
  }

  if (query.length > MAX_QUERY_LENGTH) {
    return NextResponse.json({ error: `Query excede el límite de ${MAX_QUERY_LENGTH} caracteres` }, { status: 400 })
  }

  // SEGURIDAD: Solo permitir queries de lectura (SELECT)
  if (FORBIDDEN_PATTERNS.test(query)) {
    await admin.from('analytics_events').insert({
      event_type: 'admin_action',
      user_id: user!.id,
      metadata: { action: 'sql_blocked', entity: 'database', details: { query, reason: 'write_operation_forbidden' } },
    })
    return NextResponse.json({ error: 'Solo consultas SELECT están permitidas. Las operaciones de escritura están bloqueadas por seguridad.' }, { status: 403 })
  }

  // Log de auditoría
  await admin.from('analytics_events').insert({
    event_type: 'admin_action',
    user_id: user!.id,
    metadata: { action: 'execute_sql_readonly', entity: 'database', details: { query, timestamp: new Date().toISOString() } },
  })

  const { data, error } = await admin.rpc('exec_sql', { query })

  if (error) {
    return NextResponse.json({
      error: error.message,
      hint: error.message.includes('exec_sql')
        ? 'La función exec_sql no existe en Supabase. Contactar al administrador.'
        : undefined,
    }, { status: 500 })
  }

  return NextResponse.json({ result: data })
}
