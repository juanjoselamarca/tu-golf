import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { saludDeLaBase, HEALTH_QUERY_TIMEOUT_MS } from '@/lib/health-check'

export const dynamic = 'force-dynamic'

// Por qué hay caché, una sola consulta en vuelo y timeout: ver src/lib/health-check.ts (incidente 02-oct-2026).
export async function GET() {
  const { ok, ms, cached } = await saludDeLaBase(async () => {
    const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!)
    const { error, status } = await supabase
      .from('profiles')
      .select('id', { head: true })
      .limit(1)
      .abortSignal(AbortSignal.timeout(HEALTH_QUERY_TIMEOUT_MS))
    // Un "permission denied" (42501 → HTTP 403) es la base respondiendo: está arriba. HEAD no trae
    // cuerpo, así que postgrest-js no puede leer `code`: se reconoce por el status. Un timeout da 0.
    return !error || status === 403
  })
  return NextResponse.json(
    { status: ok ? 'ok' : 'degraded', timestamp: new Date().toISOString(), supabase: ok, responseTime: ms, cached },
    { status: ok ? 200 : 503 },
  )
}
