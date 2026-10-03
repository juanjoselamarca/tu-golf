import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { saludDeLaBase, HEALTH_QUERY_TIMEOUT_MS } from '@/lib/health-check'

export const dynamic = 'force-dynamic'

// Por qué hay caché, una sola consulta en vuelo y timeout: ver src/lib/health-check.ts (incidente 02-oct-2026).
export async function GET() {
  const { ok, ms, cached } = await saludDeLaBase(async () => {
    const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!)
    const { error } = await supabase
      .from('profiles')
      .select('id', { head: true })
      .limit(1)
      .abortSignal(AbortSignal.timeout(HEALTH_QUERY_TIMEOUT_MS))
    // Un "permission denied" (42501) es una respuesta de la base: está arriba. Si algún día se
    // revoca el SELECT de anon sobre profiles, el banner no debe anunciar una caída que no existe.
    return !error || error.code === '42501'
  })
  return NextResponse.json(
    { status: ok ? 'ok' : 'degraded', timestamp: new Date().toISOString(), supabase: ok, responseTime: ms, cached },
    { status: ok ? 200 : 503 },
  )
}
