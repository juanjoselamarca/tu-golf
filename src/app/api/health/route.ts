import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

export async function GET() {
  const start = Date.now()
  let supabaseOk = false

  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    )
    const { error } = await supabase.from('profiles').select('id', { count: 'exact', head: true })
    supabaseOk = !error
  } catch {
    supabaseOk = false
  }

  const responseTime = Date.now() - start
  const status = supabaseOk ? 'ok' : 'degraded'

  return NextResponse.json(
    {
      status,
      timestamp: new Date().toISOString(),
      supabase: supabaseOk,
      responseTime,
    },
    { status: supabaseOk ? 200 : 503 }
  )
}
