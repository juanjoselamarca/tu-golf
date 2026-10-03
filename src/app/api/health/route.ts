import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { saludDeLaBase } from '@/lib/health-check'

export const dynamic = 'force-dynamic'

// Por qué hay caché y una consulta mínima: ver src/lib/health-check.ts (incidente 02-oct-2026).
export async function GET() {
  const { ok, ms, cached } = await saludDeLaBase(async () => {
    const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!)
    const { error } = await supabase.from('profiles').select('id', { head: true }).limit(1)
    return !error
  })
  return NextResponse.json(
    { status: ok ? 'ok' : 'degraded', timestamp: new Date().toISOString(), supabase: ok, responseTime: ms, cached },
    { status: ok ? 200 : 503 },
  )
}
